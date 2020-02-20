## 安装 nightly Rust

- [代码][code]

我们首先使用如下命令安装 Rust 工具链管理器 rustup 和 Rust 包管理器 cargo：

```bash
$ curl https://sh.rustup.rs -sSf | sh
```

> 如果安装 rust 的过程中出现了困难，可以阅读 [附录：安装 rust](../appendix/install_rust.md)

Rust 包含：stable、beta、nightly 三个版本。默认情况下我们安装的是 stable 稳定版。由于在编写操作系统时需要使用 Rust 的一些不稳定的实验功能，因此我们使用 nightly 每日构建版。

但是，由于官方不保证 nightly 版本的 ABI 稳定性，也就意味着今天写的代码用未来的 nightly 可能无法编译通过，因此一般在使用 nightly 时应该锁定一个日期。

我们在工作目录下创建一个名为 `rust-toolchain` 的文件（无后缀），并在其中写入所需的工具链版本：

```
nightly-2020-01-27
```

今后所有在这个目录下使用 Rust 时都会自动切换到这个版本的工具链。

> 随着日后的更新，后面的日期可能会变化，请以 [GitHub](https://github.com/rcore-os/rCore_tutorial/blob/master/rust-toolchain) 上的版本为准

我们可以使用 `rustc --version` 或者 `rustup show` 查看当前 Rust 的版本，确认我们已经切换到了 nightly 版本。

```bash
$ rustc --version
rustc 1.42.0-nightly (6d3f4e0aa 2020-01-25)
```

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch1-pa4
