## 内核调度线程 idle

调度线程 idle 是一个内核线程，它的作用是

* 当没有任何其他线程时，idle 线程运行并循环检测是否能从线程池中找到一个可运行的线程，如果能找到的话就切换过去；
* 当某个线程被调度器决定交出 CPU 资源并切换出去（如它已运行了很久，或它运行结束）时，并不是直接切换到下一个线程，而是先切换回 idle 线程，随后同样进行上述的循环尝试从线程池中找到一个可运行线程并切换过去。

在介绍 idle 线程的实现之前，我们先要将 idle 线程所需的各种资源封装在一起：

```rust
// src/process/mod.rs

pub mod processor;

// src/process/processor.rs

use core::cell::UnsafeCell;
use alloc::boxed::Box;
use crate::process::Tid;
use crate::process::structs::*;
use crate::process::thread_pool::ThreadPool;
use crate::interrupt::*;
use crate::context::ContextContent;

// 调度单元 Processor 的内容
pub struct ProcessorInner {
    // 线程池
    pool: Box<ThreadPool>,
    // idle 线程
    idle: Box<Thread>,
    // 当前正在运行的线程
    current: Option<(Tid, Box<Thread>)>,
}
```

我们需要 ``ProcessorInner`` 能够全局访问，因为启动线程和调度线程 idle 以及 idle 所管理的线程都会访问它。在处理这种数据的时候我们需要格外小心。

我们在第四章内存管理中介绍内存分配器时也曾遇到过同样的情况，我们想要实现 ``static mut`` 的效果使得多个线程均可修改，但又要求是**线程安全**的。当时我们的处理方法是使用 ``spin::Mutex`` 上一把锁。这里虽然也可以，但是有些大材小用了。因为这里的情况更为简单一些，所以我们使用下面的方法就足够了。

```rust
// src/process/processor.rs

pub struct Processor {
    inner: UnsafeCell<Option<ProcessorInner>>,
}

unsafe impl Sync for Processor {}

// src/process/mod.rs

static CPU: Processor = Processor::new();
```

这里面我们将实例 ``CPU`` 声明为 ``static`` 。编译器认为 ``Processor`` 不一定能够安全地允许多线程访问，于是声明一个 ``static`` 实例是会报错的。

因此我们为 ``Processor`` 实现 ``Sync Trait`` 告诉编译器这个结构体可以安全的在多个线程中拥有其值的引用，从而允许多线程访问。你并不需要实现任何方法，因为这只是一个标记。它是 ``unsafe`` 的，也就是说编译器认为它也许不是线程安全的，你却信誓旦旦地向它保证了这一点，那么如果出了问题的话就只能靠你自己解决了。

那么 ``mut`` 又在哪里？注意到我们使用 ``UnsafeCell<T>`` 来对 ``ProcessInner`` 进行了包裹，``UnsafeCell<T>`` 提供了**内部可变性 (Interior mutability)**，即使它本身不是 ``mut`` 的，仍能够修改内部所包裹的值。另外还有很多种方式可以提供内部可变性。

接下来首先来看 ``Processor`` 的几个简单的方法：

```rust
// src/process/processor.rs

impl Processor {
    // 新建一个空的 Processor
    pub const fn new() -> Processor {
        Processor {
            inner: UnsafeCell::new(None),
        }
    }

    // 传入 idle 线程，以及线程池进行初始化
    pub fn init(&self, idle: Box<Thread>, pool: Box<ThreadPool>) {
        unsafe {
            *self.inner.get() = Some(
                ProcessorInner {
                    pool,
                    idle,
                    current: None,
                }
            );
            
        }
    }

    // 内部可变性：获取包裹的值的可变引用
    fn inner(&self) -> &mut ProcessorInner {
        unsafe { &mut *self.inner.get() }
            .as_mut()
            .expect("Processor is not initialized!")
    }
    
    // 通过线程池新增线程
    pub fn add_thread(&self, thread: Box<Thread>) {
        self.inner().pool.add(thread);
    }
}
```

idle 线程与其他它所管理的线程相比有一点不同之处：它不希望被异步中断打断！否则会产生很微妙的错误。

尤其是时钟中断，设想一个线程时间耗尽，被切换到 idle 线程进行调度，结果还没完成调度又进入时钟中断开始调度。这种情况想必很难处理。

为此，在 idle 线程中，我们要关闭所有的中断，同时在在适当的时机恢复中断。下面给出几个函数：

```rust
// src/interrupt.rs

#[inline(always)]
pub fn disable_and_store() -> usize {
    let sstatus: usize;
    unsafe {
        // clear sstatus 的 SIE 标志位禁用异步中断
        // 返回 clear 之前的 sstatus 状态
        asm!("csrci sstatus, 1 << 1" : "=r"(sstatus) ::: "volatile");
    }
    sstatus
}

#[inline(always)]
pub fn restore(flags: usize) {
    unsafe {
        // 将 sstatus 设置为 flags 的值
        asm!("csrs sstatus, $0" :: "r"(flags) :: "volatile");
    }
}

#[inline(always)]
pub fn enable_and_wfi() {
    unsafe {
        // set sstatus 的 SIE 标志位启用异步中断
        // 并通过 wfi 指令等待下一次异步中断的到来
        asm!("csrsi sstatus, 1 << 1; wfi" :::: "volatile");
    }
}
```

