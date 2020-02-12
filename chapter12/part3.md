## 最简单的FIFO页面替换算法实现

在上一小节中我们介绍了如何实现页面的换入换出，本小节中我们将换入换出的基本操作组织为一个页面替换算法框架，并在这个框架下实现最简单的FIFO页面替换算法，且进行简单验证。

### 算法框架

对于各个页面替换算法，理论课上会有详细的对比和评估，我们不展开介绍。在这里我们尝试抽取各个算法的共同点：
```rust
pub trait PageReplace: Send {
    /// 将可被置换的物理页帧纳入算法
    fn push_frame(&mut self, frame: Frame, pg_entry: usize);
    /// 选择要被置换的物理页帧
    fn choose_victim(&mut self) -> (Frame, usize);
    /// 1 复制页帧的内容到磁盘
    /// 2 并记录页帧所在磁盘位置到页表项中
    /// 3 返回可用的物理页帧
    fn swap_out_one(&mut self) -> Frame {
        let (frame, entry_loc) = self.choose_victim();
        let swap_page: &mut [u8; (1 << 12)] =
            unsafe { frame.as_kernel_mut(PHYSICAL_MEMORY_OFFSET) };
        let entry: &mut PageTableEntry = unsafe { &mut *(entry_loc as *mut PageTableEntry) };
        let mut flags = entry.flags().clone();
        flags.set(EF::VALID, false);
        let pg_addr = disk_page_write(swap_page);
        let disk_frame = Frame::of_addr(PhysAddr::new(pg_addr));
        entry.set(disk_frame, flags);
        println!("{:#x?}", entry);
        frame
    }
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
    /// 传递时钟中断（用于积极页面置换策略）
    fn tick(&self);
}
```

为内核提供换出操作以及换入操作，是各个页面替换算法的共性之一。执行换出时的差异主要在于：选择要换出的页面以及是否主动换出。我们将这个差异抽离为choose_victim接口以及tick接口。执行换入时各个算法几乎完全一致（在我们的实现框架中），因此我们将换入操作统一实现到do_pgfault接口中。

### FIFO

对于FIFO算法而言，维护一个页面的链表，每次换出时从表头选择，分配新的页面时加入到链表尾部即可。

```rust
pub struct FifoPageReplace {
    frames: Vec<(Frame, usize)>,
}

impl PageReplace for FifoPageReplace {
    fn push_frame(&mut self, frame: Frame, pg_entry: usize) {
        println!("add frame: {:#x?} pg_entry: {:#x}", frame, pg_entry);
        self.frames.push((frame, pg_entry));
    }

    fn choose_victim(&mut self) -> (Frame, usize) {
        // 选择一个已经分配的物理页帧
        self.frames.remove(0)
    }

    fn tick(&self) {}
}
```