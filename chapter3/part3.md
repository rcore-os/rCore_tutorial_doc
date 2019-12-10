## 程序运行上下文环境

* [代码][CODE]

考虑在中断发生之前，程序的运行状态(比如说一个很重要的中间结果)保存在一些寄存器中。而中断发生时，硬件仅仅帮我们设置中断原因、中断地址，随后就根据 ``stvec`` 直接跳转到中断处理程序。而中断处理程序可能会修改了那个保存了重要结果的寄存器，而后，即使处理结束后使用 ``sret`` 指令跳回到中断发生的位置，原来的程序也会一脸懵逼：这个中间结果怎么突然变了？

> **[info] 函数调用与 calling convention**
> 
> 其实中断处理也算是一种函数调用，而我们必须保证在函数调用前后上下文环境(包括各寄存器的值)不发生变化。而寄存器分为两种，一种是**调用者保存(caller-saved)**，也就是子程序可以肆无忌惮的修改这些寄存器而不必考虑后果，因为在进入子程序之前他们已经被保存了；另一种是**被调用者保存(callee-saved)**，即子程序必须保证自己被调用前后这些寄存器的值不变。
> 
> 函数调用还有一些其它问题，比如参数如何传递——是通过寄存器传递还是放在栈上。这些标准由指令集在[calling convention](https://riscv.org/wp-content/uploads/2015/01/riscv-calling.pdf)中规定，并由操作系统和编译器实现。
> 
> calling convention 是**二进制接口(ABI, Application Binary Interface)**的一个重要方面。在进行多语言同时开发时尤其需要考虑。设想多种语言的函数互相调来调去，那时你就只能考虑如何折腾寄存器了。
> 

简单起见，我们把全部寄存器都在调用前保存在栈上，并在调用后还原，这样总不会出错。我们使用一个名为**中断帧(TrapFrame)**的结构体来记录这些寄存器的值：
```rust
// src/lib.rs

mod context;

// src/context.rs

use riscv::register::{
    sstatus::Sstatus,
    scause::Scause,
};

#[repr(C)]
#[derive(Debug)]
pub struct TrapFrame {
    pub x: [usize; 32], // General registers
    pub sstatus: Sstatus, // Supervisor Status Register
    pub sepc: usize, // Supervisor exception program counter
    pub stval: usize, // Supervisor trap value
    pub scause: Scause, // Scause register: record the cause of exception/interrupt/trap
}
```

我们将$$32$$个通用寄存器全保存下来，同时还之前提到过的进入中断之前硬件会自动设置的三个寄存器，还有状态寄存器 ``sstatus`` 也会被修改。

其中属性``#[repr(C)]``表示对这个结构体按照 C 语言标准进行内存布局，即从起始地址开始，按照字段的声明顺序依次排列，如果不加上这条属性的话，Rust 编译器对它的内存布局是不确定的，我们就无法使用汇编代码对它进行正确的读写。

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/5d09d5eb
