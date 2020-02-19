# 5. 线程调度

将 `Round Robin 调度算法` 替换为 `Stride 调度算法` （可参考 ）。（20 分）

## 实验要求

1. 阅读文档第七章，并自行实现。
2. 理解 rcore 中实现的 Round Robin 调度算法。
3. 编程实现：将 `Round Robin 调度算法` 替换为 `Stride 调度算法` 。（20 分）

TODO：提供 `sys_wait` 的实现。

## 实验指导

- 认真阅读 [ucore doc](https://learningos.github.io/ucore_os_webdocs/lab6/lab6_3_6_1_basic_method.html) 中 stride 调度算法部分。
- 在 `process/scheduler.rs` 中创建 `StrideScheduler` ，为其实现 `Scheduler trait` 。
