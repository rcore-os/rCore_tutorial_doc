## 线程调度测试

我们终于可以来测试一下这一章的代码实现的有没有问题了！

```rust
// src/process/mod.rs

pub fn init() {
    // 使用 Round Robin Scheduler
    let scheduler = RRScheduler::new(1);
    // 新建线程池
    let thread_pool = ThreadPool::new(100, Box::new(scheduler));
	// 新建内核线程 idle ，其入口为 Processor::idle_main
    let idle = Thread::new_kernel(Processor::idle_main as usize);
    // 我们需要传入 CPU 的地址作为参数
    idle.append_initial_arguments([&CPU as *const Processor as usize, 0, 0]);
    // 初始化 CPU
    CPU.init(idle, Box::new(thread_pool));
    
    // 依次新建 5 个内核线程并加入调度单元
    for i in 0..5 {
        CPU.add_thread({
            let thread = Thread::new_kernel(hello_thread as usize);
            // 传入一个编号作为参数
            thread.append_initial_arguments([i, 0, 0]);
            thread
        });
    }
    println!("++++ setup process!   ++++");
}

pub fn run() {
    CPU.run();
}

// src/process/processor.rs

impl Processor {  
	pub fn run(&self) {
        // 运行，也就是从启动线程切换到调度线程 idle
        Thread::get_boot_thread().switch_to(&mut self.inner().idle);
    }
}
```

内核线程的入口点是：

```rust
// src/process/mod.rs

#[no_mangle]
pub extern "C" fn hello_thread(arg: usize) -> ! {
    println!("begin of thread {}", arg);
    for i in 0..800 {
        print!("{}", arg);
    }
    println!("\nend  of thread {}", arg);
    // 通知 CPU 自身已经退出
    CPU.exit(0);
    loop {}
}
```

随后我们在主函数里：

```rust
// src/init.rs

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    ...
    crate::process::run();
    ...
}
```

``make run`` 一下，终于可以看到结果了！