## 动态内存分配

我们之前在 ``C/C++`` 语言中使用过 ``new, malloc`` 等动态内存分配方法，与在编译期就已完成的静态内存分配相比，动态内存分配可以根据程序运行时状态修改内存申请的时机及大小，显得更为灵活，但是这是需要操作系统的支持的，会带来一些开销。

我们的内核中也需要动态内存分配。典型的应用场景有：

* ``Box<T>`` ，你可以理解为它和 ``new, malloc`` 有着相同的功能；
* 引用计数 ``Rc<T>`` ， 原子引用计数 ``Arc<T>`` ，主要用于在引用计数清零，即某对象不再被引用时，对该对象进行自动回收；
* 一些数据结构，如 ``Vec, HashMap`` 等。

为了在我们的内核中支持动态内存分配，在 Rust 语言中，我们需要实现 ``Trait GlobalAlloc`` ，将这个类实例化，并使用语义项 ``#[global_allocator]`` 进行标记。这样的话，编译器就会知道如何进行动态内存分配。

为了实现 ``Trait GlobalAlloc`` ，我们需要支持这么两个函数：

```rust
unsafe fn alloc(&self, layout: Layout) -> *mut u8;
unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout);
```
可见我们要分配/回收一块虚拟内存。

那么这里面的 ``Layout`` 又是什么呢？从文档中可以找到，它有两个字段： ``size`` 表示要分配的字节数，``align`` 则表示分配的虚拟地址的最小对齐要求，即分配的地址要求是 ``align`` 的倍数。这里的 ``align`` 必须是 $$2$$ 的幂次。

也就表示，我们的需求是分配一块连续的、大小至少为 ``size`` 字节的虚拟内存，且对齐要求为 ``align`` 。

### 连续内存分配算法

假设我们已经有一整块虚拟内存用来分配，那么如何进行分配呢？

我们可能会想到一些简单粗暴的方法，比如对于一个分配任务，贪心地将其分配到可行的最小地址去。这样一直分配下去的话，我们分配出去的内存都是连续的，看上去很合理的利用了内存。

但是一旦涉及到回收的话，设想我们在连续分配出去的很多块内存中间突然回收掉一块，它虽然是可用的，但是由于上下两边都已经被分配出去，它就只有这么大而不能再被拓展了，这种可用的内存我们称之为**外碎片**。

随着不断回收会产生越来越多的碎片，某个时刻我们可能会发现，需要分配一块较大的内存，几个碎片加起来大小是足够的，但是单个碎片是不够的。我们会想到通过**碎片整理**将几个碎片合并起来。但是这个过程的开销极大。

### * buddy system 算法简介

这一节将介绍连续内存分配算法 buddy system 的实现细节与讨论，不感兴趣的读者可以跳过这一节。

假设这一整块虚拟内存的大小是 $$2$$ 的幂次，我们可以使用一种叫做 buddy system 的连续内存分配算法。其本质在于，每次分配的时候都恰好分配一块大小是 $$2$$ 的幂次的内存，且要保证内存的开头地址需要是对齐的，也就是内存的开头地址需要是这块内存大小的倍数。

只分配大小为 $$2$$ 的幂次的内存，意味着如果需要一块大小为 $$65\text{KiB}$$ 内存，我们都只能给它分配一块 $$128\text{KiB}$$ 的内存，这其中有 $$63\text{KiB}$$ 我们没有使用但又没法再被分配出去，这种我们称之为**内碎片**。虽然也会产生一定的浪费，但是相比外碎片，它是可控且易于管理的。

