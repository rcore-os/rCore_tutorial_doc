## 安装nightly rust

rust 包含：stable、beta、nightly 三个版本。默认情况下我们安装的是 stable 。由于在编写操作系统时需要使用 rust 的一些不稳定的实验功能，所以我们使用如下命令安装rust工具链管理器rustup、rust包管理器cargo，并切换到rust的nightly版本。

```sh
curl https://sh.rustup.rs -sSf | sh
# reboot
rustup default nightly
```

安装成功后使用``rustc --version``或者``rustup show``查看当前rust的版本，确认我们已经切换到了nightly版本。

```sh
$ rustc --version
rustc 1.40.0-nightly (fae75cd21 2019-10-26)
```
