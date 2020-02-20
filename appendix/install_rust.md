# 安装 rust

## 安装 rustup

`rustup` 是 rust 的工具链管理器，通过它可以下载 rust 工具链（类似 `apt-get install gcc` 的感觉）。如果官方途径下载遇到了困难，可以尝试以下方法：

```bash
export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup
curl https://sh.rustup.rs -sSf | sh
```

如果还是失败了，手动下载安装脚本：在浏览器里输入 `https://sh.rustup.rs` ，将下载的脚本中 `RUSTUP_UPDATE_ROOT:-https://static.rust-lang.org/rustup` 改为 `RUSTUP_UPDATE_ROOT:-https://mirrors.ustc.edu.cn/rust-static/rustup` （科大源），运行脚本即可。

## rustup 换源

参考：https://mirrors.tuna.tsinghua.edu.cn/help/rustup/

## crate.io 换源

新建文件 `~/.cargo/config` ，在里面输入如下内容：

```
[source.crates-io]
registry = "https://github.com/rust-lang/crates.io-index"
replace-with = 'ustc'
[source.ustc]
registry = "git://mirrors.ustc.edu.cn/crates.io-index"
```
