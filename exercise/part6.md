# 6. CPU 调度

> **[info] 文档更新**
>
> 2020-02-26 号进行了一些更新
> 修改了测试文件
> 删掉了对 `sys_wait` 的需求
> 在文件末尾增加了测评方式

## 实验要求

1. 阅读理解文档第七章。
2. 理解 rcore 中实现的 Round Robin 调度算法。
3. 编程：将 `Round Robin 调度算法` 替换为 `Stride 调度算法` 。（20 分）

## 实验指导

- 认真阅读 [ucore doc](https://learningos.github.io/ucore_os_webdocs/lab6/lab6_3_6_1_basic_method.html) 中 stride 调度算法部分。
- 在 `process/scheduler.rs` 中创建 `StrideScheduler` ，为其实现 `Scheduler trait` 。

```rust
// 测试文件需要用到的 syscall id
pub const SYS_SETPRIORITY: usize = 140;
pub const SYS_TIMES: usize = 153;
```

> [stride 测试文件（依赖 sys_fork，sys_gettime）](https://github.com/rcore-os/rCore_tutorial/blob/master/test/usr/stride_test.rs)
>
> `sys_fork` 为上一章要求实现的系统调用，如果未能实现，请向老师/助教提供无需 `sys_fork` 的测试用例（我没 xiang 想 yao 出 mo 优 yu 雅 bu 的 xiang 写 xie 法 le ，所以在这向大家征集了 QAQ）
>
> `sys_gettime` 直接返回 `timer::TICKS` ，记得在每次发生时钟中断时将其加一。或者直接返回 `get_cycle() / TIMEBASE` （参考下一章 `crate::timer::now`）。
>
> 由于 rcore 还不是很完善，尤其是 wait 机制，所以弱化了测例

测试方法：`python3 test.py lab6` ，注意，请多等待一下再退出 Qemu 。

多出来的 `>>` 是由于目前 `rcore` 的 `wait/fork` 不完善导致的（等一位哥哥来修复

检察方式（大概）：，检察 `thread %d exited, exit code = %d` ，捕获 `exit code` ：

```rust
sort(code, code + 5);
for i in 0..5 {
    assert!((code[i] * 2 / code[0] + 1) / 2 == i + 1);
}
```

参考输出：

```rust
main: fork ok.
thread 0 exited, exit code = 0
thread 5 exited, exit code = 638400
thread 4 exited, exit code = 528400
thread 3 exited, exit code = 396800
thread 2 exited, exit code = 269200
thread 1 exited, exit code = 140000
```
