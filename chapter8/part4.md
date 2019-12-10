## 创建用户线程

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/6880114bb5d4370bb7ce8133f94cf084f0f4d7c1)

```rust
// src/process/structs.rs

use xmas_elf::{
    header,
    ElfFile,
};
use crate::memory::memory_set::{
	MemorySet,
	handler::ByFrame,
	attr::MemoryAttr
};

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
至今为止的所有代码可以在[这里](https://github.com/rcore-os/rCore_tutorial/tree/6880114bb5d4370bb7ce8133f94cf084f0f4d7c1)找到。