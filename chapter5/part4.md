## 内核重映射实现之一：页表

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/ac0b0f2f658a9ae777356fb5151b08ccfeb30d57)

首先我们来看如何实现页表。

### 访问物理内存

简单起见，无论是初始映射还是重映射，无论是内核各段还是物理内存，我们都采用同样的偏移量进行映射，具体而言：``va -> pa = va - 0xffffffff40000000`` 。

于是我们可以通过在内核中访问对应的虚拟内存来访问物理内存。

```rust
// src/consts.rs

pub const PHYSICAL_MEMORY_OFFSET: usize = 0xffffffff40000000;

// src/memory/mod.rs

// 将物理地址转化为对应的虚拟地址
pub fn access_pa_via_va(pa: usize) -> usize {
    pa + PHYSICAL_MEMORY_OFFSET
}
```

在 rust 的 riscv crate 中，已经为页表机制提供了如下支持：

* 基于偏移量(也即线性映射)的 Sv39 三级页表 ``Rv39PageTable`` 
* 页表项 ``PageTableEntry`` 
* 页表项数组 ``PageTable`` 
* 页表项中的标志位 ``PageTableFlags``

### 页表项

首先来看一下页表项：

```rust
// src/memory/mod.rs

pub mod paging;

// src/paging.rs

use crate::consts::*;
use riscv::addr::*;
use riscv::paging::{
    PageTableEntry,
    Mapper,
    Rv39PageTable,
    PageTable as PageTableEntryArray,
    PageTableFlags as EF,
    FrameAllocator,
    FrameDeallocator
    
};
use riscv::asm::{
    sfence_vma,
    sfence_vma_all,
};
use riscv::register::satp;
use crate::memory::{
    alloc_frame,
    dealloc_frame,
    access_pa_via_va
};
pub struct PageEntry(&'static mut PageTableEntry, Page);

impl PageEntry {
    pub fn update(&mut self) {
        unsafe {
            sfence_vma(0, self.1.start_address().as_usize());
        }
    }
	
    // 一系列的标志位读写
    pub fn accessed(&self) -> bool { self.0.flags().contains(EF::ACCESSED) }
    pub fn clear_accessed(&mut self) { self.0.flags_mut().remove(EF::ACCESSED); }

    pub fn dirty(&self) -> bool { self.0.flags().contains(EF::DIRTY) }
    pub fn clear_dirty(&mut self) { self.0.flags_mut().remove(EF::DIRTY); }

    pub fn writable(&self) -> bool { self.0.flags().contains(EF::WRITABLE) }
    pub fn set_writable(&mut self, value: bool) {
        self.0.flags_mut().set(EF::WRITABLE, value); 
    }

    pub fn present(&self) -> bool { self.0.flags().contains(EF::VALID | EF::READABLE) }
    pub fn set_present(&mut self, value: bool) {
        self.0.flags_mut().set(EF::VALID | EF::READABLE, value);
    }

    pub fn user(&self) -> bool { self.0.flags().contains(EF::USER) }
    pub fn set_user(&mut self, value: bool) { self.0.flags_mut().set(EF::USER, value); }

    pub fn execute(&self) -> bool { self.0.flags().contains(EF::EXECUTABLE) }
    pub fn set_execute(&mut self, value: bool) {
        self.0.flags_mut().set(EF::EXECUTABLE, value);
    }

    // 最终映射到的物理页号的读写
    pub fn target(&self) -> usize {
        self.0.addr().as_usize()
    }
    pub fn set_target(&mut self, target: usize) {
        let flags = self.0.flags();
        let frame = Frame::of_addr(PhysAddr::new(target));
        self.0.set(frame, flags);
    }
}
```

我们基于提供的类 ``PageTableEntry`` 自己封装了一个 ``PageEntry`` ，表示单个映射。里面分别保存了一个页表项 ``PageTableEntry`` 的可变引用，以及找到了这个页表项的虚拟页。但事实上，除了 ``update`` 函数之外，剩下的函数都是对 ``PageTableEntry`` 的简单包装，功能是读写页表项的目标物理页号以及标志位。

我们之前提到过，在修改页表之后我们需要通过屏障指令 ``sfence.vma`` 来刷新 ``TLB`` 。而这条指令后面可以接一个虚拟地址，这样在刷新的时候只关心与这个虚拟地址相关的部分，可能速度比起全部刷新要快一点。（实际上我们确实用了这种较快的刷新 TLB 方式，但并不是在这里使用，因此 ``update`` 根本没被调用过，这个类有些冗余了）

### 为 Rv39PageTable 提供物理页帧管理

在实现页表之前，我们回忆多级页表的修改会隐式的调用物理页帧分配与回收。比如在 Sv39 中，插入一对映射就可能新建一个二级页表和一个一个一级页表，而这需要分配两个物理页帧。因此，我们需要告诉 ``Rv39PageTable`` 如何进行物理页帧分配与回收。

```rust
// src/memory/paging.rs

// 事实上，我们需要一个实现了 FrameAllocator, FrameDeallocator trait的类
// 并为此分别实现 alloc, dealloc 函数
struct FrameAllocatorForPaging;

impl FrameAllocator for FrameAllocatorForPaging {
    fn alloc(&mut self) -> Option<Frame> {
        alloc_frame()
    }
}

impl FrameDeallocator for FrameAllocatorForPaging {
    fn dealloc(&mut self, frame: Frame) {
        dealloc_frame(frame)
    }
}
```
### 实现我们自己的页表 PageTableImpl

