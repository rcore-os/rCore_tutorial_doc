## 手动触发断点中断

- [代码][code]

如要让 OS 正确处理各种中断，首先 OS 在初始化时，需要设置好中断处理程序的起始地址，并使能中断。

我们引入一个对寄存器进行操作的库，这样就可以不用自己写了。

```rust
// Cargo.toml

[dependencies]
riscv = { git = "https://github.com/rcore-os/riscv", features = ["inline-asm"] }
```

### 设置中断处理程序起始地址

为了方便起见，我们先将 stvec 设置为 Direct 模式跳转到一个统一的处理程序。

```rust
// src/lib.rs

mod interrupt;

// src/interrupt.rs

use riscv::register::{
    scause,
    sepc,
    stvec,
    sscratch
};

pub fn init() {
    unsafe {
        sscratch::write(0);
        stvec::write(trap_handler as usize, stvec::TrapMode::Direct);
    }
    println!("++++ setup interrupt! ++++");
}

fn trap_handler() -> ! {
    let cause = scause::read().cause();
    let epc = sepc::read();
    println!("trap: cause: {:?}, epc: 0x{:#x}", cause, epc);
    panic!("trap handled!");
}
```

这里我们通过设置 stvec 使得所有中断都跳转到 `trap_handler` 并将其作为中断处理程序。而这个中断处理程序仅仅输出了一下中断原因以及中断发生的地址，就匆匆 panic 了事。

> **[info] 初始化时为何将`sscratch`寄存器置 0？**
>
> 将`sscratch`寄存器置 0 也许让人费解，我们会在[**part4 实现上下文环境保存与恢复**](part4.md)中 j 进一步详细分析它的作用。简单地说，这里的设置是为了在产生中断是根据 sscratch 的值是否为 0 来判断是在 S 态产生的中断还是 U 态（用户态）产生的中断。由于这里还没有 U 态的存在，所以这里是否置 0 其实并无影响。

我们在主函数中通过汇编指令手动触发断点中断：

```rust
// src/init.rs

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    crate::interrupt::init();
    unsafe {
        asm!("ebreak"::::"volatile");
    }
    panic!("end of rust_main");
}
```

使用 `make run`构建并运行，你可能能看到以下的正确结果：

> **[success] trap handled**
>
> ```rust
> ++++ setup interrupt! ++++
> trap: cause: Exception(Breakpoint), epc: 0x0x80200022
> panicked at 'trap handled!', src/interrupt.rs:20:5
> ```

但是很不巧，你有差不多相同的概率看到以下和我们预期不同的的结果：

> **[danger] 非预期的显示结果**

> ```rust
> ++++ setup interrupt! ++++
> ++++ setup interrupt! ++++
> ......
> ```

内核进入了 Boot loop？

### 保证异常处理入口对齐

为何没有异常处理程序的显示，而是 qemu 模拟的 riscv 计算机不断地重新启动？根据 RV64 ISA，异常处理入口必须按照四字节对齐，但是我们现在的代码并没有保证这一点。因此我们在设置 stvec 的时候，事实上最低两位地址被置零了，发生异常的时候可能直接跳转到了我们的异常处理程序的第一条指令中间。显然，这很大概率会导致各种各样的奇怪条件，之后跑飞。

很遗憾是，Rust 没有简单地办法保证一个符号的对齐，此外使用纯 Rust 实现 Trap handler 还有一些其他的问题：Rust 会在函数的开始和结尾加入一些额外的指令，控制栈寄存器等。因此如果要完成保存现场等工作，以便在异常处理程序完成后返回，Rust 单独是难以完成的。接下来几节中我们将通过提供使用汇编代码编写的异常处理程序来解决这些问题。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch3-pa2
