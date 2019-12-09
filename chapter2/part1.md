## 使用目标三元组描述目标平台

cargo 在编译项目时，可以附加目标参数 `--target <target triple>` 设置项目的目标平台。平台包括硬件和软件支持，事实上， **目标三元组(target triple)** 包含：cpu 架构、供应商、操作系统和 [ABI](https://stackoverflow.com/questions/2171177/what-is-an-application-binary-interface-abi/2456882#2456882) 。

安装 rust 时，默认编译后的可执行文件要在本平台上执行，我们可以使用

``rustc --version --verbose``来查看rust的默认目标三元组：

```bash
$ rustc --version --verbose
rustc 1.40.0-nightly (fae75cd21 2019-10-26)
binary: rustc
commit-hash: fae75cd216c481de048e4951697c8f8525669c65
commit-date: 2019-10-26
host: x86_64-unknown-linux-gnu
release: 1.40.0-nightly
LLVM version: 9.0
```

在 ``host`` 处可以看到默认的目标三元组， cpu 架构为 ``x86_64`` ，供应商为 ``unknown`` ，操作系统为 ``linux`` ，ABI 为 ``gnu`` 。由于我们是在 64 位 ubuntu 上安装的 rust ，这个默认目标三元组的确描述了本平台。

官方对一些平台提供了默认的目标三元组。但由于我们在编写自己的新操作系统，所以所有官方提供的目标三元组都不适用。幸运的是，rust 允许我们用 JSON 文件定义自己的目标三元组。

首先我们来看一下默认的目标三元组 **x86_64-unknown-linux-gnu** 的 **JSON** 文件描述：

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

可以看到里面描述了架构、 CPU 、操作系统、 ABI 、端序、字长等信息。而我们想基于 $$64$$ 位 ``riscv`` 架构开发内核，确切的说，是基于 ``RV64I`` 指令集，再加上若干拓展。我们直接给出我们所使用的目标三元组：

```json
// riscv64-os.json

{
  "llvm-target": "riscv64",
  "data-layout": "e-m:e-p:64:64-i64:64-n64-S128",
  "target-endian": "little",
  "target-pointer-width": "64",
  "target-c-int-width": "32",
  "os": "none",
  "arch": "riscv64",
  "cpu": "generic-rv64",
  "features": "+m,+a,+c",
  "max-atomic-width": "64",
  "linker": "rust-lld",
  "linker-flavor": "ld.lld",
  "pre-link-args": {
    "ld.lld": [
      "-Tsrc/boot/linker64.ld"
    ]
  },
  "executables": true,
  "panic-strategy": "abort",
  "relocation-model": "static",
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
    "x86-interrupt"
  ],
  "eliminate-frame-pointer": false
}
```

我们来看两个与默认的目标三元组有着些许不同的地方：

```json
// riscv64-os.json

"panic-strategy": "abort",
```

第一个不同的地方是 ``panic`` 时采取的策略。回忆上一章中，我们在 ``Cargo.toml`` 中设置程序在 ``panic`` 时直接 ``abort`` ，从而不必调用堆栈展开处理函数。

我们可以将设置移到目标三元组中，从而可以将 ``Cargo.toml`` 中的设置删除了。但是同样的设置，这里设置为 ``abort`` 的含义却是在程序 ``panic`` 时调用 ``abort`` 函数。所以要把这个 ``abort`` 函数写出来：

```rust
// src/main.rs
#[no_mangle]
extern "C" fn abort() -> ! {
    panic!("abort!");
}
```

你可能觉得这种在 ``abort`` 中再次 ``panic`` 会引起某种死循环，不过事实上这个函数压根不会被调用，所以我们想写什么都可以。当然，前提是要能够通过编译。

```json
// riscv64-os.json

"pre-link-args": {
    "ld.lld": [
      "-Tsrc/boot/linker64.ld"
    ]
}
```

第二个不同的地方则是通过**链接脚本**指定了程序的**内存布局**。我们将在下一节中详细说明。
