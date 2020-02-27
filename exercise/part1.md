# 1. 中断异常

## 实验要求

1. 阅读理解文档 1~3 章，并完成环境搭建和编译运行 1~3 章代码。
2. 回答：详细描述 rcore 中处理中断异常的流程（从异常的产生开始）。（2 分）
3. 回答：对于任何中断，`__alltraps` 中都需要保存所有寄存器吗？请说明理由。（2 分）
4. 编程：在任意位置触发一条非法指令异常（如：mret），在 `rust_trap` 中捕获并对其进行处理（简单 `print & panic` 即可）。（6 分）

## 实验帮助

- 参考资料

  - [RV 硬件简要手册-中文](http://crva.ict.ac.cn/documents/RISC-V-Reader-Chinese-v2p1.pdf) ：重点第 10 章
  - [RV 硬件规范手册-英文](https://riscv.org/specifications/privileged-isa/)

- 非法指令可以加在任意位置，比如在通过内联汇编加入，也可以直接修改汇编。
- 查阅参考资料，判断自己触发的异常属于什么类型的，在 `rust_trap` 中完善 `match` 的情况。
