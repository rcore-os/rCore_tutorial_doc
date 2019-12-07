## 线程初始化

回忆一下我们如何进行启动线程的初始化？无非两步：设置栈顶地址、跳转到内核入口地址。从而变为启动线程的初始状态，并准备开始运行。

其他线程的初始化也差不多。事实上我们要构造一个停止的线程状态，使得一旦其他的进程切换到它，就立刻变为我们想要的该线程的初始状态，并可以往下运行。

首先是要新建一个内核栈，然后在栈上压入我们精心构造的线程状态信息。

```rust
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

首先 $$\text{satp}$$ 在 ``switch_to`` 中被正确设置。这里 $$\text{ra}$$ 的值为 ``__trapret`` ，因此当 ``switch_to`` 使用 ``ret`` 退出后会跳转到 ``__trapret`` 。而它是我们在中断处理返回时用来恢复中断上下文的！实际上这里用 ``__trapret`` 仅仅是利用它来设置寄存器的初始值，而不是说它和中断有什么关系。

从 ``switch_to`` 返回之后，原栈顶的 $$\text{ra,satp,s}_0\sim\text{s}_{11}$$ 被回收掉了。因此现在栈顶恰好是一个中断帧。那么我们从中断返回的视角来看待：栈顶地址会被正确设置为 ``kstack_top`` ，由于将中断帧的 $$\text{sepc}$$ 设置为线程入口点，因此中断返回后会通过 ``sret`` 跳转到线程入口点。

注意中断帧中 $$\text{sstatus}$$ 的设置：

* 将 $$\text{SPP}$$ 设置为 Supervisor ，使得使用 ``sret`` 返回后 CPU 的特权级为 S Mode 。
* 设置 $$\text{SIE,SPIE}$$，这里的作用是 ``sret`` 返回后，在内核线程中使能异步中断。详情请参考 RISC-V 特权指令集文档。