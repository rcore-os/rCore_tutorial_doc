## 安装 nightly Rust

Rust 包含：stable、beta、nightly 三个版本。默认情况下我们安装的是 stable 稳定版。由于在编写操作系统时需要使用 Rust 的一些不稳定的实验功能，因此我们使用 nightly 每日构建版。

但是，由于官方不保证 nightly 版本的 ABI 稳定性，也就意味着今天写的代码用未来的 nightly 可能无法编译通过，因此一般在使用 nightly 时应该锁定一个日期。

我们使用如下命令安装 Rust 工具链管理器 rustup 和 Rust 包管理器 cargo，并切换到 Rust 的 nightly 版本。

```bash
$ curl https://sh.rustup.rs -sSf | sh
# reboot
$ rustup default nightly-2019-12-08
```

安装成功后使用 ``rustc --version`` 或者 ``rustup show`` 查看当前 Rust 的版本，确认我们已经切换到了 nightly 版本。

```bash
$ rustc --version
rustc 1.41.0-nightly (5c5c8eb86 2019-12-07)
```

