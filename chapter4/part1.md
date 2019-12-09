## 物理内存探测与管理

我们知道，物理内存通常是一片 RAM ，我们可以把它看成一个以字节为单位的大数组，通过物理地址找到对应的位置进行读写。但是，物理地址**并不仅仅**只能访问物理内存，也可以用来访问其他的外设，因此你也可以认为物理内存也算是一种外设。

这样设计是因为：一开始访问其他外设与访问物理内存要使用不同的指令，会带来很多麻烦，于是我们通过 MMIO(Memory Mapped I/O) 技术将外设映射到一段物理地址，这样我们访问其他外设就和访问物理内存一样啦！

我们先不管那些外设，来看物理内存。

### 物理内存探测

我们怎样知道物理内存所在的那段物理地址呢？这个其实是由 bootloader ，在这个项目中也就是 OpenSBI 来完成的。它来完成对于包括物理内存在内的各外设的扫描，将扫描结果以 DTB(Device Tree Blob) 的格式保存在物理内存中的某个地方。随后 OpenSBI 会将其地址保存在 ``a1`` 寄存器中，给我们使用。

这个扫描结果描述了所有外设的信息，当中也包括我们的内存。不过为了简单起见，我们并不打算自己去解析这个结果。因为我们知道，Qemu 规定的物理内存开头的物理地址为 ``0x80000000`` 。而在 Qemu 中，可以使用 ``-m`` 指定 RAM 的大小，默认是 $$128\text{MiB}$$ 。因此，默认的物理内存地址范围就是 ``[0x80000000,0x88000000)`` 。我们直接将物理内存结束地址硬编码到内核中：

```rust
// src/lib.rs

mod consts;

// src/consts.rs

pub const PHYSICAL_MEMORY_END: usize = 0x88000000;
```

但是，有一部分空间已经被占用，不能用来存别的东西了！

* 物理地址空间 ``[0x80000000,0x80200000)`` 被 OpenSBI 占用；
* 物理地址空间 ``[0x80200000,KernelEnd)`` 被内核各代码与数据段占用；
* 其实设备树扫描结果 DTB 还占用了一部分物理内存，不过由于我们不打算使用它，所以可以将它所占用的空间用来存别的东西。

于是，我们可以用来存别的东西的物理内存的物理地址范围是：``[KernelEnd, 0x88000000)`` 。这里的 ``KernelEnd​`` 为内核代码结尾的物理地址。在 ``linker64.ld`` 中定义的 ``end`` 符号为内核代码结尾的虚拟地址，我们需要通过偏移量来将其转化为物理地址。

我们来将可用的物理内存地址范围打印出来：

```rust
// src/consts.rs

pub const KERNEL_BEGIN_PADDR: usize = 0x80200000;
pub const KERNEL_BEGIN_VADDR: usize = 0xffffffffc0200000;

// src/init.rs

use crate::consts::*;

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    extern "C" {
        fn end();
    }
    println!(
        "free physical memory paddr = [0x{:x}, 0x{:x})",
        end as usize - KERNEL_BEGIN_VADDR + KERNEL_BEGIN_PADDR,
        PHYSICAL_MEMORY_END
    );
    crate::interrupt::init();
    crate::timer::init();
    loop {}
}
```

> **[success] 可用物理内存地址 **
> 
> ``free physical memory paddr = [0x8020b000, 0x88000000)``

### 物理页帧与物理页号

通常，我们在分配物理内存时并不是以字节为单位，而是以一**物理页帧(Frame)**，即连续的 $$2^{12}=4096$$ 字节为单位分配。我们希望用**物理页号(Physical Page Number, PPN)** 来代表一物理页，实际上代表物理地址范围在 $$[\text{PPN}\times 2^{12},(\text{PPN}+1)\times 2^{12})$$ 的一物理页。

不难看出，物理页号与物理页形成一一映射。为了能够使用物理页号这种表达方式，每个物理页的开头地址必须是 $$2^{12}=4096$$ 的倍数。但这也给了我们一个方便：对于一个物理地址，其除以 $$4096$$ (或者说右移 $12$ 位) 的商即为这个物理地址所在的物理页号。

以这种方式，我们看一下可用物理内存的物理页号表达。将 ``init.rs`` 中的输出语句略做改动：

```rust
// src/init.rs

println!(
        "free physical memory ppn = [0x{:x}, 0x{:x})",
        ((end as usize - KERNEL_BEGIN_VADDR + KERNEL_BEGIN_PADDR) >> 12) + 1,
        PHYSICAL_MEMORY_END >> 12
);
```

