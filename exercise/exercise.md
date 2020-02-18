# 练习题

所有题目分数总和：130 ，满分 100 ，超出 100 按 100 计算。

1. 触发并捕获一条非法指令异常（如：mret），并对其进行处理（简单 `print & panic` 即可）。（5 分）
2. 将 `SegmentTreeAllocator` 替换为 `YourAllocator` ，可实现任一你喜欢的内存分配算法，并编写简单的测试样例验证其正确性。（10 分）
3. 详细描述 `process::init` 的执行过程，给出 `switch` 时，重要寄存器的使用情况，画出栈的使用情况。（10 分）
4. 将 `Round Robin 调度算法` 替换为 `Stride Scheduling 调度算法` 。（20 分）
5. 实现 `sys_fork` 。（20 分）
6. 实现 `sys_wait` 。（20 分）
7. 用 rust 重写 [指定 C 程序](https://github.com/chyyuu/ucore_os_lab/blob/master/labcodes/lab6/user/priority.c) ，编译运行。（10 分）
8. 检察 7 的输出结果，应该与 [ucore 实验中的输出](https://github.com/chyyuu/ucore_os_lab/blob/master/labcodes/lab6/tools/grade.sh#L576) 一致。（15 分）
9. 基于 filesystem 实现 pipe ，编写用户程序进行测试。（20 分）

## 实验报告要求

1. 一道题一份实验报告，命名为：`report_X.md` ，X 为题目编号，不接受其它格式的实验报告。
2. 不要在报告里大段粘贴代码，讲清楚实验过程和思路即可。
3. 每道题的报告均会进行字数统计，字数超过 `平均字数 * 3` 或低于 `平均字数 / 3` 的同学可能被酌情扣分。（求求你们别卷了）
4. 若未通过 8 ，则 4/5/6 需要自行编写测试样例验证其正确性。
