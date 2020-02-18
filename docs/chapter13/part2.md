## fork 实现思路

在前面的章节，我们就已经实现了 Thread 结构体，为了满足新的需求，我们需要加上一行：

```diff
+ use alloc::sync::Arc;
+ use spin::Mutex;

pub struct Thread {
    pub context: Context,                   // 程序切换产生的上下文所在栈的地址（指针）
    pub kstack: KernelStack,                // 保存程序切换产生的上下文的栈
    pub wait: Option<Tid>,                  // 等待队列
+   pub vm: Option<Arc<Mutex<MemorySet>>>,  // 页表
}
```

为什么需要保存一个页表呢？这是因为 fork 复制了当前线程，这包括了它的运行栈。这里的运行栈就包括在了页表里。由于我们使用了虚拟地址，所以只要保证访问的虚拟地址能映射到正确的物理地址即可。所以，为了能够知道原线程都用了哪些虚拟地址，我们需要保存每一个线程的页表，供其它线程复制。

由于只有用户程序会进行 fork ，所以我们只为用户程序保存 vm ，内核线程的 vm 直接赋为 None 。

- `struct.rs`

```rust
impl Thread {
    pub fn new_kernel(entry: usize) -> Box<Thread> {
        unsafe {
            let kstack_ = KernelStack::new();
            Box::new(Thread {
                context: Context::new_kernel_thread(entry, kstack_.top(), satp::read().bits()),
                kstack: kstack_,
                wait: None,
                vm: None,
            })
        }
    }

    pub fn get_boot_thread() -> Box<Thread> {
        Box::new(Thread {
            context: Context::null(),
            kstack: KernelStack::new_empty(),
            wait: None,
            vm: None,
        })
    }

    pub unsafe fn new_user(data: &[u8], wait_thread: Option<Tid>) -> Box<Thread> {
        ...
        Box::new(Thread {
            context: Context::new_user_thread(entry_addr, ustack_top, kstack.top(), vm.token()),
            kstack: kstack,
            wait: wait_thread,
            vm: Some(Arc::new(Mutex::new(vm))),
        })
    }
}
```

复制线程的工作看起来十分简单，把所有东西都 clone 一遍就好了：

- `struct.rs`

```rust
use crate::context::{Context, TrapFrame};

impl Thread {
    /// Fork a new process from current one
    pub fn fork(&self, tf: &TrapFrame) -> Box<Thread> {
        let kstack = KernelStack::new();                    // 分配新的栈
        let vm = self.vm.as_ref().unwrap().lock().clone();  // 为变量分配内存，将虚拟地址映射到新的内存上（尚未实现）
        let vm_token = vm.token();
        let context = unsafe { Context::new_fork(tf, kstack.top(), vm_token) }; // 复制上下文到 kernel stack 上（尚未实现）
        Box::new(Thread {
            context,
            kstack,
            wait: self.wait.clone(),
            vm: Some(Arc::new(Mutex::new(vm))),
        })
    }
}
```

线程的 tid 是在 `thread_pool.add` 里进行分配的，由于 fork 需要为父线程返回子线程的 tid ，所以这里需要为 `thread_pool.add` 增加返回值：

- `process/mod.rs`

```rust
pub fn add_thread(thread: Box<Thread>) -> usize {
    CPU.add_thread(thread)
}
```

- `process/processor.rs`

```rust
pub fn add_thread(&self, thread: Box<Thread>) -> Tid {
    self.inner().pool.add(thread)
}
```

- `process/thread_pool.rs`

```rust
pub fn add(&mut self, _thread: Box<Thread>) -> Tid {
    let tid = self.alloc_tid();
    self.threads[tid] = Some(ThreadInfo {
        status: Status::Ready,
        thread: Some(_thread),
    });
    self.scheduler.push(tid);
    return tid;
}
```

最后，实现 syscall 的代码就只有下面十几行：

- `process/mod.rs`

```rust
pub fn current_thread() -> &'static Box<Thread> {
    CPU.current_thread()
}
```

- `process/processor`

```rust
impl Processor {
    pub fn current_thread(&self) -> &Box<Thread> {
        &self.inner().current.as_mut().unwrap().1
    }
}
```

- `syscall.rs`

```rust
pub const SYS_FORK: usize = 57;

pub fn syscall(id: usize, args: [usize; 3], tf: &mut TrapFrame) -> isize {
    match id {
        SYS_FORK => sys_fork(tf),
        ...
    }
}

fn sys_fork(tf: &mut TrapFrame) -> isize {
    let new_thread = process::current_thread().fork(tf);
    let tid = process::add_thread(new_thread);
    tid as isize
}
```

> 吐槽一下，我最开始写 `current_thread` 的时候，返回的时候需要 clone 一下，感觉这样安全一些，省的外部不小心把 thread 修改了。
> 结果这导致了一个很严重而且很隐蔽的问题：thread 的 kernel stack 被释放了。。。
> 花了半天才找到问题，这是由于 Thread 有一个成员 kernel stack ，kernel stack 实现了 Drop trait ，析构的时候会把占用的内存一起释放掉。
> 而由于 kernel stack 存的是指针（首地址） ，clone 后的指针和原指针指向的是同一个地方！
> 所以在析构的时候，会把原来的 stack 也释放了。。。
> awsl

anyway ，fork 的实现思路大概就是这样。注意到前面有几个标注了“尚未实现”的函数，接下来我们来实现它们。

> 出于偷懒我并没有维护这两个线程的父子关系，感兴趣的同学可以自 bang 行 wo 实现（逃