于是我们可以利用 ``Rv39PageTable``的实现我们自己的页表 ``PageTableImpl`` 。首先是声明及初始化：

```rust
// src/memory/paging.rs

pub struct PageTableImpl {
    page_table: Rv39PageTable<'static>,
    // 作为根的三级页表所在的物理页帧
    root_frame: Frame,
    // 在操作过程中临时使用
    entry: Option<PageEntry>,
}

impl PageTableImpl {
    // 新建一个空页表
    pub fn new_bare() -> Self {
        // 分配一个物理页帧并获取物理地址，作为根的三级页表就放在这个物理页帧中
        let frame = alloc_frame().expect("alloc_frame failed!");
        let paddr = frame.start_address().as_usize();
        // 利用 access_pa_via_va 访问该物理页帧并进行页表初始化
        let table = unsafe { &mut *(access_pa_via_va(paddr) as *mut PageTableEntryArray) };
        table.zero();

        PageTableImpl {
            // 传入参数：三级页表的可变引用；
            // 因为 Rv39PageTable 的思路也是将整块物理内存进行线性映射
            // 所以我们传入物理内存的偏移量，即 va-pa，使它可以修改页表
            page_table: Rv39PageTable::new(table, PHYSICAL_MEMORY_OFFSET),
            // 三级页表所在物理页帧
            root_frame: frame,
            entry: None
        }
    }
}
```
然后是页表最重要的插入、删除映射的功能：
```rust
impl PageTableImpl {
	...
    pub fn map(&mut self, va: usize, pa: usize) -> &mut PageEntry {
    	// 为一对虚拟页与物理页帧建立映射
    	
    	// 这里的标志位被固定为 R|W|X，即同时允许读/写/执行
    	// 后面我们会根据段的权限不同进行修改
        let flags = EF::VALID | EF::READABLE | EF::WRITABLE;
        let page = Page::of_addr(VirtAddr::new(va));
        let frame = Frame::of_addr(PhysAddr::new(pa));
        self.page_table
        	// 利用 Rv39PageTable 的 map_to 接口
        	// 传入要建立映射的虚拟页、物理页帧、映射标志位、以及提供物理页帧管理
            .map_to(page, frame, flags, &mut FrameAllocatorForPaging)
            .unwrap()
            // 得到 MapperFlush(Page)
            // flush 做的事情就是跟上面一样的 sfence_vma
            // 即刷新与这个虚拟页相关的 TLB
            // 所以我们修改后有按时刷新 TLB
            .flush();
        self.get_entry(va).expect("fail to get an entry!")
    }
    pub fn unmap(&mut self, va: usize) {
    	// 删除一对映射
    	// 我们只需输入虚拟页，因为已经可以找到页表项了
        let page = Page::of_addr(VirtAddr::new(va));
        // 利用 Rv39PageTable 的 unmap 接口
        // * 注意这里没有用到物理页帧管理，所以 Rv39PageTable 并不会回收内存？
        let (_, flush) = self.page_table.unmap(page).unwrap();
        // 同样注意按时刷新 TLB
        flush.flush();
    }
    fn get_entry(&mut self, va: usize) -> Option<&mut PageEntry> {
    	// 获取虚拟页对应的页表项，以被我们封装起来的 PageEntry 的可变引用的形式
    	// 于是，我们拿到了页表项，可以进行修改了！
        let page = Page::of_addr(VirtAddr::new(va));
        // 调用 Rv39PageTable 的 ref_entry 接口
        if let Ok(e) = self.page_table.ref_entry(page.clone()) {
            let e = unsafe { &mut *(e as *mut PageTableEntry) };
            // 把返回回来的 PageTableEntry 封装起来
            self.entry = Some(PageEntry(e, page));
            Some(self.entry.as_mut().unwrap())
        }
        else {
            None
        }
    }
}
```
上面我们创建页表，并可以插入、删除映射了。但是它依然一动不动的放在内存中，如何将它用起来呢？我们可以通过修改 ``satp`` 寄存器的物理页号字段来设置作为根的三级页表所在的物理页帧，也就完成了页表的切换。
```rust
impl PageTableImpl {
	...
	// 我们用 token 也就是 satp 的值来描述一个页表
	// 返回自身的 token
    pub fn token(&self) -> usize { self.root_frame.number() | (8 << 60) }
    
    // 使用内联汇编将 satp 寄存器修改为传进来的 token
    // 这个 token 对应的页表将粉墨登场...
    unsafe fn set_token(token: usize) {
        asm!("csrw satp, $0" :: "r"(token) :: "volatile");
    }
    
    // 查看 CPU 当前的 satp 值，就知道 CPU 目前在用哪个页表
    fn active_token() -> usize { satp::read().bits() }
    
    // 修改 satp 值切换页表后，过时的不止一个虚拟页
    // 因此必须使用 sfence_vma_all 刷新整个 TLB
    fn flush_tlb() { unsafe { sfence_vma_all(); } }
    
    // 将 CPU 所用的页表切换为当前的实例
    pub unsafe fn activate(&self) {
        let old_token = Self::active_token();
        let new_token = self.token();
        println!("switch satp from {:#x} to {:#x}", old_token, new_token);
        if new_token != old_token {
            Self::set_token(new_token);
            // 别忘了刷新 TLB!
            Self::flush_tlb();
        }
    }
}
```