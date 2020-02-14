## 第十三章：线程管理：fork and execute

![hhh](./figures/hhh.jpeg)

### 本章概要

`sys_fork` 用于复制当前线程，`sys_exec` 用于将一个线程的内容修改为一个新的程序。在 99% 的情况下，fork 之后会立刻调用 exec 。Linux 便是这样创建线程的。

> 有没有觉得这样创建线程十分别扭，明明在前面的章节我们已经能够通过 `new_user_thread` 创建新线程了。。。

本章你将会学到：

- fork 的功能
- 如何描述一个正在运行的线程
- 如何完全复制一个正在运行的线程
- TODO：写 execute