如[伙伴分配器的一个极简实现](https://coolshell.cn/articles/10427.html)所说，我们可以使用一颗线段树很容易地实现这个算法。我们只需在每个线段树节点上存当前区间上所能够分配的最大 $$2$$ 的幂次的内存大小 $$m$$。

* 分配时，为了尽可能满足分配的对齐需求，我们先尝试右子树，再尝试左子树，直到找到一个节点满足这个区间整体未分配，且它的左右子区间都不够分配，就将这个区间整体分配出去，将当前区间的 $$m$$ 值改为 $$0$$ ；
* 之后自下而上进行 $$m$$ 值的更新，$$\text{pa}.m\leftarrow \max\{\text{ls}.m,\text{rs}.m\}$$ 。但有一个特例，如果左右区间均完全没有被分配，则 $$\text{pa}.m\leftarrow \text{ls}.m + \text{rs}.m$$ ， 即将两个区间合并成一个更大的区间以供分配。
* 回收时只需找到分配时的那个节点，将其 $$m$$ 值改回去，同时同样自下而上进行 $$m$$ 值更新即可。从更新逻辑可以看出，我们实现了对于回收内存进行合并。

这样的实现虽然比较简单，但是内存消耗较大。为了减少内存消耗，我们不存 $$m$$ ，而用一个 ``u8`` 存 $$\log_2 m$$ ，但是整颗线段树仍需要消耗虚拟内存大小 $$2$$ 倍的内存！因此，等于要占用 $$3$$ 倍的内存，才能有一块虚拟内存用来连续分配，这会导致我们的内核及其臃肿。

有些实现规定了最小分配块大小，比如说是 $$8$$ 字节 ，这样我们只需总共占用 $$1.25$$ 倍的内存就能有一块虚拟内存用于分配了！在我们 $$64$$ 位的环境下，哪怕分配一个智能指针也需要 $$8$$ 字节，看上去挺合理的。还有一些其他方法，比如把底层换成 Bitmap 等卡常数手段...

简单的思考一下，实现简便与内存节约不可兼得啊...
### 支持动态内存分配

我们这里直接用学长写好的 buddy system allocator。

```rust
// Cargo.toml

[dependencies]
buddy_system_allocator = "0.3"
```

```rust
// src/lib.rs

#![feature(alloc_error_handler)]

extern crate alloc;
```

```rust
// src/consts.rs

// 内核堆大小为8MiB
pub const KERNEL_HEAP_SIZE: usize = 0x800000;
```

```rust
// src/memory/mod.rs

use crate::consts::*;
use buddy_system_allocator::LockedHeap;

pub fn init(l: usize, r: usize) {
    FRAME_ALLOCATOR.lock().init(l, r);
    init_heap();
    println!("++++ setup memory!    ++++");
}

fn init_heap() {
	// 同样是在内核中开一块静态内存供 buddy system allocator 使用
    static mut HEAP: [u8; KERNEL_HEAP_SIZE] = [0; KERNEL_HEAP_SIZE];
    unsafe {
    	// 这里我们也需要先开锁，才能进行操作
        DYNAMIC_ALLOCATOR
            .lock()
            .init(HEAP.as_ptr() as usize, KERNEL_HEAP_SIZE);
    }
}

#[global_allocator]
static DYNAMIC_ALLOCATOR: LockedHeap = LockedHeap::empty();

#[alloc_error_handler]
fn alloc_error_handler(_: core::alloc::Layout) -> ! {
    panic!("alloc_error_handler do nothing but panic!");
}
```

### 动态内存分配测试

现在我们来测试一下动态内存分配是否有效，分别动态分配一个整数和一个数组：

```rust
// src/init.rs

fn dynamic_allocating_test() {
	use alloc::vec::Vec;
	use alloc::boxed::Box;

	extern "C" {
		fn sbss();
		fn ebss();
	}
	let lbss = sbss as usize;
	let rbss = ebss as usize;

    let heap_value = Box::new(5);
    assert!(*heap_value == 5);
    println!("heap_value assertion successfully!");
    println!("heap_value is at {:p}", heap_value);
	let heap_value_addr = &*heap_value as *const _ as usize;
	assert!(heap_value_addr >= lbss && heap_value_addr < rbss);
	println!("heap_value is in section .bss!");

    let mut vec = Vec::new();
    for i in 0..500 {
        vec.push(i);
    }
    for i in 0..500 {
        assert!(vec[i] == i);
    }
    println!("vec assertion successfully!");
    println!("vec is at {:p}", vec.as_slice());
	let vec_addr = vec.as_ptr() as usize;
	assert!(vec_addr >= lbss && vec_addr < rbss);
	println!("vec is in section .bss!");
}
```
``make run`` 看一下结果：

> **[success] 动态内存分配测试**
>
> ```rust
> heap_value assertion successfully!
> heap_value is at 0x80a10000
> heap_value is in section .bss!
> vec assertion successfully!
> vec is at 0x80211000
> vec is in section .bss!
> ```

我们可以发现这些动态分配的变量可以使用了。而且通过查看它们的地址我们发现它们都在 $$\text{.bss}$$ 段里面。这是因为提供给动态内存分配器的那块内存就在 $$\text{.bss}$$ 段里面啊。

如果结果不太对劲，可以在[这里]()查看现有的代码。
