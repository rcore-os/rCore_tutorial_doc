## 创建虚拟内存空间

- [代码][code]

### ELF 文件解析与内存空间创建

为了能让用户程序运行起来，内核首先要给它分配用户内存空间，即创建一个虚拟内存空间供它使用。由于用户程序要通过中断访问内核的代码，因此它所在的虚拟内存空间必须也包含内核的各代码段和数据段。

ELF 文件与只含有代码和数据的纯二进制文件不同，需要我们手动去解析它的文件结构来获得各段的信息。所幸的是， rust 已经有 `crate xmas-elf`帮我们实现了这一点。

> **[info]ELF 执行文件格式**
>
> ELF(Executable and Linking Format)文件格式是 Linux 系统下的一种常用目标文件(object file)格式，有三种主要类型，我们主要关注的是用于执行的可执行文件(Executable File)类型，它提供了程序的可执行代码/数据内容，加载的内存空间布局描述等。 这也是本实验的 OS 和应用的执行文件类型。可参考[ELF 描述](https://wiki.osdev.org/ELF)进一步了解相关信息。

对 ELF 文件解析与内存空间创建的处理，需要解析出 ELF 文件中的关键的段（如 code 段、data 段、BSS 段等），并把段的内容拷贝到段设定的地址中，设置好相关属性。这需要对虚拟内存相关的[`MemorySet` 和 `MemoryArea`](../chapter5/part5.md) 的相关实现进行扩展。具体修改如下：

### 解析 ELF 文件

```rust
// src/process/structs.rs
trait ElfExt {
    fn make_memory_set(&self) -> MemorySet;
}
// 给一个用户程序的ELF可执行文件创建虚拟内存空间
impl ElfExt for ElfFile<'_> {
    fn make_memory_set(&self) -> MemorySet {
        // MemorySet::new()的实现中已经映射了内核各数据、代码段，以及物理内存段
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
                vaddr,   vaddr + mem_size,
                ph.flags().to_attr(), //将elf段的标志转化为我们熟悉的 MemoryAttr
                ByFrame::new(),
                Some((data.as_ptr() as usize, data.len())),
            );
        }
        memory_set
    }
}
......
```

###　建立对应的虚拟内存空间

我们对 [`MemorySet` 和 `MemoryArea`](../chapter5/part5.md) 的接口略作修改：

```rust
// src/memory/memory_set/mod.rs
impl MemorySet {
    ...
    pub fn push(&mut self, start: usize, end: usize, attr: MemoryAttr, handler: impl MemoryHandler, data: Option<(usize, usize)>) {
		...
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
    ......

// src/memory/memory_set/area.rs
impl MemoryArea {
    ...
    pub fn page_copy(&self, pt: &mut PageTableImpl, src: usize, length: usize) {
        let mut l = length;
        let mut s = src;
        for page in PageRange::new(self.start, self.end) {
            // 交给 MemoryHandler 逐页进行复制
            self.handler.page_copy(pt, page, s, l...);
            s += PAGE_SIZE;
            if l >= PAGE_SIZE { l -= PAGE_SIZE; }
        }
     ......
// src/memory/memory_set/handler.rs
pub trait MemoryHandler: Debug + 'static {
    ...
    fn page_copy(&self, pt: &mut PageTableImpl, va: usize, src: usize, length: usize);
}

impl MemoryHandler for Linear {
    ...
    fn page_copy(&self, pt: &mut PageTableImpl, va: usize, src: usize, length: usize) {
        let pa = pt.get_entry(va)...;
        unsafe {
            let dst = core::slice::from_raw_parts_mut(va...);
            if length > 0 {
                let src = core::slice::from_raw_parts(src...);
                for i in 0..length { dst[i] = src[i]; }
            }
            for i in length..PAGE_SIZE { dst[i] = 0; }
        }
    }
}

impl MemoryHandler for ByFrame {
    ...
    fn page_copy(&self, pt: &mut PageTableImpl, va: usize, src: usize, length: usize) {
    //类似fn page_copy() in mpl MemoryHandler for Linear
    ......
}

// src/memory/paging.rs
// 这里有两处要改成 pub ，其他不必做改动
pub struct PageEntry(pub &'static mut PageTableEntry, Page);

impl PageTableImpl {
    ...
    pub fn get_entry(&mut self, va: usize) -> Option<&mut PageEntry> {
        let page = Page::of_addr(VirtAddr::new(va));
        if let Ok(e) = self.page_table.ref_entry(page.clone()) {
            let e = unsafe { &mut *(e as *mut PageTableEntry) };
            self.entry = Some(PageEntry(e, page));
            Some(self.entry.as_mut().unwrap())
        }
        else {
            None
        }
    }
	...
}
```

由于 `MemorySet::push` 的接口发生的变化，我们要将 `ElfExt::make_memory_set` 之外的所有 `push` 调用最后均加上一个 `None` 参数。

现在我们就可以从 `ElfFile` 创建用户程序的虚拟内存空间了。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch8-pa4
