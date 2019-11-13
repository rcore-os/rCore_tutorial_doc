## 编译、运行

### 交叉编译

我们利用 ``cargo build`` 并指定目标三元组进行构建，却出现了错误：

> **[danger] cargo build error**
>
> ```shell
> $ cargo build --target riscv64-os.json    
> Compiling os v0.1.0 (/home/shinbokuow/dev/os)
> error[E0463]: can't find crate for `core`
> |
> = note: the `riscv64-os-13881808482486489662` target may not be installed
> 
> error: aborting due to previous error
> 
> For more information about this error, try `rustc --explain E0463`.
> error: could not compile `os`.
> 
> To learn more, run the command again with --verbose.
> ```
>

错误的原因是：no_std 的程序会隐式地链接到我们上一章提到过的 rust 的 **core 库** 。 **core 库** 包含基础的 Rust 类型，如 Result、Option 和迭代器等。而这个库虽然不依赖操作系统，但依赖目标平台，需要根据目标三元组中的设置进行编译。我们在本平台上编译运行在其他平台上的程序，这个过程称为**交叉编译**。

Rust 工具链中默认只为原生的目标三元组提供了预编译好的 core 库，而我们在编写 os 时使用的是自定义的目标三元组 。因此我们需要为这些目标重新编译整个 **core 库** 。这时我们就需要 **cargo xbuild** 。这个工具封装了 cargo build 。同时，它将自动交叉编译 **core 库** 和一些 **编译器内建库(compiler built-in libraries)** 。我们可以用下面的命令安装它：

```shell
cargo install cargo-xbuild
```

现在运行命令来编译目标程序：

```shell
cargo xbuild --target riscv64-os.json
```

我们编译成功啦！

