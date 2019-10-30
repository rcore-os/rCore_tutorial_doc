# 第二章：最小化内核

## 本章提纲

这一章的内容还是很多的，我现在想先深入去做一些其他的功能，这部分文档回来再补。

暂时先列一个提纲：

1. 目标三元组编译指定目标平台的可执行文件

2. 描述我们所期望的虚拟内存布局，并使用链接脚本指定

3. 将默认的elf格式的文件转为binary

4. 使用opensbi作为bootloader，介绍此时内存布局

5. 介绍页表知识，虚拟内存与物理内存，覆盖_start入口点切换到虚拟内存模式，并确认与内核的期望布局一致

   > wrj说由于Rust编译器不完善，导致只支持0x80000000以下和0xffffffff80000000以上的物理地址，而我们内核所在的物理地址为0x80200000，这导致不切换到虚存模式很多数据都没办法访问，因此我们只能在这一步就开启虚存模式
   >
   > 这算是啥啊......

6. 调用OpenSBI提供的服务进行简单的字符输出，使用Qemu模拟，并提供Makefile

7. 支持格式化输出，输出一些虚拟地址对于内存布局进一步认识、使得 panic 可以在屏幕上输出错误信息

目前先放在这里，等有时间了再回来完善。

## 本章概要

本章你将会学到：

1. 使用**目标三元组**描述目标平台，并进行**交叉编译**将我们的内核可执行程序编译到目标平台——riscv64上去
2. 使用OpenSBI启动我们的内核，并用硬件模拟器Qemu进行模拟
3. 修改之前的入口``_start``，并在里面进行一些初始化
4. 使用OpenSBI提供的服务，在屏幕上格式化打印字符串用于以后调试

本章的代码可以在[这里]()找到。

## 自定义目标三元组

cargo 在编译项目时，可以附加目标参数 `--target <target triple>` 设置项目的目标平台。平台包括硬件和软件支持，事实上， **目标三元组(target triple)** 包含：cpu 架构、供应商、操作系统和 [ABI](https://stackoverflow.com/questions/2171177/what-is-an-application-binary-interface-abi/2456882#2456882) 。

安装rust时，默认编译后的可执行文件要在本平台上执行，我们可以使用

``rustc --version --verbose``来查看rust的默认目标三元组：

```sh
rustc 1.40.0-nightly (fae75cd21 2019-10-26)
binary: rustc
commit-hash: fae75cd216c481de048e4951697c8f8525669c65
commit-date: 2019-10-26
host: x86_64-unknown-linux-gnu
release: 1.40.0-nightly
LLVM version: 9.0
```

在``host``处可以看到默认的目标三元组，cpu架构为``x86_64``，供应商为``unknown``，操作系统为``linux``，ABI为``gnu``。由于我们是在64位ubuntu上安装的rust，这个默认目标三元组的确描述了本平台。

官方对一些平台提供了默认的目标三元组。但由于我们在编写自己的新操作系统，所以所有官方提供的目标三元组都不适用。幸运的是，rust 允许我们用JSON文件定义自己的目标三元组。

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

可以看到里面描述了架构、CPU、操作系统、ABI、端序、字长等信息。我们可以仿照这个给出一个目标平台为``riscv64``的目标三元组，这里直接给出定义：

```json
// os/riscv64-os.json

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
"panic-strategy": "abort",
```

回忆上一章中，我们在``Cargo.toml``中设置程序在``panic``时直接``abort``，从而不必调用堆栈展开处理函数。我们可以将设置移到目标三元组中，从而可以将``Cargo.toml``中的设置删除了。

```json
"pre-link-args": {
    "ld.lld": [
      "-Tsrc/boot/linker64.ld"
    ]
}
```

``ld``是一个链接工具，用来指定目标文件的内存布局。而我们可以使用``-T``来给这个链接工具指定一个链接脚本。这里，表明我们指定了一个放在``os/src/boot/linker64.ld``的链接脚本。

## 使用链接脚本设置内核内存布局

暂时先不解释了，我都不知道弄没弄对...

```c
// os/src/boot/linker64.ld

/* Copy from bbl-ucore : https://ring00.github.io/bbl-ucore      */

/* Simple linker script for the ucore kernel.
   See the GNU ld 'info' manual ("info ld") to learn the syntax. */

OUTPUT_ARCH(riscv)
ENTRY(_start)

BASE_ADDRESS = 0xffffffffc0200000;

SECTIONS
{
    /* Load the kernel at this address: "." means the current address */
    . = BASE_ADDRESS;
    start = .;

    .text : {
        stext = .;
        *(.text.entry)
        *(.text .text.*)
        . = ALIGN(4K);
        etext = .;
    }

    .rodata : {
        srodata = .;
        *(.rodata .rodata.*)
        . = ALIGN(4K);
        erodata = .;
    }

    .data : {
        sdata = .;
        *(.data .data.*)
        edata = .;
    }

    .stack : {
        *(.bss.stack)
    }

    .bss : {
        sbss = .;
        *(.bss .bss.*)
        ebss = .;
    }

    PROVIDE(end = .);
}
```

## 使用OpenSBI进行内核启动

```makefile
# os/Makefile

target := riscv64-os
mode := debug
kernel := target/$(target)/$(mode)/os
bin := target/$(target)/$(mode)/kernel.bin

kernel:
	@cargo xbuild --target $(target).json
$(bin): kernel
	@riscv64-unknown-elf-objcopy $(kernel) --strip-all -O binary $@
build: $(bin)

# see https://github.com/riscv/opensbi/blob/master/docs/platform/qemu_virt.md
qemu: 
	@qemu-system-riscv64 \
		-machine virt \
		-nographic \
		-kernel opensbi/opensbi_rv64.elf \
		-device loader,file=$(bin),addr=0x80200000
run: build qemu
```

这页表，你说它不香嘛？？？