> **[success] 可用物理页号区间**
> 
> ``free physical memory ppn = [0x8020c, 0x88000)``

### 物理内存页式管理

对于物理内存的页式管理而言，我们所要支持的操作是：
1. 分配一个物理页，返回其物理页号；
2. 给定一个物理页号，回收其对应的物理页。
3. 给定一个页号区间进行初始化。

我们考虑用一颗非递归线段树来维护这些操作。节点上的值存的是 $$0/1$$ 表示这个节点对应的区间内是否还有空闲物理页。

```rust
// src/const.rs

pub const MAX_PHYSICAL_MEMORY: usize = 0x8000000;
pub const MAX_PHYSICAL_PAGES: usize = MAX_PHYSICAL_MEMORY >> 12;

// src/lib.rs

mod memory;

// src/memory/mod.rs

mod frame_allocator;

// src/memory/frame_allocator.rs

use crate::consts::MAX_PHYSICAL_PAGES;

pub struct SegmentTreeAllocator {
    a: [u8; MAX_PHYSICAL_PAGES << 1],
    m: usize,
    n: usize,
    offset: usize
}

impl SegmentTreeAllocator {
    // 使用物理页号区间 [l,r) 进行初始化
    pub fn init(&mut self, l: usize, r: usize) {
        self.offset = l - 1;
        self.n = r - l;
        self.m = 1;
        while self.m < self.n + 2 {
            self.m = self.m << 1;
        }
        for i in (1..(self.m << 1)) { self.a[i] = 1; }
        for i in (1..self.n) { self.a[self.m + i] = 0; }
        for i in (1..self.m).rev() { self.a[i] = self.a[i << 1] & self.a[(i << 1) | 1]; }
    }
    // 分配一个物理页
    // 自上而下寻找可用的最小物理页号
    // 注意，我们假定永远不会出现物理页耗尽的情况
    pub fn alloc(&mut self) -> usize {
        // assume that we never run out of physical memory
        if self.a[1] == 1 {
            panic!("physical memory depleted!");
        }
        let mut p = 1;
        while p < self.m {
            if self.a[p << 1] == 0 { p = p << 1; } else { p = (p << 1) | 1; }
        }
        let result = p + self.offset - self.m;
        self.a[p] = 1;
        p >>= 1;
        while p > 0 {
            self.a[p] = self.a[p << 1] & self.a[(p << 1) | 1];
            p >>= 1;
        }
        result
    }
    // 回收物理页号为 n 的物理页
    // 自下而上进行更新
    pub fn dealloc(&mut self, n: usize) {
        let mut p = n + self.m - self.offset;
        assert!(self.a[p] == 1);
        self.a[p] = 0;
        p >>= 1;
        while p > 0 {
            self.a[p] = self.a[p << 1] & self.a[(p << 1) | 1];
            p >>= 1;
        }
    }
}
```

事实上每次分配的是可用的物理页号最小的页面，具体实现方面就不赘述了。

我们还需要将这个类实例化并声明为 ``static`` ，因为它在整个程序运行过程当中均有效。

```rust
// os/Cargo.toml

[dependencies]
spin = "0.5.2"

// src/memory/frame_allocator.rs

use spin::Mutex;

pub static SEGMENT_TREE_ALLOCATOR: Mutex<SegmentTreeAllocator> = Mutex::new(SegmentTreeAllocator {
    a: [0; MAX_PHYSICAL_PAGES << 1],
    m: 0,
    n: 0,
    offset: 0
});
```

我们注意到在内核中开了一块比较大的静态内存，``a`` 数组。那么 ``a`` 数组究竟有多大呢？实际上 ``a`` 数组的大小为最大可能物理页数的二倍，因此 ``a`` 数组大小仅为物理内存大小的 $$\frac{1}{2^{12}}\times 2\simeq 0.05\%$$，可说是微乎其微。

我们本来想把 ``SEGMENT_TREE_ALLOCATOR`` 声明为 ``static mut`` 类型，这是因为首先它需要是 ``static`` 类型的；其次，它的三个方法 ``init, alloc, dealloc`` 都需要修改自身。

但是，对于 ``static mut`` 类型的修改操作是 ``unsafe`` 的。我们之后会提到**线程**的概念，对于 ``static`` 类型的静态数据，所有的线程都能访问。当一个线程正在访问这段数据的时候，如果另一个线程也来访问，就可能会产生冲突，并带来难以预测的结果。

