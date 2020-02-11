## 线程状态与保存

- [代码][code]

如果将整个运行中的内核看作一个**内核进程**，那么一个**内核线程**只负责内核进程中**执行**的部分。虽然我们之前从未提到过内核线程的概念，但是在我们设置完启动栈，并跳转到 `rust_main` 之后，我们的第一个内核线程——**内核启动线程**就已经在运行了！

### 线程的状态

想想一个线程何以区别于其他线程。由于线程是负责“执行”，因此我们要通过线程当前的**执行状态（也称线程上下文，线程状态，Context）**来描述线程的当前执行情况（也称执行现场）。也就包括：

- CPU 各寄存器的状态：

  简单想想，我们会特别关心程序运行到了哪里：即 $$\text{PC}$$ ；还有栈顶的位置：即 $$\text{SP}$$ 。

  当然，其他所有的寄存器都是一样重要的。

- 线程的栈里面的内容：

  首先，我们之前提到过，寄存器和栈支持了函数调用与参数传递机制；

  其次，我们在函数中用到的局部变量其实都是分配在栈上的。它们在进入函数时被压到栈上，在从函数返回时被回收。而事实上，这些变量的局部性不只限于这个函数，还包括执行函数代码的线程。

  这是因为，同个进程的多个线程使用的是不同的栈，因此分配在一个线程的栈上的那些变量，都只有这个线程自身会访问。（通常，虽然理论上一个线程可以访问其他线程的栈，但由于并无什么意义，我们不会这样做）

  与之相比，放在程序的数据段中的全局变量（或称静态变量）则是所有线程都能够访问。数据段包括只读数据段 $$\text{.rodata}$$ ，可读可写的 $$\text{.data,.bss}$$ 。在线程访问这些数据时一定要多加小心，因为你并不清楚是不是有其他线程同时也在访问，这会带来一系列问题。

### 线程状态的保存

一个线程不会总是占据 CPU 资源，因此在执行过程中，它可能会被切换出去；之后的某个时刻，又从其他线程切换回来，为了线程能够像我们从未将它切换出去过一样继续正常执行，我们要保证切换前后**线程的执行状态不变**。

其他线程不会修改当前线程的栈，因此栈上的内容保持不变；但是 CPU 跑去执行其他代码去了，CPU 各寄存器的状态势必发生变化，所以我们要将 CPU 当前的状态（各寄存器的值）保存在当前线程的栈上，以备日后恢复。但是我们也并不需要保存所有的寄存器，事实上只需保存：

- 返回地址 $$\text{ra}$$
- 页表寄存器 $$\text{satp}$$（考虑到属于同一进程的线程间共享一个页表，这一步不是必须的）
- 被调用者保存寄存器 $$\text{s}_0\sim\text{s}_{11}$$

这与线程切换的实现方式有关，我们到时再进行说明。

### 线程的实现

首先是线程在栈上保存的内容：

```rust
// src/context.rs

// 回忆属性 #[repr(C)] 是为了让 rust 编译器以 C 语言的方式
// 按照字段的声明顺序分配内存
// 从而可以利用汇编代码正确地访问它们
#[repr(C)]
pub struct ContextContent {
    pub ra: usize,
    satp: usize,
    s: [usize; 12],
    tf: TrapFrame,
}
```

前三个分别对应 $$\text{ra,satp,s}_0\sim\text{s}_{11}$$，那最后为什么还有个中断帧呢？实际上，我们通过中断帧，来利用中断机制的一部分来进行线程初始化。我们马上就会看到究竟是怎么回事。

```rust
// src/context.rs

#[repr(C)]
pub struct Context {
    pub content_addr: usize,
}
```

对于一个被切换出去的线程，为了能够有朝一日将其恢复回来，由于它的状态已经保存在它自己的栈上，我们唯一关心的就是其栈顶的地址。我们用结构体 `Context` 来描述被切换出去的线程的状态。

随后开一个新的 `process` mod ，在里面定义线程结构体 `Thread` 。

```rust
// src/process/structs.rs
pub struct Thread {
    // 线程的状态
    pub context: Context,
    // 线程的栈
    pub kstack: KernelStack,
}
```

`Thread`里面用到了内核栈 `KernelStack` ：

```rust
// src/consts.rs
pub const KERNEL_STACK_SIZE: usize = 0x80000;

// src/process/structs.rs
pub struct KernelStack(usize);
impl KernelStack {
    pub fn new() -> Self {
        let bottom = unsafe {
            alloc(Layout::from_size_align(KERNEL_STACK_SIZE, KERNEL_STACK_SIZE).unwrap()) as usize
        };
        KernelStack(bottom)
    }
}
impl Drop for KernelStack {
    fn drop(&mut self) {
       ......
                dealloc(
                    self.0 as _,
                    Layout::from_size_align(KERNEL_STACK_SIZE, KERNEL_STACK_SIZE).unwrap(),
                );
        ......
    }
}
```

在使用 `KernelStack::new` 新建一个内核栈时，我们使用第四章所讲的动态内存分配，从堆上分配一块虚拟内存作为内核栈。然而 `KernelStack` 本身只保存这块内存的起始地址。其原因在于当线程生命周期结束后，作为 `Thread` 一部分的 `KernelStack` 实例被回收时，由于我们实现了 `Drop` Trait ，该实例会调用 `drop` 函数将创建时分配的那块虚拟内存回收，从而避免内存溢出。当然。如果是空的栈就不必回收了。

因此，我们是出于自动回收内核栈的考虑将 `KernelStack` 放在 `Thread` 中。另外，需要注意**压栈操作导致栈指针是从高地址向低地址变化；出栈操作则相反**。

下一节，我们来看如何进行线程切换。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch6-pa4
