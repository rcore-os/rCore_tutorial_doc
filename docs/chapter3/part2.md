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

使用 `make run`构建并运行，有结果，但不是想看到的：

> **[danger] 非预期的显示结果**

> ```rust
> ++++ setup interrupt! ++++
> ++++ setup interrupt! ++++
> ......
> ```

### 开启内核态中断使能

为何没有中断处理程序的显示，而是 qemu 模拟的 riscv 计算机不断地重新启动？仔细检查一下代码，发现在初始化阶段缺少使能中断这一步！
事实上寄存器 `sstatus` 中有一控制位 `SIE`，表示 S 态全部中断的使能。如果没有设置这个`SIE`控制位，那在 S 态是不能正常接受时钟中断的。需要对下面的代码进行修改，在初始化阶段添加使能中断这一步：

```rust
diff --git a/os/src/interrupt.rs b/os/src/interrupt.rs
...
@@ -2,13 +2,15 @@ use riscv::register::{
     scause,
     sepc,
     stvec,
-    sscratch
+    sscratch,
+    sstatus
 };

 pub fn init() {
     unsafe {
         sscratch::write(0);
         stvec::write(trap_handler as usize, stvec::TrapMode::Direct);
+        sstatus::set_sie();
     }
     println!("++++ setup interrupt! ++++");
 }

```

再使用 `make run`构建并运行，有预想的结果了！

> **[success] trap handled**
>
> ```rust
> ++++ setup interrupt! ++++
> trap: cause: Exception(Breakpoint), epc: 0x0x80200022
> panicked at 'trap handled!', src/interrupt.rs:20:5
> ```

可见在进入中断处理程序之前，硬件为我们正确的设置好了 `scause,sepc` 寄存器；随后我们正确的进入了设定的中断处理程序。如果输出与预期不一致的话，可以在[这里][code]找到目前的代码进行参考。

到目前为止，虽然能够响应中断了，但在执行完中断处理程序后，系统还无法返回到之前中断处继续执行。如何做到？请看下一节。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch3-pa2
