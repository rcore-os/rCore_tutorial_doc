## 实现换入&换出

在代码的具体实现上，我们参考ucore文档中的设计思路，来实现页面的换入和换出。

### 页面换出

换出一个页面时，我们需要做到以下几点：

* 将页面内容正确写入到磁盘

* 记录页面内容在磁盘中的位置，以便换入时使用

* 修改对应的页表项为不可用，避免页面执行换出之后再次受到访问

同时做到以上三点，我们可以充分利用页表项所在的8个byte（64位情况下一个页表项为8byte）。

首先，并不是所有的页帧都能够被换出，对于内核所在的内存区域，如果允许对应的物理页帧被换出，很可能导致内核崩溃。所以我们在此只允许用户程序所在的物理页帧被换出。在给用户分配物理页帧时，将会获得页帧在内存中的位置以及对应的页表项在内存中的位置，保存上述两个引用，将能够帮助我们在执行换出时正确修改页表项。

```rust
fn push_frame(&mut self, frame: Frame, pg_entry: usize) {
    println!("add frame: {:#x?} pg_entry: {:#x}", frame, 
    pg_entry);
    self.frames.push((frame, pg_entry));
}
```

在执行换出时，我们首先在磁盘的交换分区中找到一个未被使用的位置pg_addr来存储页面内容，然后将页面内容写入到磁盘之后，修改对应页表项的内容：

* addr部分改为pg_addr

* 将valid位置为0，这将导致页面被访问时发生缺页中断

执行上述逻辑的代码如下：
```rust
fn swap_out_one(&mut self) -> Frame {
    let (frame, entry_loc) = self.choose_victim();
    let swap_page: &mut [u8; (1 << 12)] =
        unsafe {frame.as_kernel_mut(PHYSICAL_MEMORY_OFFSET)};
    let entry: &mut PageTableEntry = unsafe { &mut *(entry_loc as *mut PageTableEntry) };
    let mut flags = entry.flags().clone();
    flags.set(EF::VALID, false);
    let pg_addr = disk_page_write(swap_page);
    let disk_frame = Frame::of_addr(PhysAddr::new(pg_addr));
    entry.set(disk_frame, flags);
    println!("{:#x?}", entry);
    frame
}
```

### 页面换入

当发生页面访问异常时，根据之前小节的实现，我们将能够进入异常处理例程，并得到发生异常时一系列寄存器的值组成的trapframe。此时，由于页面换出而发生页面访问异常的页表项，valid位将被置为0，addr部分将是该物理页帧在磁盘交换分区中的位置。我们只需要做到以下几点，即可保证正确换出：

* 根据发生页面访问异常的虚拟地址，正确定位我们所要修改的页表项entry

* 针对entry中的addr，重新分配一个物理页帧frame

    * 如果分配失败，则触发一次换出。如果发现磁盘分区也已用完，则内存耗尽，采取相应处理策略。

* 从磁盘中的addr位置读入一个物理页帧，写入到新分配的frame，并将entry中的addr置为frame所在位置

* 设置entry的valid位为1

具体实现中，我们将第一步由page_fault的异常处理函数完成，获得的页表项引用将传入页面替换管理器的do_pgfault接口，进行余下三步的处理：
```rust
/// 处理缺页中断
fn do_pgfault(&self, entry: &mut PageTableEntry) {
    println!("pgfault addr: {:#x}", entry.addr().as_usize());
    let frame = alloc_frame().unwrap();
    let new_page: &mut [u8; (1 << 12)] = unsafe { frame.as_kernel_mut(PHYSICAL_MEMORY_OFFSET) };
    disk_page_read(entry.addr().as_usize(), new_page);
    entry.flags_mut().set(EF::VALID, true);
    let flags = entry.flags();
    entry.set(frame, flags);
}    
```