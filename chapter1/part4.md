## 移除 runtime 依赖

* [代码][CODE]

对于大多数语言，他们都使用了 **运行时系统(runtime system)** ，这导致 main 并不是他们执行的第一个函数。

以 Rust 语言为例：一个典型的链接了标准库的 Rust 程序会首先跳转到 C runtime library 中的 **crt0(C runtime zero)** 进入C runtime 设置 C 程序运行所需要的环境(比如：创建堆栈，设置寄存器参数等)。

然后 C runtime 会跳转到 Rust runtime 的 **入口点(entry point)** 进入 Rust runtime 继续设置 Rust 运行环境，而这个入口点就是被 ``start`` 语义项标记的。Rust runtime 结束之后才会调用 main 进入主程序。

C runtime 和 Rust runtime 都需要标准库支持，我们的程序无法访问。如果覆盖了 ``start`` 语义项，仍然需要 ``crt0``，并不能解决问题。所以需要重写覆盖 ``crt0`` 入口点：

```rust
// src/main.rs

#![no_std] // don't link the Rust standard library
#![no_main] // disable all Rust-level entry points

use core::panic::PanicInfo;
// This function is called on panic.
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

#[no_mangle] // don't mangle the name of this function
pub extern "C" fn _start() -> ! {
    // this function is the entry point, since the linker looks for a function named `_start` by default
    loop {}
}
```

我们加上 ``#![no_main]`` 告诉编译器我们不用常规的入口链。

同时我们实现一个 ``_start`` 函数，并加上 ``#[no_mangle]`` 告诉编译器对于此函数禁用 name mangling ，确保编译器生成一个名为 ``_start`` 的函数，而非为了保证函数名字唯一性而生成的形如 `` _ZN3blog_os4_start7hb173fedf945531caE `` 乱码般的名字。由于 ``_start`` 是大多数系统的默认入口点名字，所以我们要确保它不会发生变化。

接着，我们使用 ``extern "C"`` 描述 ``_start`` 函数，这是 Rust 中的 FFI (Foreign Function Interface, 语言交互接口) 语法，表示此函数是一个 C 函数而非 Rust 函数。由于 ``_start`` 是作为 C runtime 的入口点，看起来合情合理。

返回值类型为``!``表明这个函数是发散的，不允许返回。由于这个函数被操作系统或 bootloader 直接调用，这样做是必须的。为了从入口点函数退出，我们需要通过 ``exit`` 系统调用，但我们目前还没法做到这一步，因此就让它在原地转圈吧。

由于程序会一直停在 C runtime crt0 的入口点，我们可以移除没用的 ``main`` 函数，并加上 ``![no_main]`` 表示不用不使用普通的入口点那套理论。

再次 ``cargo build`` ，我们即将面对这一章中的最后一个错误！

> **[danger] cargo build error**
> 
> ``linking with `cc` failed: exit code: 1``
> 

这个错误同样与 C runtime 有关，尽管 C runtime 的入口点已经被我们覆盖掉了，我们的项目仍默认链接 C runtime，因此需要一些 C 标准库 (libc) 的内容，由于我们禁用了标准库，我们也同样需要禁用常规的 C 启动例程。

将 ``cargo build`` 换成以下命令：

> **[success] build passed**
>
> ```bash
> $ cargo rustc -- -C link-arg=-nostartfiles
> Compiling os v0.1.0 ...
> Finished dev [unoptimized + debuginfo] target(s) in 4.87s
> ```
>

我们终于构建成功啦！虽然最后这个命令之后并不会用到，但是暂时看到了一个 success 不也很好吗？

构建得到的可执行文件位置放在 ``os/target/debug/os`` 中。

迄今为止的代码可以在[这里][CODE]找到，构建出现问题的话可以参考。

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/77ecc4e8
