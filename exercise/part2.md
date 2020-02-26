# 2. 物理内存管理

## 实验要求

1. 阅读理解文档第四章，并完成编译运行4章代码。
2. 回答：如果OS无法提前知道当前硬件的可用物理内存范围，请问你有何办法让OS获取可用物理内存范围？（2 分）
3. 编程：将 `SegmentTreeAllocator` 替换为 `FirstFitAllocator` ，并完成内部实现（可参考 [ucore](https://github.com/LearningOS/ucore_os_lab/blob/master/labcodes_answer/lab2_result/kern/mm/default_pmm.c#L122)）。（8 分）

## 实验指导

- `FirstFitAllocator` 只需修改 `SegmentTreeAllocator` 接口的内部实现。
- First Fit 就是蛮力寻找第一块大小合适的连续内存进行分配。
- 这里可以简单的用一维数组维护。由于没有性能要求，$O(n^2)$ 查找都行。（如果参考 ucore 反而可能看不懂）

> 该测试在内核态进行，需要替换 `init.rs` 。
> [测试文件](https://github.com/rcore-os/rCore_tutorial/blob/master/test/init.rs)
