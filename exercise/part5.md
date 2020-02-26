# 5. CPU调度

将 `Round Robin 调度算法` 替换为 `Stride 调度算法` 。（20 分）

## 实验要求

1. 阅读文档第七章，完成编译运行七章代码。
2. 理解 rcore 中实现的 Round Robin 调度算法。
3. 编程：将 `Round Robin 调度算法` 替换为 `Stride 调度算法` 。（20 分）

## 实验指导

- 认真阅读 [ucore doc](https://learningos.github.io/ucore_os_webdocs/lab6/lab6_3_6_1_basic_method.html) 中 stride 调度算法部分。
- 在 `process/scheduler.rs` 中创建 `StrideScheduler` ，为其实现 `Scheduler trait` 。

为降低难度，提供 `sys_wait` 的大致实现，方便同学们 debug（不确定会不会有潜在的 bug ，仅供参考）：

- `process/structs.rs`

```rust
pub struct Thread {
    ...
+   pub wait_ret: Option<isize>,
    ...
}
```

- `syscall.rs`

```rust
fn sys_wait(pid: usize, code: *mut isize) -> isize {
    if process::wait(pid) {
        if let Some(ret) = process::current_thread().wait_ret {
            unsafe {
                *code = ret;
            }
        }
        return 0;
    } else {
        return -10;
    }
}
```

- `process/processor.rs`

```rust
impl Processor {
    pub fn wait(&self, tid: usize) -> bool {
        if let Some(thread_) = &mut self.inner().pool.threads[tid] {
            let wait_tid = thread_.thread.as_mut().unwrap().wait.as_mut().unwrap();
            *wait_tid = self.current_tid();
            self.yield_now(true);
            return true;
        } else {
            return false;
        }
    }

    pub fn exit(&self, code: usize) -> ! {
        ...
        println!("thread {} exited, exit code = {}", tid, code);
        if let Some(wait) = inner.current.as_ref().unwrap().1.wait {
            inner.pool.wakeup(wait, Some(code as isize));
        }
        inner.current.as_mut().unwrap().1.switch_to(&mut inner.idle);
        loop {}
    }
}
```

- `process/thread_pool.rs`

```rust
impl ThreadPool {
    pub fn wakeup(&mut self, tid: Tid, wait_ret: Option<isize>) {
        let proc = self.threads[tid]
            .as_mut()
            .expect("thread not exist when waking up");
        proc.status = Status::Ready;
        let thread = proc.thread.as_mut().expect("thread is none?");
        thread.wait_ret = wait_ret;
        self.scheduler.push(tid);
    }
}
```

> [sys_wait 测试文件（依赖 sys_fork）（可不复制，仅供自行调试用）](https://github.com/rcore-os/rCore_tutorial/blob/master/test/usr/wait_test.rs)
>
> [stride 测试文件（依赖 sys_fork, sys_wait）](https://github.com/rcore-os/rCore_tutorial/blob/master/test/usr/stride_test.rs)
