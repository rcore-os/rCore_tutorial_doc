## 创建并运行进程

* [代码][CODE]

我们已经能建立应用程序了，内核也能够为应用程序建立用户态虚拟内存空间了。那离*在自己的内核上跑运行在用户态的应用程序*还缺啥？其实我们到了最后一步--**创建进程**！

> **[info]线程与进程进阶**
>
> 我们在[第六章**内核线**开始部分](../chapter6/introduction.md)简单介绍过进程，线程，以及二者的关系。现在要在OS中创建进程了，当然需要对进程有进一步的深入了解。
>
> **进程**表示正在运行程序，包括代码，数据，堆和栈。在大多数的进程实现中（但并非总是如此），每个进程都有自己的虚拟地址空间（即，自己的逻辑地址到物理内存的映射）和自己的系统资源集（如文件，环境变量等）。每个进程都有多个线程是很普遍的。这样，就有一个进程来维护地址空间，并有多个线程来控制进程的执行。
>
> **线程**是进程的控制流程。线程可以是“用户级别”（即进程处理自身内的多个线程，不用OS知道与参与）或“内核级别”（即通过OS的调度程序来调度多个线程。忘了？回忆一下[第七章**线程调度**](../chapter7/introduction.md)）。来自同一进程的两个线程自然会共享相同的代码和全局数据以及进程的系统资源，但是会具有不同的堆栈。以使它们不会干扰彼此的局部变量，并且可能具有自己的函数调用链。
>
> 代表进程控制流程的线程一般在用户模式（RISC-V的U Mode）下运行。当需要操作系统服务时，线程会执行系统服务请求命令，从而从用户模式切换到了内核模式（RISC-V的S Mode），由OS进行完成服务后，再返回到用户模式让线程继续执行。由于OS要应对不同线程的请求，所以在内核中，需要为每个线程准备好一个内核模式下的栈。所以在用户模式下的线程（简称**用户线程**）需要有两个栈（**用户模式栈和内核模式栈**）。

### 用户线程

#### 创建用户线程主体

用户线程的指令流来自于应用程序的代码段，全局变量等数据来自应用程序的数据段，所以需要解析应用程序ELF执行文件的内容，获取这些内容，并放到页表项USER位属性都是**1**的虚拟内存空间中（上一节就是干的这个事情，现在只需调用一下即可）。然后再创建用户模式栈和内核模式栈（注意，虽然都是内存，但它们的页表项的USER位属性是不同的）。

```rust
// src/process/structs.rs

impl Thread {
    // 新建内核线程
    // 传入参数为链接在内核中的用户程序
    pub unsafe fn new_user(data: &[u8]) -> Box<Thread> {
        // 确认合法性
        let elf = ElfFile::new(data).expect("failed to analyse elf!");

        match elf.header.pt2.type_().as_type() {
            header::Type::Executable => {
                println!("it really a executable!");
            },
            header::Type::SharedObject => {
                panic!("shared object is not supported!");
            },
            _ => {
                panic!("unsupported elf type!");
            }
        }
		// 获取入口点
        let entry_addr = elf.header.pt2.entry_point() as usize;
        // 为用户程序创建新的虚拟内存空间
        let mut vm = elf.make_memory_set();

        // 创建用户栈
        let mut ustack_top = {
            // 这里我们将用户栈固定在虚拟内存空间中的某位置
            let (ustack_bottom, ustack_top) = (USER_STACK_OFFSET, USER_STACK_OFFSET + USER_STACK_SIZE);
            // 将用户栈插入虚拟内存空间
            vm.push(
                ustack_bottom,
                ustack_top,
                // 注意这里设置为用户态
                MemoryAttr::new().set_user(),
                ByFrame::new(),
                None,
            );
            ustack_top
        };

		// 创建内核栈
        let kstack = KernelStack::new();

        Box::new(
            Thread {
                context: Context::new_user_thread(entry_addr, ustack_top, kstack.top(), vm.token()),
                kstack: kstack,
            }
        )
    }
}

// src/consts.rs

pub const USER_STACK_SIZE: usize = 0x80000;
pub const USER_STACK_OFFSET: usize = 0xffffffff00000000;
```

现在大概可以理解用户线程为何在中断时要从用户栈切换到内核栈了。如果不切换，内核的处理过程会留在用户栈上，使用用户程序可能访问到，这显然是很危险的。

#### 初始化内核栈 

用跟内核线程一样的方法进行线程栈上内容的初始化，注意切换过程总是在内核态执行的（无论是切换到 idle ，还是切换回来），因此栈上的内容要压到内核栈上。但是通过 ``__trapret`` 返回时却要将 $$\text{sp}$$ 设置为用户栈。

```rust
// src/context.rs

impl Context {
    ...
    pub unsafe fn new_user_thread(
        entry: usize,
        ustack_top: usize,
        kstack_top: usize,
        satp: usize
    ) -> Self {
        // 压到内核栈
        ContextContent::new_user_thread(entry, ustack_top, satp).push_at(kstack_top)
    }
}

impl ContextContent {
    fn new_user_thread(
        entry: usize,
        ustack_top: usize,
        satp: usize
    ) -> Self {
        ContextContent {
            ra: __trapret as usize,
            satp,
            s: [0; 12],
            tf: {
                let mut tf: TrapFrame = unsafe { zeroed() };
                // 利用 __trapret 返回后设置为用户栈
                tf.x[2] = ustack_top;
                // 设置 sepc 从而在 sret 之后跳转到用户程序入口点
                tf.sepc = entry;
                tf.sstatus = sstatus::read();
                tf.sstatus.set_spie(true);
                tf.sstatus.set_sie(false);
                // 设置 sstatus 的 spp 字段为 User
                // 从而在 sret 之后 CPU 的特权级将变为 U Mode
                tf.sstatus.set_spp(sstatus::SPP::User);
                tf
            }
        }
    }
}
```

现在我们的用户线程就创建完毕了。我们赶快把它跟我们之前创建的那些内核线程一起运行一下吧。

####　创建用户线程

在创建完 $$5$$ 个内核线程之后，我们创建自己的用户线程：

```rust
// src/process/mod.rs

pub fn init() {
    ...
    extern "C" {
        fn _user_img_start();
        fn _user_img_end();
    }
    let data = unsafe {
        core::slice::from_raw_parts(
            _user_img_start as *const u8,
            _user_img_end as usize - _user_img_start as usize,
        )
    };
    let user_thread = unsafe { Thread::new_user(data) };
    CPU.add_thread(user_thread);
    ...
}
```

同时，我们要修改一下构建内核的 Makefile ，将用户程序链接进去，用之前提到的方法：

```makefile
# Makefile
...
.PHONY: kernel build clean qemu run

# 新增
export USER_IMG = usr/rust/target/riscv64-rust/debug/hello_world

kernel:
	@cargo xbuild --target $(target).json
...
```

现在我们 ``make run`` 运行一下试试看，发现内核线程与用户线程能够在一起很好的工作了！

```shell
$ make run
......
<<<< switch_back to idle in idle_main!

>>>> will switch_to thread 5 in idle_main!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
thread 5 exited, exit code = 0

<<<< switch_back to idle in idle_main!

```

至今为止的所有代码可以在[这里][CODE]找到。

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/ch8-pa4
