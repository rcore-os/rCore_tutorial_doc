## 编译、生成内核镜像

### 交叉编译

我们利用 ``cargo build`` 并指定目标三元组进行构建，却出现了错误：

> **[danger] cargo build error**
>
> ```bash
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

```bash
$ cargo install cargo-xbuild
```

现在运行命令来编译目标程序：

```bash
$ cargo xbuild --target riscv64-os.json
```

我们编译成功啦！

### 验证内存布局正确性

下载最新的预编译版本 [RISCV-GCC 工具链](https://static.dev.sifive.com/dev-tools/riscv64-unknown-elf-gcc-8.3.0-2019.08.0-x86_64-linux-ubuntu14.tar.gz) 并安装，如果该链接过期的话可以在[这里](https://www.sifive.com/boards#software)自己找。

我们编译之后的产物为 ``target/riscv64-os/debug/os`` ，让我们先看看它的文件类型：

```bash
$ file target/riscv64-os/debug/os
target/riscv64-os/debug/os: ELF 64-bit LSB executable, UCB RISC-V, version 1 (SYSV), statically linked, not stripped
```

从中，我们可以看出它是一个 $$64$$ 位的 ``elf`` 可执行文件，架构是 ``RISC-V`` ；链接方式为**静态链接**；``not stripped`` 指的是里面符号表的信息未被剔除，而这些信息在调试程序时会用到，程序正常执行时通常不会使用。

使用刚刚安装的工具链中的 ``objdump`` 工具看看内存布局是否正确：

```bash
$ riscv64-unknown-elf-objdump target/riscv64-os/debug/os -x

target/riscv64-os/debug/os:     file format elf64-littleriscv
target/riscv64-os/debug/os
architecture: riscv:rv64, flags 0x00000112:
EXEC_P, HAS_SYMS, D_PAGED
start address 0xffffffffc0200000

Program Header:
    LOAD off    0x0000000000001000 vaddr 0xffffffffc0200000 paddr 0xffffffffc0200000 align 2**12
         filesz 0x0000000000001000 memsz 0x0000000000001000 flags r-x
    LOAD off    0x0000000000002000 vaddr 0xffffffffc0201000 paddr 0xffffffffc0201000 align 2**12
         filesz 0x0000000000001000 memsz 0x0000000000005000 flags rw-
   STACK off    0x0000000000000000 vaddr 0x0000000000000000 paddr 0x0000000000000000 align 2**0
         filesz 0x0000000000000000 memsz 0x0000000000000000 flags rw-

Sections:
Idx Name          Size      VMA               LMA               File off  Algn
  0 .text         00001000  ffffffffc0200000  ffffffffc0200000  00001000  2**1
                  CONTENTS, ALLOC, LOAD, READONLY, CODE
  1 .rodata       00000000  ffffffffc0201000  ffffffffc0201000  00002000  2**0
                  CONTENTS, ALLOC, LOAD, READONLY, CODE
  2 .data         00001000  ffffffffc0201000  ffffffffc0201000  00002000  2**12
                  CONTENTS, ALLOC, LOAD, DATA
  3 .stack        00004000  ffffffffc0202000  ffffffffc0202000  00003000  2**12
                  ALLOC
  4 .bss          00000000  ffffffffc0206000  ffffffffc0206000  00003000  2**0
                  ALLOC
  5 .debug_str    000004c1  0000000000000000  0000000000000000  00003000  2**0
                  CONTENTS, READONLY, DEBUGGING
  ...
SYMBOL TABLE:
0000000000000000 l    df *ABS*	0000000000000000 4vf7g5lz88xrm3fs
ffffffffc020002e l       .text	0000000000000000 
ffffffffc020002e l       .text	0000000000000000 
ffffffffc020002e l       .text	0000000000000000 
ffffffffc020003a l       .text	0000000000000000 
0000000000000000 l       .debug_info	0000000000000000 
0000000000000000 l       .debug_ranges	0000000000000000 
0000000000000000 l       .debug_frame	0000000000000000 
0000000000000000 l       .debug_line	0000000000000000 .Lline_table_start0
ffffffffc0201000 l       .data	0000000000000000 boot_page_table_sv39
0000000000000000 l    df *ABS*	0000000000000000 core.5zqet7hh-cgu.14
...
0000000000000000 l    df *ABS*	0000000000000000 compiler_builtins.4xdua3jz-cgu.7
ffffffffc0200000 g       .text	0000000000000000 _start
ffffffffc0202000 g       .stack	0000000000000000 bootstack
ffffffffc0206000 g       .stack	0000000000000000 bootstacktop
ffffffffc020002e g     F .text	000000000000000c rust_main
ffffffffc0200000 g       *ABS*	0000000000000000 BASE_ADDRESS
ffffffffc0200000 g       .text	0000000000000000 start
ffffffffc0200000 g       .text	0000000000000000 stext
ffffffffc0201000 g       .text	0000000000000000 etext
ffffffffc0201000 g       .rodata	0000000000000000 srodata
ffffffffc0201000 g       .rodata	0000000000000000 erodata
ffffffffc0201000 g       .data	0000000000000000 sdata
ffffffffc0202000 g       .data	0000000000000000 edata
ffffffffc0206000 g       .bss	0000000000000000 sbss
ffffffffc0206000 g       .bss	0000000000000000 ebss
```

我们看到里面首先描述了一些基本信息，随后入口地址 ``start address`` 与我们预期一致。

接下来是 ``program header`` 的信息。后面 ``sections, symbol table`` 里面的元信息都存在这里面。

然后是 ``sections``，从这里我们可以看到程序各段的各种信息。后面以 ``debug`` 开头的段是调试信息。

最后是 ``symbol table`` 即符号表，从中我们可以看到我们所定义的一些符号的地址。

在这里我们使用的是 ``-x`` 来查看程序的元信息，之后我们还会使用 ``-d`` 来对代码进行反汇编。 

看到的内存布局有问题？迄今为止的代码可以在[这里]()找到，可作参考。

### 生成内核镜像

我们之前生成的 ``elf`` 格式可执行文件有以下特点：

* 含有冗余的调试信息，使得程序体积较大；
* 需要对 ``program header`` 部分进行手动解析才能知道各段的信息，而这需要我们了解 ``program header`` 的二进制格式，并以字节为单位进行解析。

我们目前没有调试的手段，因此不需要调试信息；同时也不想在现在就进行复杂的 ``elf`` 格式解析，而是简单粗暴的将  $$\text{.text,.rodata,.data,.stack,.bss}$$ 各段从文件开头开始按顺序接连放在一起即可。而它们在 ``elf`` 可执行文件中确实是按顺序放在一起的。

我们可以使用工具 ``objcopy`` 从 ``elf`` 格式可执行文件生成内核镜像：

```bash
$ riscv64-unknown-elf-objcopy target/riscv64-os/debug/os --strip-all -O binary target/riscv64-os/debug/kernel.bin
```

这里 ``--strip-all`` 表明丢弃所有符号表及调试信息，``-O binary`` 表示输出为二进制文件。

至此，我们编译并生成了内核镜像 ``kernel.bin`` 。接下来，我们将使用 Qemu 模拟器真正将我们的内核镜像跑起来。
