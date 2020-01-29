## 线程调度之 Round Robin 算法

* [代码][CODE]

时间片轮转调度算法(Round Robin)的基本思想是让每个线程在就绪队列中的等待时间与占用CPU的执行时间成正比例。其大致实现是：
1. 将系所有的就绪线程按照FCFS原则，排成一个就绪队列。
2. 每次调度时将CPU分派（dispatch）给队首进程，让其执行一个时间片。
3. 在时钟中断时，统计比较当前线程时间片是否已经用完。
　- 如用完，则调度器（scheduler）暂停当前进程的执行，将其送到就绪队列的末尾，并通过切换执行就绪队列的队首进程。
　- 如没用完，则线程继续使用。

对于不同的调度算法，我们实现了一个调度接口框架如下：

```rust
pub trait Scheduler {
    fn push(&mut self, tid: Tid);　　　　//把Tid线程放入就绪队列
    fn pop(&mut self) -> Option<Tid>;　 //从就绪队列取出线程
    fn tick(&mut self) -> bool;　　　　　//时钟tick（代表时间片）处理
    fn exit(&mut self, tid: Tid);　　　　//线程退出
}
```

时间片轮转调度算法对上述四个函数接口有具体的实现。这里我们直接给出时间片轮转调度算法的实现代码，有兴趣者可自行去研究算法细节。

```rust
// src/process/scheduler.rs

use alloc::vec::Vec;

#[derive(Default)]
struct RRInfo {
    valid: bool,
    time: usize,
    prev: usize,
    next: usize,
}

pub struct RRScheduler {
    threads: Vec<RRInfo>,
    max_time: usize,
    current: usize,
}

impl RRScheduler {
    // 设置每个线程连续运行的最大 tick 数
    pub fn new(max_time_slice: usize) -> Self {
        let mut rr = RRScheduler {
            threads: Vec::default(),
            max_time: max_time_slice,
            current: 0,
        };
        rr.threads.push(
            RRInfo {
                valid: false,
                time: 0,
                prev: 0,
                next: 0,
            }
        );
        rr
    }
}
impl Scheduler for RRScheduler {
    // 分为 1. 新线程 2. 时间片耗尽被切换出的线程 两种情况
    fn push(&mut self, tid : Tid) {
        let tid = tid + 1;
        if tid + 1 > self.threads.len() {
            self.threads.resize_with(tid + 1, Default::default);
        }

        if self.threads[tid].time == 0 {
            self.threads[tid].time = self.max_time;
        }

        let prev = self.threads[0].prev;
        self.threads[tid].valid = true;
        self.threads[prev].next = tid;
        self.threads[tid].prev = prev;
        self.threads[0].prev = tid;
        self.threads[tid].next = 0;
    }

    fn pop(&mut self) -> Option<Tid> {
        let ret = self.threads[0].next;
        if ret != 0 {
            let next = self.threads[ret].next;
            let prev = self.threads[ret].prev;
            self.threads[next].prev = prev;
            self.threads[prev].next = next;
            self.threads[ret].prev = 0;
            self.threads[ret].next = 0;
            self.threads[ret].valid = false;
            self.current = ret;
            Some(ret-1)
        }else{
            None
        }
    }

    // 当前线程的可用时间片 -= 1
    fn tick(&mut self) -> bool{
        let tid = self.current;
        if tid != 0 {
            self.threads[tid].time -= 1;
            if self.threads[tid].time == 0 {
                return true;
            }else{
                return false;
            }
        }
        return true;
    }

    fn exit(&mut self, tid : Tid) {
        let tid = tid + 1;
        if self.current == tid {
            self.current = 0;
        }
    }
}
```

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/ch7-pa4
