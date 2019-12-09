## 创建虚拟内存空间

### 内核链接

我们只需将最终得到的可执行文件直接链接到内核中即可。

```rust
// src/init.rs

global_asm!(concat!(
    r#"
	.section .data
	.global _user_img_start
	.global _user_img_end
_user_img_start:
    .incbin ""#,
    env!("USER_IMG"),
    r#""
_user_img_end:
"#
));
```

在编译时，编译器会将当前终端环境变量 ``USER_IMG`` 指向的路径对应的文件链接到 $$\text{.data}$$ 段中，而且我们可以通过两个符号得知它所在的虚拟地址。

所以我们只需在编译之前利用 ``export `` 修改环境变量 ``USER_IMG`` 为我们最终得到的可执行文件的路径即可。

### elf 文件解析与内存空间创建

为了能让用户程序运行起来，内核首先要给它分配内存空间，即创建一个虚拟内存空间供它使用。由于用户程序要通过中断访问内核的代码，因此它所在的虚拟内存空间必须也包含内核的各代码段和数据段。

elf 文件与只含有代码和数据的纯二进制文件不同，需要我们手动去解析它的文件结构来获得各段的信息。所幸的是， rust 已经有 crate 帮我们实现了这一点。

```rust
// src/process/mod.rs

use xmas_elf::{
    header,
    program::{ Flags, SegmentData, Type },
    ElfFile,
};
use crate::memory::memory_set::{
    MemorySet,
    handler::ByFrame,
    attr::MemoryAttr,
};
use core::str;

trait ElfExt {
    fn make_memory_set(&self) -> MemorySet;
}

// 给一个用户 elf 可执行程序创建虚拟内存空间
impl ElfExt for ElfFile<'_> {
    fn make_memory_set(&self) -> MemorySet {
        // MemorySet::new() 已经映射了内核各数据、代码段，以及物理内存段
        // 于是我们只需接下来映射用户程序各段即可
        let mut memory_set = MemorySet::new();
        for ph in self.program_iter() {
            // 遍历各段并依次尝试插入 memory_set
            if ph.get_type() != Ok(Type::Load) {
                continue;
            }
            let vaddr = ph.virtual_addr() as usize;
            let mem_size = ph.mem_size() as usize;
            let data = match ph.get_data(self).unwrap() {
                SegmentData::Undefined(data) => data,
                _ => unreachable!(),
            };
            
            // 这里在插入一个 MemoryArea 时还需要复制数据
            // 所以我们将 MemorySet 的接口略作修改，最后一个参数为数据源
            memory_set.push(
                vaddr,
                vaddr + mem_size,
                ph.flags().to_attr(),
                ByFrame::new(),
                Some((data.as_ptr() as usize, data.len())),
            );
        }
        memory_set
    }
}

// 将 elf 段的标志转化为我们熟悉的 MemoryAttr
trait ToMemoryAttr {
    fn to_attr(&self) -> MemoryAttr;
}
impl ToMemoryAttr for Flags {
    fn to_attr(&self) -> MemoryAttr {
        // 由于是用户程序，各段均首先设置为用户态
        let mut flags = MemoryAttr::new().set_user();
        if self.is_execute() {
            flags = flags.set_execute();
        }
        flags
    }
}
```

我们对 ``MemorySet`` 和 ``MemoryArea`` 的接口略作修改：

```rust
// src/memory/memory_set/mod.rs

impl MemorySet {
    ...
    pub fn push(&mut self, start: usize, end: usize, attr: MemoryAttr, handler: impl MemoryHandler, data: Option<(usize, usize)>) {
        assert!(start <= end, "invalid memory area!");
        assert!(self.test_free_area(start, end), "memory area overlap!");
        let area = MemoryArea::new(start, end, Box::new(handler), attr);
        // 首先进行映射
        area.map(&mut self.page_table);
        if let Some((src, length)) = data {
            // 如果传入了数据源
            // 交给 area 进行复制
            area.page_copy(&mut self.page_table, src, length);
        }
        self.areas.push(area);
        
    } 
}

// src/memory/memory_set/area.rs

impl MemoryArea {
    ...
    pub fn page_copy(&self, pt: &mut PageTableImpl, src: usize, length: usize) { 
        let mut l = length;
        let mut s = src;
        for page in PageRange::new(self.start, self.end) {
            // 交给 MemoryHandler 逐页进行复制
            self.handler.page_copy(
                pt,
                page,
                s,
                if l < PAGE_SIZE { l } else { PAGE_SIZE },
            );
            s += PAGE_SIZE;
            if l >= PAGE_SIZE { l -= PAGE_SIZE; }
        }
    }
}

// src/memory/memory_set/handler.rs

pub trait MemoryHandler: Debug + 'static {
    ...
    fn page_copy(&self, pt: &mut PageTableImpl, va: usize, src: usize, length: usize);
}

impl MemoryHandler for Linear {
    ...
    fn page_copy(&self, pt: &mut PageTableImpl, va: usize, src: usize, length: usize) {
        let pa = pt.get_entry(va)
            .expect("get pa error!")
            .0
            .addr()
            .as_usize();
        assert!(va == access_pa_via_va(pa));
        assert!(va == pa + self.offset);
        unsafe {
            let dst = core::slice::from_raw_parts_mut(
                va as *mut u8,
                PAGE_SIZE,
            );
            if length > 0 {
                let src = core::slice::from_raw_parts(
                    src as *const u8,
                    PAGE_SIZE,
                );
                for i in 0..length { dst[i] = src[i]; }
            }
            for i in length..PAGE_SIZE { dst[i] = 0; }
        }
    }
}

impl MemoryHandler for ByFrame {
    ...
    fn page_copy(&self, pt: &mut PageTableImpl, va: usize, src: usize, length: usize) {
        let pa = pt.get_entry(va)
            .expect("get pa error!")
            .0
            .addr()
            .as_usize();
        unsafe {
            let dst = core::slice::from_raw_parts_mut(
                access_pa_via_va(pa) as *mut u8,
                PAGE_SIZE,
            );
            if length > 0 {
                let src = core::slice::from_raw_parts(
                    src as *const u8,
                    PAGE_SIZE,
                );
                for i in 0..length { dst[i] = src[i]; }
            }
            for i in length..PAGE_SIZE { dst[i] = 0; }
        }
    }
}
```

由于 ``MemorySet::push`` 的接口发生的变化，我们要将 ``ElfExt::make_memory_set`` 之外的所有 ``push`` 调用最后均加上一个 ``None`` 参数。

现在我们就可以从 ``ElfFile`` 创建用户程序的虚拟内存空间了。