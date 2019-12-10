## 手动触发断点中断

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/e40df6d48101f53a06e46e266372820ed8e17f33)

我们引入一个对寄存器进行操作的库，这样就可以不用自己写了。
```rust
// Cargo.toml

[dependencies]
riscv = { git = "https://github.com/rcore-os/riscv", features = ["inline-asm"] }
```

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

这里我们通过设置 stvec 使得所有中断都跳转到 ``trap_handler`` 并将其作为中断处理程序。而这个中断处理程序仅仅输出了一下中断原因以及中断发生的地址，就匆匆 panic 了事。

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

使用 ``make run``构建并运行，结果如下：

> **[success] trap handled**
> ```rust
> ++++ setup interrupt! ++++
> trap: cause: Exception(Breakpoint), epc: 0x0x80200022
> panicked at 'trap handled!', src/interrupt.rs:20:5
> ```

可见在进入中断处理程序之前，硬件为我们正确的设置好了 ``scause,sepc`` 寄存器；随后我们正确的进入了设定的中断处理程序。

如果输出与预期不一致的话，可以在[这里](https://github.com/rcore-os/rCore_tutorial/tree/e40df6d48101f53a06e46e266372820ed8e17f33)找到目前的代码进行参考。

