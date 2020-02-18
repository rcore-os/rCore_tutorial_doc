## 复制页表

前面我们使用了 `MemorySet.clone` ，但是我们并没有实现。实际上页表的复制并不像一般的元素那样简单。要做的事情有：

1. 创建一个新的页目录
2. 原线程每有一个页，就为新新线程分配一个页
3. 页的内容进行复制并映射

- `memory/memory_set/mod.rs`

```rust
use crate::memory::paging::{PageRange, PageTableImpl};

impl MemorySet {
    pub fn clone(&mut self) -> Self {
        // 创建一个新的页目录
        let mut new_page_table = PageTableImpl::new_bare();
        let Self {
            ref mut page_table,
            ref areas,
            ..
        } = self;
        // 遍历自己的所有页面
        for area in areas.iter() {
            for page in PageRange::new(area.start, area.end) {
                // 创建一个新的页
                // 将原页的内容复制到新页，同时进行映射
                area.handler
                    .clone_map(&mut new_page_table, page_table, page, &area.attr);
            }
        }
        MemorySet {
            areas: areas.clone(),
            page_table: new_page_table,
        }
    }
}

```

修改一下 `MemoryArea` 成员的访问权限：

- `memory/memory_set/area.rs`

```rust
pub struct MemoryArea {
    pub start: usize,
    pub end: usize,
    pub handler: Box<dyn MemoryHandler>,
    pub attr: MemoryAttr,
}
```

对于内核，我们采用线性映射。而对于用户程序，我们采用普通映射，即物理地址和虚拟地址没有什么关系，虚拟地址对应的物理内存无法通过简单计算得出，必须通过页表转换，所以所有程序的 handler 都是 `ByFrame` 类型而不是 `Linear` 类型。

在 `self.map` 中，会分配一个物理帧，并将其映射到指定的虚拟页上。然后将原页面的内容读出，复制到新页面上。这样，新旧线程访问同一个虚拟地址的时候，真实访问到的就是不同物理地址下相同数值的对象：

- `memory/memory_set/handler.rs`

```rust
impl MemoryHandler for ByFrame {
    fn clone_map(
        &self,
        pt: &mut PageTableImpl,
        src_pt: &mut PageTableImpl,
        vaddr: usize,
        attr: &MemoryAttr,
    ) {
        self.map(pt, vaddr, attr);
        let data = src_pt.get_page_slice_mut(vaddr);
        pt.get_page_slice_mut(vaddr).copy_from_slice(data);
    }
}
```

但是有一个问题，我们如果读取到原页表里的元素呢？我们现在在内核里，内核使用的是线性映射。所以我们需要：

- 通过复杂的过程通过原页表得到虚拟地址对应的物理地址
- 将这个物理地址转换为内核可访问的虚拟地址

上面的两步就是 `get_page_slice_mut` 做的事情，然后它把得到的虚拟地址转换成 u8 数组（方便操作）：

- `memory/paging.rs`

```rust
impl PageTableImpl {
    pub fn get_page_slice_mut<'a>(&mut self, vaddr: usize) -> &'a mut [u8] {
        let frame = self
            .page_table
            .translate_page(Page::of_addr(VirtAddr::new(vaddr)))
            .unwrap();
        let vaddr = frame.start_address().as_usize() + PHYSICAL_MEMORY_OFFSET;
        unsafe { core::slice::from_raw_parts_mut(vaddr as *mut u8, 0x1000) }
    }
}
```

> `translate_page` 不是我实现的，我也懒得看具体细节了，反正用着挺好使，不管了（x）

最后要在 `MemoryHandler` 中声明 `clone_map` 成员函数，同时为 `Linear` 实现 `clone_map` ：

- `memory/memory_set/handler.rs`

```rust
pub trait MemoryHandler: Debug + 'static {
    ...
    fn clone_map(
        &self,
        pt: &mut PageTableImpl,
        src_pt: &mut PageTableImpl,
        vaddr: usize,
        attr: &MemoryAttr,
    );
}

impl MemoryHandler for Linear {
    fn clone_map(
        &self,
        pt: &mut PageTableImpl,
        _src_pt: &mut PageTableImpl,
        vaddr: usize,
        attr: &MemoryAttr,
    ) {
        self.map(pt, vaddr, attr);
    }
}
```

由于 `Linear` 的虚拟地址和物理地址是一对一的，所以简单的进行线性映射就好啦。。。
