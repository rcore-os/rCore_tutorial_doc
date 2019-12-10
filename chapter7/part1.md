## 线程管理器

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/83ed61332bc1807fcaf016b3e8d932df1291ade5)

### 线程状态
从调度器的角度来看，每个线程都有一个独一无二的 Tid 来区分它和其他线程。
```rust
// in process/mod.rs

pub type Tid = usize;
pub type ExitCode = usize;
```
同时，线程的状态有下面几种：
```rust
// src/process/struct.rs

use super::{ Tid, ExitCode };

#[derive(Clone)]
pub enum Status {
	// 就绪：可以运行，但是要等到 CPU 的资源分配给它
    Ready,
    // 正在运行
    Running(Tid),
    // 睡眠：当前被阻塞，要满足某些条件才能继续运行
    Sleeping,
    // 退出：该线程执行完毕并退出
    Exited(ExitCode),
}
```

### 调度算法接口设计
在一个线程运行的过程中，调度器需要定期查看当前线程的已运行时间，如果已经达到一个阈值，那么出于公平起见，应该将 CPU 资源交给其他线程，也即切换到其他线程。
查看的间隔不能太长，这样的话等于线程调度根本没起到作用；但是也不能过于频繁， CPU 的资源大量投资在调度器上更是得不偿失。
我们的线程调度算法基于时钟中断，我们会在时钟中断中进入调度器看看当前线程是否需要切换出去。
因此，调度算法的接口 ``Scheduler`` 如下：

```rust
// src/process/mod.rs

pub mod scheduler;

// src/process/scheduler.rs

use super::Tid;

pub trait Scheduler {
	// 如果 tid 不存在，表明将一个新线程加入线程调度
	// 否则表明一个已有的线程要继续运行
    fn push(&mut self, tid: Tid);
    // 从若干可运行线程中选择一个运行
    fn pop(&mut self) -> Option<Tid>;
    // 时钟中断中，提醒调度算法当前线程又运行了一个 tick
    // 返回的 bool 表示调度算法认为当前线程是否需要被切换出去
    fn tick(&mut self) -> bool;
    // 告诉调度算法一个线程已经结束
    fn exit(&mut self, tid: Tid);
}
```
### 线程池接口设计
调度算法 ``Scheduler`` 只管理 Tid ，和线程并没有关系。因此，我们使用线程池 ``Thread`` 来给线程和 Tid 建立联系，将 ``Scheduler`` 的 Tid 调度变成线程调度。
事实上，每个线程刚被创建时并没有一个 Tid ，这是线程池给线程分配的。

```rust
// src/process/mod.rs

pub mod thread_pool;

// src/process/thread_pool.rs

use crate::process::scheduler::Scheduler;
use crate::process::structs::*;
use crate::alloc::{
    vec::Vec,
    boxed::Box,
};
use crate::process::Tid;

// 线程池每个位置的信息
struct ThreadInfo {
	// 占据这个位置的线程当前运行状态
    status: Status,
    // 占据这个位置的线程
    thread: Option<Box<Thread>>,
}

pub struct ThreadPool {
	// 线程池
	// 如果一个位置是 None 表示未被线程占据
    threads: Vec<Option<ThreadInfo>>,
    // 调度算法
    // 这里的 dyn Scheduler 是 Trait object 语法
    // 表明 Box 里面的类型实现了 Scheduler Trait
    scheduler: Box<dyn Scheduler>,
}
```
下面，我们依次来看看线程池的方法：
```rust
// src/process/thread_pool.rs

impl ThreadPool {
	// 新建一个线程池，其最大可容纳 size 个线程，使用调度器 scheduler
    pub fn new(size: usize, scheduler: Box<dyn Scheduler>) -> ThreadPool {
        ThreadPool {
            threads: {
                let mut v = Vec::new();
                v.resize_with(size, Default::default);
                v
            },
            scheduler,
        }
    }
    // 在线程池中找一个编号最小的空着的位置
    // 将编号作为 Tid 返回
    fn alloc_tid(&self) -> Tid {
        for (i, info) in self.threads.iter().enumerate() {
            if info.is_none() {
                return i;
            }
        }
        panic!("alloc tid failed!");
    }
    
    // 加入一个可立即开始运行的线程
    // 线程状态 Uninitialed -> Ready
    pub fn add(&mut self, _thread: Box<Thread>) {
    	// 分配 Tid
        let tid = self.alloc_tid();
        // 修改线程池对应位置的信息
        self.threads[tid] = Some(
            ThreadInfo {
            	// 状态：随时准备运行，等待 CPU 资源中
                status: Status::Ready,
                // 传入线程
                thread: Some(_thread),
            }
        );
        // 将线程的 Tid 加入调度器
        // 提醒调度器给这个线程分配 CPU 资源
        self.scheduler.push(tid);
    }

	// 从线程池中取一个线程开始运行
	// 线程状态 Ready -> Running
    pub fn acquire(&mut self) -> Option<(Tid, Box<Thread>)> {
    	// 调用 Scheduler::pop ，从调度算法中获取接下来要运行的 Tid
        if let Some(tid) = self.scheduler.pop() {
        	// 获取并更新线程池对应位置的信息
            let mut thread_info = self.threads[tid].as_mut().expect("thread not exist!");
            // 将线程状态改为 Running
            thread_info.status = Status::Running(tid);
            return Some((tid, thread_info.thread.take().expect("thread not exist!")));
        }
        else {
            return None;
        }
    }

	// 这个线程已运行了太长时间或者已运行结束，需要将 CPU 资源交出去
    // 但是要提醒线程池它仍需要分配 CPU 资源
    pub fn retrieve(&mut self, tid: Tid, thread: Box<Thread>) {
        // 线程池位置为空，表明这个线程刚刚通过 exit 退出
        if self.threads[tid].is_none() {
            // 不需要 CPU 资源了，退出
            return;
        }
    	// 获取并修改线程池对应位置的信息
        let mut thread_info = self.threads[tid].as_mut().expect("thread not exist!");       
        thread_info.thread = Some(thread);
        // 此时状态可能是 Status::Sleeping
        // 后面会提到线程可能会自动放弃 CPU 资源，进入睡眠状态
        // 直到被唤醒之前都不必给它分配
        // 而如果此时状态时 Running
        // 就说明只是单纯的耗尽了这次分配 CPU 资源
        // 但还要占用 CPU 资源继续执行
        if let Status::Running(_) = thread_info.status {
            // Running -> Ready
            thread_info.status = Status::Ready;
            // 通知线程池继续给此线程分配资源
            self.scheduler.push(tid);
        }
    }

	// Scheduler 的简单包装
	// 时钟中断时查看当前所运行线程是否要切换出去
    pub fn tick(&mut self) -> bool {
        let ret = self.scheduler.tick();
        ret
    }

	// 这个线程已经退出了
	// 线程状态 Running -> Exited
    pub fn exit(&mut self, tid: Tid) {
    	// 清空线程池对应位置
        self.threads[tid] = None;
        // 通知调度器
        self.scheduler.exit(tid);
    }
}
```
现在我们有了一个线程池 ``ThreadPool`` ，它内含调度器，是一个优秀的线程管理器。下一节我们将介绍调度线程 ``idle`` 以及调度单元 ``Processor``。


