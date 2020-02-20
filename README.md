## ***最新通知***

由于本文档还不稳定，将会经常更新，因此大家遇到了 bug 可以第一时间看看这里有无解决方案。

> **[info] 2020-02-20**
> 
> 如果在编译 *buddy_system_allocator* 时报错，可能是本地 crate 版本未更新，只需进入 *os/,usr/* 文件夹下分别 ``cargo update -p buddy_system_allocator`` ，并重新编译即可。
> 
> 如果内核在输出 ``setup process!`` 后 panic 报 page fault ，则很有可能将 ``timer::init`` 函数中的 ``TICKS = 0;`` 注释掉即可正常运行。
>

# rCore Tutorial

这是一个展示如何从零开始用 Rust 语言写一个基于 64 位 RISC-V 架构的操作系统的教程。完成这个教程后，你将可以在内核上运行用户态终端，并在终端内输入命令运行其他程序。

## 代码仓库

左侧章节目录中含有一对方括号"[ ]"的小节表示这是一个存档点，即这一节要对最近几节的代码进行测试。所以我们对每个存档点都设置了一个 commit 保存其完整的状态以供出现问题时参考。

与章节相对应的代码可以很容易的找到。章节标题下提供了指向下一个存档点代码状态的链接。

## 阅读在线文档并进行实验

- [实验 ppt: rcore step-by-step tutorial](https://rcore-os.github.io/rCore_tutorial_doc/os2atc2019/os2atc.html)
- [实验文档：rcore step-by-step tutorial](https://rcore-os.github.io/rCore_tutorial_doc/)
- [实验代码：rcore step-by-step code](https://github.com/rcore-os/rCore_tutorial/)

## 评论区

对于章节内容有任何疑问及建议，请在对应页面最下面的评论区中发表观点。注意需要用 Github ID 登录后才能评论。

好了，那就让我们正式开始！
