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