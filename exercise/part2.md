# 2. 物理内存管理

## 实验要求

1. 阅读文档第四章，并自行实现。
2. 回答问题：只从程序的角度来看，你在分配的是什么，它的分配对物理内存是否有影响？（2 分）
3. 编程解决：将 `SegmentTreeAllocator` 替换为 `FirstFitAllocator` ，并完成内部实现（可参考 [ucore](https://github.com/LearningOS/ucore_os_lab/blob/master/labcodes_answer/lab2_result/kern/mm/default_pmm.c#L122)）。（8 分）

## 实验指导

- `FirstFitAllocator` 只需修改 `SegmentTreeAllocator` 接口的内部实现。
- First Fit 就是蛮力寻找第一块大小合适的连续内存进行分配。
- 这里可以简单的用一维数组维护。由于没有性能要求，$O(n^2)$ 查找都行。（如果参考 ucore 反而可能看不懂）

> 该测试在内核态进行，需要替换 `init.rs` 。
> [测试文件](https://github.com/rcore-os/rCore_tutorial/blob/master/test/init.rs)
