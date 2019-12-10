## 安装nightly rust

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/9900fd9c751761d262594053576ace8590610261)

rust 包含：stable、beta、nightly 三个版本。默认情况下我们安装的是 stable 。由于在编写操作系统时需要使用 rust 的一些不稳定的实验功能，所以我们使用如下命令安装 rust 工具链管理器 rustup、rust 包管理器 cargo，并切换到 rust 的 nightly 版本。

```bash
$ curl https://sh.rustup.rs -sSf | sh
# reboot
$ rustup default nightly
```

安装成功后使用 ``rustc --version`` 或者 ``rustup show`` 查看当前 rust 的版本，确认我们已经切换到了nightly版本。

```bash
$ rustc --version
rustc 1.40.0-nightly (fae75cd21 2019-10-26)
```