接下来，我们来看 idle 线程的最核心函数，也是其入口点：

```rust
// src/process/processor.rs

impl Processor {
    pub fn run(&self) -> ! {
        let inner = self.inner();
        // 在 idle 线程刚进来时禁用异步中断
        disable_and_store();

        loop {
            // 如果从线程池中获取到一个可运行线程
            if let Some(thread) = inner.pool.acquire() {
                // 将自身的正在运行线程设置为刚刚获取到的线程
                inner.current = Some(thread);
                // 从正在运行的线程 idle 切换到刚刚获取到的线程
                println!("\n>>>> will switch_to thread {} in CPU.run()!", inner.current.as_mut().unwrap().0);
                inner.idle.switch_to(
                    &mut *inner.current.as_mut().unwrap().1
                );
                
                // 上个线程时间耗尽，切换回调度线程 idle
                println!("<<<< switch_back to idle in CPU.run()!");
                // 此时 current 还保存着上个线程
                let (tid, thread) = inner.current.take().unwrap();
				// 通知线程池这个线程需要将资源交还出去
                inner.pool.retrieve(tid, thread);
            }
            // 如果现在并无任何可运行线程
            else {
                // 打开异步中断，并等待异步中断的到来
                enable_and_wfi();
                // 异步中断处理返回后，关闭异步中断
                disable_and_store();
            }
        }
    }
}
```

如果现在都没有任何可运行线程了，那实际上我们也不会进行任何调度，所以即使遇到了时钟中断我们也不怕。而且此时，进入中断是唯一可能给我们提供一些新的线程运行的手段。

所以我们打开并默默等待中断的到来。待中断返回后，这时可能有线程能够运行了，我们再关闭中断，进入调度循环。

接下来，看看如何借用时钟中断进行周期性调度：

```rust
// src/interrupt.rs

use crate::process::tick;
// 时钟中断
fn super_timer(tf: &mut TrapFrame) {
    clock_set_next_event();
    tick();
}

// src/process/mod.rs

pub fn tick() {
    CPU.tick();
}

// src/process/processor.rs

impl Processor {
	pub fn tick(&self) {
        let inner = self.inner();
        if !inner.current.is_none() {
            // 如果当前有在运行线程
            if inner.pool.tick() {
                // 如果当前运行线程时间耗尽，需要被调度出去
                
                // 我们要进入 idle 线程了，因此必须关闭异步中断
                // 我们可没保证 switch_to 前后 sstatus 寄存器不变
                // 因此必须手动保存
                let flags = disable_and_store();
                
                // 切换到 idle 线程进行调度
                inner.current
                    .as_mut()
                    .unwrap()
                    .1
                    .switch_to(&mut inner.idle);
                
                // 之后某个时候又从 idle 线程切换回来
                // 恢复 sstatus 寄存器继续中断处理
                restore(flags);
            }
        }
    }
}
```

从一个被 idle 线程管理的线程的角度来看，从进入时钟中断到发现自己要被调度出去，整个过程都还是运行在这个线程自己身上。随后被切换到 idle 线程，又过了一段时间之后从 idle 线程切换回来，继续进行中断处理。

当然 idle 线程也会进入时钟中断，但这仅限于当前无任何其他可运行线程的情况下。我们可以发现，进入这个时钟中断并不影响 idle 线程正常运行。

接下来，一个线程如何通过 Processor 宣称自己运行结束并退出。这个函数也是在该线程自身上运行的。

```rust
// src/process/processor.rs

impl Processor {
    pub fn exit(&self, code: usize) -> ! {
        // 由于要切换到 idle 线程，必须先关闭时钟中断
        disable_and_store();
        // 由于自己正在执行，可以通过这种方式获取自身的 tid
        let inner = self.inner();
        let tid = inner.current.as_ref().unwrap().0;

        // 通知线程池这个线程退出啦！
        inner.pool.exit(tid);
        println!("thread {} exited, exit code = {}", tid, code);
       	
        // 切换到 idle 线程决定下一个运行哪个线程
        inner.current
            .as_mut()
            .unwrap()
            .1
            .switch_to(&mut inner.idle);

        loop {}
    }
}

// src/process/mod.rs

pub fn exit(code: usize) {
    CPU.exit(code);
}
```

至此我们说明了调度线程 idle 以及调度单元 Processor 。但我们之前还挖了一个坑，也就是上一节中，调度算法我们只提供了一个接口但并未提供具体实现。下一节我们就来介绍一种最简单的调度算法实现。
