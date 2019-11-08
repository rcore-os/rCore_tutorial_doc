## “魔法”——内核初始映射

让我们回顾一下在相当于 bootloader 的 OpenSBI 结束后，我们要面对的是怎样一种局面：

* 物理内存状态：OpenSBI 代码放在 $$[0\text{x}80000000,0\text{x}80200000)$$ 中，内核代码放在以 $$0\text{x}80200000$$ 开头的一块连续物理内存中。
* CPU 状态：处于 S Mode ，寄存器 ``satp`` 的 $$\text{MODE}$$ 被设置为 ``Bare`` ，即无论取指还是访存我们通过物理地址直接访问物理内存。 $$\text{PC}=0\text{x}80200000$$ 指向内核的第一条指令。栈顶地址 $$\text{SP}$$ 处在 OpenSBI 代码内。
* 内核代码：使用虚拟地址，代码和数据段均放在以虚拟地址 $$0\text{xffffffffc0200000}$$ 开头的一段连续虚拟内存中。
* 我们所要做的事情：将 $$\text{SP}$$ 从 OpenSBI 中移到我们的内核内，使得我们可以完全支配启动栈；同时需要跳转到函数 ``rust_main`` 中。

我们已经在 ``src/boot/entry64.asm`` 中自己分配了一块 $$16\text{KiB}$$ 的内存用来做启动栈：

```asm
# src/boot/entry64.asm

	.section .bss.stack
	.align 12
	.global bootstack
bootstack:
	.space 4096 * 4
	.global bootstacktop
bootstacktop:
```

符号 ``bootstacktop`` 就是我们需要的栈顶地址！同样符号 ``rust_main`` 也代表了我们要跳转到的地址。直接将 ``bootstacktop`` 的值给到 $$\text{SP}$$， 再跳转到 ``rust_main`` 就行了吗？

问题在于，编译器和链接器认为程序在虚拟内存空间中运行，因此这两个符号都会被翻译成虚拟地址。而我们的 CPU 目前处于 ``Bare`` 模式，会将地址都当成物理地址处理。这样，我们跳转到 ``rust_main`` 就会跳转到 ``0xffffffffc0200000+`` 的一个物理地址，物理地址都没有这么多位！这显然是出问题的。

观察可以发现，同样的一条指令，其在虚拟内存空间中的虚拟地址与其在物理内存中的物理地址有着一个固定的**偏移量**。比如内核的第一条指令，虚拟地址为 ``0xffffffffc0200000`` ，物理地址为 ``0x80200000`` ，因此，我们只要将虚拟地址减去 ``0xffffffff40000000`` ，就得到了物理地址。

使用上一节页表的知识，我们只需要做到当访问内核里面的一个虚拟地址 $$\text{va}$$ 时，我们知道 $$\text{va}$$ 处的代码或数据放在物理地址为 $$\text{pa}=\text{va}-0\text{xffffffff40000000}$$ 处的物理内存中，我们真正所要做的是要让 CPU 去访问 $$\text{pa} $$。因此，我们要通过恰当构造页表，来对于内核所属的虚拟地址，实现这种 $$\text{va}\rightarrow\text{pa}$$ 的映射。

我们先使用一种最简单的构造，还记得上一节中所讲的大页吗？那时我们提到，将一个三级页表项的标志位 $$\text{R,W,X}$$ 不设为全 $$0$$ ，可以将它变为一个叶子，从而获得大小为 $$1\text{GiB}$$ 的一个大页。

我们假定内核大小不超过 $$1\text{GiB}$$，因此通过一个大页，将虚拟地址区间 ``[0xffffffffc0000000,0xffffffffffffffff]`` 映射到物理地址区间 ``[0x80000000,0xc0000000)``，而我们只需要分配一页内存用来存放三级页表，并将其最后一个页表项(这个虚拟地址区间明显对应三级页表的最后一个页表项)，进行适当设置即可。

因此，汇编代码为：

```assembly
# src/boot/entry64.asm

	.section .text.entry
	.globl _start
_start:
	# t0 <- 三级页表的虚拟地址
	lui     t0, %hi(boot_page_table_sv39)
	# t0 减去偏移量 0xffffffff40000000，变为三级页表的物理地址
    li      t1, 0xffffffffc0000000 - 0x80000000
    sub     t0, t0, t1
    # t0 >>= 12，变为三级页表的物理页号
    srli    t0, t0, 12
    
    # t1 <- 8 << 60，设置 satp 的 MODE 字段为 Sv39
    li      t1, 8 << 60
    # 将刚才计算出的预设三级页表物理页号附加到 satp 中
    or      t0, t0, t1
    # 将算出的 satp 覆盖到 satp 中
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
    # 0xffffffff_c0000000 -> 0x80000000 (1G)
    # 前 511 个页表项均设置为 0 ，因此 V=0 ，意味着是空的
    .zero 8 * 511
    # 设置最后一个页表项，PPN=0x80000，标志位 VRWXAD 均为 1
    .quad (0x80000 << 10) | 0xcf # VRWXAD
```

到现在为止我们终于理解了自己是如何做起白日梦——进入那看似虚无缥缈的虚拟内存空间的。

