## “魔法”——内核初始映射

- [代码][code]

之前的内核实现并未使能页表机制，实际上内核是直接在物理地址空间上运行的。这样虽然比较简单，但是为了后续能够支持多个用户进程能够在内核中并发运行，满足隔离等性质，我们要先运用学过的页表知识，把内核的运行环境从物理地址空间转移到虚拟地址空间，为之后的功能打好铺垫。

更具体的，我们现在想将内核代码放在虚拟地址空间中以 ``0xffffffffc0200000`` 开头的一段高地址空间中。因此，我们将下面的参数修改一下：

```diff
# src/boot/linker64.ld
-BASE_ADDRESS = 0x80200000;
+BASE_ADDRESS = 0xffffffffc0200000;

# src/consts.rs
-pub const KERNEL_BEGIN_VADDR: usize = 0x80200000;
+pub const KERNEL_BEGIN_VADDR: usize = 0xffffffffc0200000;
```

我们修改了链接脚本中的链接开头地址。但是这样做的话，就能从物理地址空间转移到虚拟地址空间了吗？让我们回顾一下在相当于 bootloader 的 OpenSBI 结束后，我们要面对的是怎样一种局面：

- 物理内存状态：OpenSBI 代码放在 `[0x80000000,0x80200000)` 中，内核代码放在以 `0x80200000` 开头的一块连续物理内存中。
- CPU 状态：处于 S Mode ，寄存器 `satp` 的 $$\text{MODE}$$ 被设置为 `Bare` ，即无论取指还是访存我们通过物理地址直接访问物理内存。 $$\text{PC}=0\text{x}80200000$$ 指向内核的第一条指令。栈顶地址 $$\text{SP}$$ 处在 OpenSBI 代码内。
- 内核代码：由于改动了链接脚本的起始地址，认为自己处在以虚拟地址 ``0xffffffffc0200000`` 开头的一段连续虚拟地址空间中。


接下来，我们在入口点 ``entry64.asm`` 中所要做的事情是：将 $$\text{SP}$$ 寄存器指向的栈空间从 OpenSBI 某处移到我们的内核定义的某块内存区域中，使得我们可以完全支配启动栈；同时需要跳转到函数 `rust_main` 中。

