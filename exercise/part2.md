# 2. 物理内存管理

## 实验要求

1. 阅读理解文档第四章。
2. 回答：如果 OS 无法提前知道当前硬件的可用物理内存范围，请问你有何办法让 OS 获取可用物理内存范围？（2 分）
3. 编程：实现 `FirstFitAllocator` ，接口参考 `SegmentTreeAllocator` ，并完成内部实现（可参考 [ucore](https://github.com/LearningOS/ucore_os_lab/blob/master/labcodes_answer/lab2_result/kern/mm/default_pmm.c#L122) 中的算法）。（8 分）

## 实验指导

- First Fit 就是蛮力寻找第一块大小合适的连续内存进行分配。
- 这里可以简单的用一维数组维护。由于没有性能要求，$$O(n^2)$$ 查找都行。（可以参考 ucore ，不过那个相对复杂一些）
- 测试方法：``python3 test.py lab2``，结果保存在 `lab2.result` 文件中。

**说明：需要参考 `init.rs` 增加部分接口**

```rust
pub fn init_allocator(l: usize, r: usize) {
    FRAME_ALLOCATOR.lock().init(l, r);
}

pub fn alloc_frame() -> Option<Frame> {
    alloc_frames(1)
}

// 分配 cnt 块连续的帧
pub fn alloc_frames(cnt: usize) -> Option<Frame> {
    if let Some(frame) = FRAME_ALLOCATOR.lock().alloc(cnt) {
        return Some(Frame::of_ppn(frame));
    }
    return None;
}

pub fn dealloc_frame(f: Frame) {
    dealloc_frames(f, 1)
}

// 释放以 f 为起始地址，cnt 块连续的帧
pub fn dealloc_frames(f: Frame, cnt: usize) {
    FRAME_ALLOCATOR.lock().dealloc(f.number(), cnt)
}
```

> [测试文件](https://github.com/rcore-os/rCore_tutorial/blob/master/test/pmm_test.rs)
>
> 如果输出了 `8/8` ，则表示通过测试，基 ying 本 gai 没有问题
