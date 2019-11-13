# 第二章：最小化内核

## 本章提纲

这一章的内容还是很多的，我现在想先深入去做一些其他的功能，这部分文档回来再补。

重要的一点是：虚拟内存与物理内存应该说明到什么程度？

需要提前安装的工具： cargo xbuild， riscv64 工具链

暂时先列一个提纲：

1. 目标三元组编译指定目标平台的可执行文件

2. 描述我们所期望的内存布局，并使用链接脚本指定

   为什么要有个栈

   使用riscv64-unknown-elf-objdump工具查看我们期望的内存布局是否被实现

   使用同一系列的objcopy工具将默认的elf格式的文件转为binary

3. 使用opensbi作为bootloader，介绍此时物理内存布局

   覆盖 _start 入口点，我们的工作是设置内核栈，并跳转到 rust_main，分析为什么直接跳转到 rust_main 是不可行的

   简要介绍一下我们做了什么事情：开启页表功能，并完成了映射，但并不详细解释代码，这个工作留到第四章

   > 注释：wrj说由于Rust编译器不完善，导致只支持0x80000000以下和0xffffffff80000000以上的物理地址，而我们内核所在的物理地址为0x80200000，这导致不切换到虚存模式很多数据都没办法访问
   >
   > 因此我们在这一步不可能绕开页表

4. 调用OpenSBI提供的服务进行简单的字符输出，使用Qemu模拟，将常用功能写入 Makefile 中

5. 支持格式化输出，输出一些虚拟地址进一步确信内存布局、使得 panic 可以在屏幕上输出错误信息

所以会简要提到物理内存与虚拟内存，但是也就是简单的提一下，不涉及页表知识。

## 本章概要

在上一章中，我们移除了程序中所有对于已有操作系统的依赖。但是我们的内核开发仍然需要依赖硬件平台。现在让我们来看一看怎样才能让我们的内核在硬件平台上跑起来。

本章你将会学到：

* 使用**目标三元组**描述目标平台，并进行**交叉编译**将我们的内核可执行程序编译到目标平台——riscv64上去

* 使用OpenSBI启动我们的内核，并用硬件模拟器Qemu进行模拟

* 修改之前的入口``_start``，并在里面进行一些初始化

* 使用OpenSBI提供的服务，在屏幕上格式化打印字符串用于以后调试

本章的代码可以在[这里]()找到。

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