## 内核线程初始化

- [代码][code]

回忆一下我们如何进行启动线程的初始化？无非两步：设置栈顶地址、跳转到内核入口地址。从而变为启动线程的初始状态，并准备开始运行。

其他线程的初始化也差不多。事实上我们要构造一个停止的线程状态，使得一旦其他的进程切换到它，就立刻变为我们想要的该线程的初始状态，并可以往下运行。

### 构造线程状态信息

首先是要新建一个内核栈，然后在栈上压入我们精心构造的线程状态信息。

```rust
// src/context.rs
impl ContextContent {
    // 为一个新内核线程构造栈上的初始状态信息
    // 其入口点地址为 entry ，其内核栈栈顶地址为 kstack_top ，其页表为 satp
    fn new_kernel_thread(
        entry: usize,
        kstack_top: usize,
        satp: usize,
        ) -> ContextContent {

        let mut content = ContextContent {
            ra: __trapret as usize,
            satp,
            s: [0; 12],
            tf: {
                let mut tf: TrapFrame = unsafe { zeroed() };
                tf.x[2] = kstack_top;
                tf.sepc = entry;
                tf.sstatus = sstatus::read();
                tf.sstatus.set_spp(sstatus::SPP::Supervisor);
                tf.sstatus.set_spie(true);
                tf.sstatus.set_sie(false);
                tf
            }
        };
        content
    }
}
```

首先 $$\text{satp}$$ 在 `switch_to` 中被正确设置。这里 $$\text{ra}$$ 的值为 `__trapret` ，因此当 `switch_to` 使用 `ret` 退出后会跳转到 `__trapret` 。而它是我们在中断处理返回时用来[恢复中断上下文](../chapter6/part4.md)的！实际上这里用 `__trapret` 仅仅是利用它来设置寄存器的初始值，而不是说它和中断有什么关系。

从 `switch_to` 返回之后，原栈顶的 $$\text{ra,satp,s}_0\sim\text{s}_{11}$$ 被回收掉了。因此现在栈顶上恰好保存了一个中断帧。那么我们从中断返回的视角来看待：栈顶地址会被正确设置为 `kstack_top` ，由于将中断帧的 $$\text{sepc}$$ 设置为线程入口点，因此中断返回后会通过 `sret` 跳转到线程入口点。

注意中断帧中 $$\text{sstatus}$$ 的设置：

- 将 $$\text{SPP}$$ 设置为 Supervisor ，使得使用 `sret` 返回后 CPU 的特权级为 S Mode 。
- 设置 $$\text{SIE,SPIE}$$，这里的作用是 `sret` 返回后，在内核线程中使能异步中断。详情请参考[RISC-V 特权指令集文档](https://riscv.org/specifications/privileged-isa/)。

我们还希望能够给线程传入参数，这只需要修改中断帧中的$$x_{10},x_{11},...,x_{17} $$（即参数$$a_0,a_1,...,a_7$$ ）即可，`__trapret` 函数可以协助完成参数传递。

```rust
// src/context.rs

impl Context {
    pub unsafe fn new_kernel_thread(
        entry: usize,
        kstack_top: usize,
        satp: usize
        ) -> Context {
        ContextContent::new_kernel_thread(entry, kstack_top, satp).push_at(kstack_top)
    }
    pub unsafe fn append_initial_arguments(&self, args: [usize; 3]) {
        let contextContent = &mut *(self.content_addr as *mut ContextContent);
        contextContent.tf.x[10] = args[0];
        contextContent.tf.x[11] = args[1];
        contextContent.tf.x[12] = args[2];
    }
}
impl ContextContent {
    // 将自身压到栈上，并返回 Context
    unsafe fn push_at(self, stack_top: usize) -> Context {
        let ptr = (stack_top as *mut ContextContent).sub(1);
        *ptr = self;
        Context { content_addr: ptr as usize }
    }
}
```

### 创建新线程

接下来就是线程的创建：

```rust
// src/process/structs.rs
impl Thread {
    // 创建一个新线程，放在堆上
    pub fn new_kernel(entry: usize) -> Box<Thread> {
        unsafe {
            let kstack_ = KernelStack::new();
            Box::new(Thread {
                // 内核线程共享内核资源，因此用目前的 satp 即可
                context: Context::new_kernel_thread(entry, kstack_.top(), satp::read().bits()), kstack: kstack_,
            })
        }
    }
    // 为线程传入初始参数
    pub fn append_initial_arguments(&self, args: [usize; 3]) {
        unsafe { self.context.append_initial_arguments(args); }
    }
}
```

下一节我们终于能拨云见日，写一个测试看看我们的线程实现究竟有无问题了！

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch6-pa4