在之前的实现中，我们已经在 [`src/boot/entry64.asm`](https://github.com/rcore-os/rCore_tutorial/blob/ch5-pa2/os/src/boot/entry64.asm#L19) 中自己分配了一块 $$16\text{KiB}$$ 的内存用来做启动栈：

```riscv
# src/boot/entry64.asm

    .section .text.entry
    .globl _start
_start:
    la sp, bootstacktop
    call rust_main

    .section .bss.stack
    .align 12
    .global bootstack
bootstack:
    .space 4096 * 4
    .global bootstacktop
bootstacktop:
```

符号 `bootstacktop` 就是我们需要的栈顶地址！同样符号 `rust_main` 也代表了我们要跳转到的地址。直接将 `bootstacktop` 的值给到 $$\text{SP}$$， 再跳转到 `rust_main` 就行了。看起来原来的代码仍然能用啊？

问题在于，由于我们修改了链接脚本的起始地址，编译器和链接器认为内核开头地址为 ``0xffffffffc0200000``，因此这两个符号会被翻译成比这个开头地址还要高的绝对虚拟地址。而我们的 CPU 目前处于 `Bare` 模式，会将地址都当成物理地址处理。这样，我们跳转到 `rust_main` 就会跳转到 `0xffffffffc0200000+` 的一个物理地址，物理地址都没有这么多位！这显然是会出问题的。

于是，我们只能想办法利用刚学的页表知识，帮内核将需要的虚拟地址空间构造出来。

观察可以发现，同样的一条指令，其在虚拟内存空间中的虚拟地址与其在物理内存中的物理地址有着一个固定的**偏移量**。比如内核的第一条指令，虚拟地址为 `0xffffffffc0200000` ，物理地址为 `0x80200000` ，因此，我们只要将虚拟地址减去 `0xffffffff40000000` ，就得到了物理地址。

使用上一节页表的知识，我们只需要做到当访问内核里面的一个虚拟地址 $$\text{va}$$ 时，我们知道 $$\text{va}$$ 处的代码或数据放在物理地址为 `pa = va - 0xffffffff40000000` 处的物理内存中，我们真正所要做的是要让 CPU 去访问 $$\text{pa} $$。因此，我们要通过恰当构造页表，来对于内核所属的虚拟地址，实现这种 $$\text{va}\rightarrow\text{pa}$$ 的映射。

我们先使用一种最简单的页表构造方法，还记得上一节中所讲的大页吗？那时我们提到，将一个三级页表项的标志位 $$\text{R,W,X}$$ 不设为全 $$0$$ ，可以将它变为一个叶子，从而获得大小为 $$1\text{GiB}$$ 的一个大页。

我们假定内核大小不超过 $$1\text{GiB}$$，因此通过一个大页，将虚拟地址区间 `[0xffffffffc0000000,0xffffffffffffffff]` 映射到物理地址区间 `[0x80000000,0xc0000000)`，而我们只需要分配一页内存用来存放三级页表，并将其最后一个页表项(这个虚拟地址区间明显对应三级页表的最后一个页表项)，进行适当设置即可。

因此，[实现的汇编代码](https://github.com/rcore-os/rCore_tutorial/blob/ch5-pa2/os/src/boot/entry64.asm)为：

```riscv
# src/boot/entry64.asm

	.section .text.entry
	.globl _start
_start:
	# t0 := 三级页表的虚拟地址
	lui     t0, %hi(boot_page_table_sv39)
    # t1 := 0xffffffff40000000 即虚实映射偏移量
    li      t1, 0xffffffffc0000000 - 0x80000000
    # t0 减去虚实映射偏移量 0xffffffff40000000，变为三级页表的物理地址
    sub     t0, t0, t1
    # t0 >>= 12，变为三级页表的物理页号
    srli    t0, t0, 12

    # t1 := 8 << 60，设置 satp 的 MODE 字段为 Sv39
    li      t1, 8 << 60
    # 将刚才计算出的预设三级页表物理页号附加到 satp 中
    or      t0, t0, t1
    # 将算出的 t0(即新的MODE|页表基址物理页号) 覆盖到 satp 中
    csrw    satp, t0
    # 使用 sfence.vma 指令刷新 TLB
    sfence.vma
    # 从此，我们给内核搭建出了一个完美的虚拟内存空间！

    # 我们在虚拟内存空间中：随意将 sp 设置为虚拟地址！
    lui sp, %hi(bootstacktop)

	# 我们在虚拟内存空间中：随意跳转到虚拟地址！
	# 跳转到 rust_main
	lui t0, %hi(rust_main)
	addi t0, t0, %lo(rust_main)
	jr t0

    .section .data
    # 由于我们要把这个页表放到一个页里面，因此必须 12 位对齐
    .align 12
# 分配 4KiB 内存给预设的三级页表
boot_page_table_sv39:
    # 0xffffffff_c0000000 map to 0x80000000 (1G)
    # 前 511 个页表项均设置为 0 ，因此 V=0 ，意味着是空的(unmapped)
    .zero 8 * 511
    # 设置最后一个页表项，PPN=0x80000，标志位 VRWXAD 均为 1
    .quad (0x80000 << 10) | 0xcf # VRWXAD
```

总结一下，要进入虚拟内存访问方式，需要如下步骤：

1. 分配页表所在内存空间并初始化页表；
2. 设置好页基址寄存器（指向页表起始地址）；
3. 刷新 TLB。

到现在为止我们终于理解了自己是如何做起白日梦——进入那看似虚无缥缈的虚拟内存空间的。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch5-pa2
