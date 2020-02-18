# 练习题

所有题目分数总和：120 ，满分 100 ，超出 100 按 100 计算。

## 1. 中断异常

在任意位置触发一条非法指令异常（如：mret），在 `rust_trap` 中捕获并对其进行处理（简单 `print & panic` 即可）。（10 分）

## 2. 物理内存管理

将 `SegmentTreeAllocator` 替换为 `FirstFitAllocator` ，并完成内部实现（可参考 [ucore](https://github.com/LearningOS/ucore_os_lab/blob/master/labcodes_answer/lab2_result/kern/mm/default_pmm.c#L122)）。（10 分）

## 3. 虚拟内存管理

详细画出执行完 `kernel_remap` 之后的内核页表（可增加 `println` 输出所需信息，）。（10 分）

实现页面替换算法。（20 分）

TODO：增加实现过程和评分方式。@PanQL

## 4. 线程管理

详细描述 `process::init` 的执行过程，给出 `switch` 时，重要寄存器的使用情况，画出栈的使用情况。（10 分）

## 5. 线程调度

将 `Round Robin 调度算法` 替换为 `Stride 调度算法` （可参考 [ucore doc](https://learningos.github.io/ucore_os_webdocs/lab6/lab6_3_6_1_basic_method.html)）。（20 分）

TODO：提供 `sys_wait` 实现。

## 6. 用户进程（+ 虚拟内存管理 + 线程管理）

实现 `sys_fork` 。（20 分）

**思考**

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

## 7. 同步互斥

TODO（20 分）

## 8. 文件系统

基于 filesystem 实现 pipe ，编写用户程序进行测试。（20 分）

> 完整实现较为复杂，故只考虑以下简化情况：只存在一对父子进程之间需要进行数据传输。

实现过程：

1. 父进程调用 pipe ，获得两个文件描述符分别指向管道的读端和写端。
2. fork 产生子进程，子进程拥有同样的文件描述符。（若未实现 fork ，可用其他方式创建两个（自行规定文件描述符为 magic number），不影响得分）
3. 父进程关闭管道读端，子进程关闭管道写端。
4. 父进程向管道中写入数据，子进程将管道中的数据读出。
5. 管道使用环形队列实现。

> 如果父进程还没写数据，子进程就开始读数据会怎么样？

# 实验报告要求

1. 一道题一份实验报告，命名为：`report_X.md` ，`X` 为题号，在仓库目录下创建 `report` 目录并置于该目录下。不接受其它命名/格式的实验报告。
2. 不要在报告里大段粘贴代码，讲清楚实验过程和思路即可。
3. 有需要的话可以新建分支或者保留 commit ，独立检查每个功能。
4. 每道题的报告均会进行字数统计，字数超过 `平均字数 * 3` 或低于 `平均字数 / 3` 的同学可能被酌情扣分。（求求你们别卷了）

<!-- 6. 实现 `sys_wait` 。（20 分）
7. 用 rust 重写 [指定 C 程序](https://github.com/chyyuu/ucore_os_lab/blob/master/labcodes/lab6/user/priority.c) ，编译运行。（10 分）
8. 检察 7 的输出结果，应该与 [ucore 实验中的输出](https://github.com/chyyuu/ucore_os_lab/blob/master/labcodes/lab6/tools/grade.sh#L576) 一致。（15 分）
9.  -->
