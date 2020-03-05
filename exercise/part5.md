# 5. 用户进程（+ 虚拟内存管理 + 线程管理）

## 实验要求

1. 阅读理解文档第八章。
2. 编程实现：为 rcore 增加 `sys_fork` 。（20 分）

## 实验指导

思考以下问题：

1. 如何控制子进程的返回值？（线程管理）
   <p><font color="white">修改上下文中的 a0 寄存器。</font></p>
2. 目前尚未实现进程切分，是否可以偷懒把线程当进程用？
   <p><font color="white">目前，可以。（出于偷懒甚至不需要维护进程的父子关系）</font></p>
3. 如何复制一个线程？（虚拟内存管理）
   <p><font color="white">分配新的栈、新的页表，并将页表的内容进行复制和映射。</font></p>
4. 为什么这道题这么难分值还和其它题一样？
   <p><font color="white">因为有现成的代码可以参考呀（小声）</font></p>
   <p><font color="white">GitHub: rcore-os/rCore</font></p>

一些可能有用的函数实现（仅供参考）：

```rust
// in syscall.rs
pub const SYS_FORK: usize = 220;
fn sys_fork(tf: &mut TrapFrame) -> isize {
    let new_thread = process::current_thread().fork(tf);
    let tid = process::add_thread(new_thread);
    tid as isize
}

// in paging.rs
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

> [测试文件](https://github.com/rcore-os/rCore_tutorial/blob/master/test/usr/fork_test.rs)
