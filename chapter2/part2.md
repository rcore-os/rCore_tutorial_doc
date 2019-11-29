## 使用链接脚本指定程序内存布局

上一节中我们在目标三元组中进行了这样的配置：

```json
"pre-link-args": {
    "ld.lld": [
      "-Tsrc/boot/linker64.ld"
    ]
}
```

``ld.lld`` 是一个链接工具，可以用来指定程序的内存布局。我们可以配置参数 ``-T`` 来指定链接工具使用的链接脚本。这里，我们将链接脚本放在 ``src/boot/linker64.ld`` 中。

> **[info] 程序的内存布局**
>
> 一般来说，一个程序按照功能不同会分为下面这些段：
>
> * $$\text{.text}$$ 段，即代码段，存放汇编代码；
> * $$\text{.rodata}$$ 段，即只读数据段，顾名思义里面存放只读数据，通常是程序中的常量；
> * $$\text{.data}$$ 段，存放被初始化的可读写数据，通常保存程序中的全局变量；
> * $$\text{.bss}$$ 段，存放被初始化为 $$0$$ 的可读写数据，与 $$\text{.data}$$ 段的不同之处在于我们知道它要被初始化为 $$0$$ ，因此在可执行文件中只需记录这个段的大小以及所在位置即可，而不用记录里面的数据。
> * $$\text{stack}$$ ，即栈，用来存储程序运行过程中的局部变量，以及负责函数调用时的各种机制。它从高地址向低地址增长；
> * $$\text{heap}$$ ，即堆，用来支持程序**运行过程中**内存的**动态分配**，比如说你要读进来一个字符串，在你写程序的时候你也不知道它的长度究竟为多少，于是你只能在运行过程中，知道了字符串的长度之后，再在堆中给这个字符串分配内存。
> 
> 内存布局，也就是指这些段各自所放的位置。一种典型的内存布局如下：
> 
> <img src="figures/program_memory_layout.png" style="height:400px">

我们如果不指定链接工具使用的链接脚本，则它会使用默认的链接脚本指定内存布局，将各段放在低地址。事实上我们要求内核的段放在高地址，所以使用自己的链接脚本则不能使用默认的：

```clike
// src/boot/linker64.ld

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

时至今日我们已经不太可能将所有代码都写在一个文件里面。在编译过程中，我们的编译器和链接器已经给每个文件都自动生成了一个内存布局。这里，我们的链接工具所要做的是最终将各个文件的内存布局装配起来生成整个程序的内存布局。

我们首先使用 ``OUTPUT_ARCH`` 指定了架构，随后使用 ``ENTRY_POINT`` 指定了**入口点**为 ``_start`` ，即程序第一条被执行的指令所在之处。在这个链接脚本中我们并未看到 ``_start`` ，回忆上一章，我们为了移除运行时环境依赖，重写了 C runtime 的入口 ``_start`` 。所以，链接脚本宣布整个程序会从那里开始运行。

链接脚本的整体写在 ``SECTION{ }`` 中，里面有多个形如 $$\text{output section: \{ input section list \}}$$ 的语句，每个都描述了一个整个程序内存布局中的一个输出段 $$\text{output section}$$ 是由各个文件中的哪些输入段 $$\text{input section}$$ 组成的。

我们可以用 $$*()$$ 来表示将各个文件中所有符合括号内要求的输入段放在当前的位置。而括号内，你可以直接使用段的名字，也可以包含通配符 $$*$$ 。

单独的一个 ``.`` 为**当前地址 (Location Counter)**，可以对其赋值来从设置的地址继续向高地址放置各个段。如果不进行赋值的话，则默认各个段会紧挨着向高地址放置。将一个**符号**赋值为 ``.`` 则会记录下这个符号的地址。

到这里我们大概看懂了这个链接脚本在做些什么事情。首先是从 ``BASE_ADDRESS`` 即 ``0xffffffffc0200000`` (这确实是个高地址！) 开始向下放置各个段，依次是 $$\text{.text, .rodata, .data, .stack, .bss}$$ 。同时我们还记录下了每个段的开头和结尾地址，如 $$\text{.text}$$ 段的开头、结尾地址分别就是符号 $$\text{stext, etext}$$ 的地址，我们接下来会用到。

这里面有两个输入段与其他长的不太一样，即 $$\text{.text.entry,.bss.stack}$$ ，似乎编译器不会自动生成这样名字的段。事实上，它们是我们在后面自己定义的。

到这里，我们清楚了最终程序的内存布局会长成什么样子。下一节我们来补充这个链接脚本中未定义的段，并完成编译。