所以我们的方法是使用 ``spin::Mutex<T>`` 给这段数据加一把锁，一个线程试图通过 ``.lock()`` 打开锁来获取内部数据的可变引用，如果钥匙被别的线程所占用，那么这个线程就会一直卡在这里；直到那个占用了钥匙的线程对内部数据的访问结束，锁被释放，将钥匙交还出来，被卡住的那个线程拿到了钥匙，就可打开锁获取内部引用，访问内部数据。

这里使用的是 ``spin::Mutex<T>`` ， 我们在 ``Cargo.toml`` 中添加依赖。幸运的是，它也无需任何操作系统支持，我们可以放心使用。

我们在 ``src/memory/mod.rs`` 里面再对这个类包装一下：

```rust
// src/memory/mod.rs

use frame_allocator::SEGMENT_TREE_ALLOCATOR as FRAME_ALLOCATOR;
use riscv::addr::{
    // 分别为虚拟地址、物理地址、虚拟页、物理页帧
    // 非常方便，之后会经常用到
    // 用法可参见 https://github.com/rcore-os/riscv/blob/master/src/addr.rs
    VirtAddr,
    PhysAddr,
    Page,
    Frame
};

pub fn init(l: usize, r: usize) {
    FRAME_ALLOCATOR.lock().init(l, r);
    println!("++++ setup memory!    ++++");
}
pub fn alloc_frame() -> Option<Frame> {
    //将物理页号转为物理页帧
    Some(Frame::of_ppn(FRAME_ALLOCATOR.lock().alloc()))
}
pub fn dealloc_frame(f: Frame) {
    FRAME_ALLOCATOR.lock().dealloc(f.number())
}
```

现在我们来测试一下它是否能够很好的完成物理页分配与回收：

```rust
// src/init.rs

use crate::memory::{
    alloc_frame,
    dealloc_frame
};

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    extern "C" {
        fn end();
    }
    println!("kernel end vaddr = 0x{:x}", end as usize);
    println!(
        "free physical memory ppn = [0x{:x}, 0x{:x})",
        ((end as usize - KERNEL_BEGIN_VADDR + KERNEL_BEGIN_PADDR) >> 12) + 1,
        PHYSICAL_MEMORY_END >> 12
    );
    crate::interrupt::init();

    crate::memory::init(
        ((end as usize - KERNEL_BEGIN_VADDR + KERNEL_BEGIN_PADDR) >> 12) + 1,
        PHYSICAL_MEMORY_END >> 12
    );
    frame_allocating_test();
    crate::timer::init();

    unsafe {
        asm!("ebreak"::::"volatile");
    }
    panic!("end of rust_main");
    loop {}
}

fn frame_allocating_test() {
    println!("alloc {:#x?}", alloc_frame());
    let f = alloc_frame();
    println!("alloc {:#x?}", f);
    println!("alloc {:#x?}", alloc_frame());
    println!("dealloc {:#x?}", f);
    dealloc_frame(f.unwrap());
    println!("alloc {:#x?}", alloc_frame());
    println!("alloc {:#x?}", alloc_frame());
}
```
我们尝试在分配的过程中回收，之后再进行分配，结果如何呢？
> **[success] 物理页分配与回收测试**
>
> ```rust
> free physical memory paddr = [0x80222020, 0x88000000)
> free physical memory ppn = [0x80223, 0x88000)
> ++++ setup interrupt! ++++
> ++++ setup timer!     ++++
> ++++ setup memory!    ++++
> alloc Some(
>        Frame(
>            PhysAddr(
>                0x80223000,
>            ),
>        ),
> )
> alloc Some(
>        Frame(
>            PhysAddr(
>                0x80224000,
>            ),
>        ),
> )
> alloc Some(
>        Frame(
>            PhysAddr(
>                0x80225000,
>            ),
>        ),
> )
> dealloc Some(
>        Frame(
>            PhysAddr(
>                0x80224000,
>            ),
>        ),
> )
> alloc Some(
>        Frame(
>            PhysAddr(
>                0x80224000,
>            ),
>        ),
> )
> alloc Some(
>        Frame(
>            PhysAddr(
>                0x80226000,
>            ),
>        ),
> )
> * 100 ticks *
> * 100 ticks *
> ...
> ```

我们回收的页面接下来马上就又被分配出去了。

如果结果有问题的话，在[这里]()能找到现有的代码。

不过，这种物理内存分配给人一种过家家的感觉。无论表面上分配、回收做得怎样井井有条，实际上都并没有对物理内存产生任何影响！不要着急，我们之后会使用它们的。