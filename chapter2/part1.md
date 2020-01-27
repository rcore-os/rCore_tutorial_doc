## 使用目标三元组描述目标平台

* [代码][CODE]

cargo 在编译项目时，可以附加目标参数 `--target <target triple>` 设置项目的目标平台。平台包括硬件和软件支持，事实上， **目标三元组(target triple)** 包含：cpu 架构、供应商、操作系统和 [ABI](https://stackoverflow.com/questions/2171177/what-is-an-application-binary-interface-abi/2456882#2456882) 。

安装 Rust 时，默认编译后的可执行文件要在本平台上执行，我们可以使用

``rustc --version --verbose``来查看 Rust 的默认目标三元组：

```bash
$ rustc --version --verbose
rustc 1.42.0-nightly (859764425 2020-01-07)
binary: rustc
commit-hash: 85976442558bf2d09cec3aa49c9c9ba86fb15c1f
commit-date: 2020-01-07
host: x86_64-unknown-linux-gnu
release: 1.42.0-nightly
LLVM version: 9.0
```

在 ``host`` 处可以看到默认的目标三元组， cpu 架构为 ``x86_64`` ，供应商为 ``unknown`` ，操作系统为 ``linux`` ，ABI 为 ``gnu`` 。由于我们是在 64 位 ubuntu 上安装的 Rust ，这个默认目标三元组的确描述了本平台。

官方对一些平台提供了默认的目标三元组，我们可以通过以下命令来查看完整列表：

```sh
rustc --print target-list
```

### 目标三元组 JSON 描述文件

除了默认提供的以外，Rust 也允许我们用 JSON 文件定义自己的目标三元组。

首先我们来看一下默认的目标三元组 **x86_64-unknown-linux-gnu** 的 **JSON** 文件描述，输入以下命令：

```sh
rustc -Z unstable-options --print target-spec-json --target x86_64-unknown-linux-gnu
```

可以得到如下输出：

```json
// x86_64-unknown-linux-gnu.json
{
  "arch": "x86_64",
  "cpu": "x86-64",
  "data-layout": "e-m:e-i64:64-f80:128-n8:16:32:64-S128",
  "dynamic-linking": true,
  "env": "gnu",
  "executables": true,
  "has-elf-tls": true,
  "has-rpath": true,
  "is-builtin": true,
  "linker-flavor": "gcc",
  "linker-is-gnu": true,
  "llvm-target": "x86_64-unknown-linux-gnu",
  "max-atomic-width": 64,
  "os": "linux",
  "position-independent-executables": true,
  "pre-link-args": {
    "gcc": [
      "-Wl,--as-needed",
      "-Wl,-z,noexecstack",
      "-m64"
    ]
  },
  "relro-level": "full",
  "stack-probes": true,
  "target-c-int-width": "32",
  "target-endian": "little",
  "target-family": "unix",
  "target-pointer-width": "64",
  "vendor": "unknown"
}
```

可以看到里面描述了架构、 CPU 、操作系统、 ABI 、端序、字长等信息。

我们现在想基于 64 位 RISCV 架构开发内核，就需要一份 `riscv64` 的目标三元组。幸运的是，目前 Rust 编译器已经内置了一个可用的目标：`riscv64imac-unknown-none-elf`。

我们查看一下它的 JSON 描述文件：

```sh
rustc -Z unstable-options --print target-spec-json --target riscv64imac-unknown-none-elf
```

```json
// riscv64imac-unknown-none-elf.json
{
  "abi-blacklist": [
    "cdecl",
    "stdcall",
    "fastcall",
    "vectorcall",
    "thiscall",
    "aapcs",
    "win64",
    "sysv64",
    "ptx-kernel",
    "msp430-interrupt",
    "x86-interrupt",
    "amdgpu-kernel"
  ],
  "arch": "riscv64",
  "code-model": "medium",
  "cpu": "generic-rv64",
  "data-layout": "e-m:e-p:64:64-i64:64-i128:128-n64-S128",
  "eliminate-frame-pointer": false,
  "emit-debug-gdb-scripts": false,
  "env": "",
  "executables": true,
  "features": "+m,+a,+c",
  "is-builtin": true,
  "linker": "rust-lld",
  "linker-flavor": "ld.lld",
  "llvm-target": "riscv64",
  "max-atomic-width": 64,
  "os": "none",
  "panic-strategy": "abort",
  "relocation-model": "static",
  "target-c-int-width": "32",
  "target-endian": "little",
  "target-pointer-width": "64",
  "vendor": "unknown"
}
```

我们来看它与默认的目标三元组有着些许不同的地方：

```json
"panic-strategy": "abort",
```

这个描述了 ``panic`` 时采取的策略。回忆上一章中，我们在 ``Cargo.toml`` 中设置程序在 ``panic`` 时直接 ``abort`` ，从而不必调用堆栈展开处理函数。由于目标三元组中已经包含了这个参数，我们可以将 ``Cargo.toml`` 中的设置删除了：

```diff
-[profile.dev]
-panic = "abort"
-
-[profile.release]
-panic = "abort"
```

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/ch2-pa4
