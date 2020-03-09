# 7. 同步互斥

## 实验要求

> 本章编程问题较简单，主要难度在阅读代码与问答题

1. 编程：将在实验指导中提供 `Mutex` 的实现框架、`sleep` 的实现、`spawn` 的实现和哲学家就餐问题测试，请将它们复制到你的代码中，并完成 `Mutex` 中的 `TODO` 部分。（8 分）
2. 回答：`Mutex` 的实现中，为什么需要引入 `MutexGuard` ？（3 分）
3. 回答：`Mutex` 的实现中，为什么需要修改 `yield_now` 并增加 `park` ，如果都仍然使用旧的 `yield_now` 会出现什么问题？（3 分）
4. 回答：`sleep` 的实现中，为什么需要在 `idle_main` 中增加一瞬间的中断开启，不增加这部分会出现什么问题？（3 分）
5. 回答：在哲学家就餐测试中，为什么需要修改 `spie` ，如果不进行修改可能会出现什么问题？（3 分）

为了让做题体验更好，我会在下面的代码后再复制一遍上面的题目。

## 实验指导

### `Mutex` 框架

互斥锁（Mutex），用于保护资源不会被多个线程同时操作。

- `sync/mod.rs`

```rust
pub mod condvar;
pub use self::mutex::{Mutex as SleepLock, MutexGuard as SleepLockGuard};
mod mutex;
```

- 创建 `sync/mutex.rs`

这里给出了 `rust std` 库中 Mutext 实现的魔改版，你只需要完成两处（写了 `TODO` 的地方）简单的填空即可。

当 `Mutex<T>` 被一个线程占用时，其它试图访问该线程的线程会主动让出自己的时间片，给其它线程调度。

而当资源使用完毕时，应该能够自动释放资源。

```rust
use crate::interrupt::{disable_and_store, restore};
use crate::process::yield_now;
use core::cell::UnsafeCell;
use core::default::Default;
use core::marker::Sync;
use core::ops::{Deref, DerefMut, Drop};

/// This type provides MUTual EXclusion based on spinning.
pub struct Mutex<T: ?Sized> {
    lock: UnsafeCell<bool>,
    data: UnsafeCell<T>,
}

/// A guard to which the protected data can be accessed
///
/// When the guard falls out of scope it will release the lock.
#[derive(Debug)]
pub struct MutexGuard<'a, T: ?Sized + 'a> {
    lock: &'a mut bool,
    data: &'a mut T,
}

// Same unsafe impls as `std::sync::Mutex`
unsafe impl<T: ?Sized + Send> Sync for Mutex<T> {}
unsafe impl<T: ?Sized + Send> Send for Mutex<T> {}

impl<T> Mutex<T> {
    /// Creates a new spinlock wrapping the supplied data.
    pub const fn new(user_data: T) -> Mutex<T> {
        Mutex {
            lock: UnsafeCell::new(false),
            data: UnsafeCell::new(user_data),
        }
    }

    /// Consumes this mutex, returning the underlying data.
    pub fn into_inner(self) -> T {
        // We know statically that there are no outstanding references to
        // `self` so there's no need to lock.
        let Mutex { data, .. } = self;
        data.into_inner()
    }
}

impl<T: ?Sized> Mutex<T> {
    fn obtain_lock(&self) {
        // TODO
        // try to get lock
        // what to do if get fail?
    }

    /// Locks the spinlock and returns a guard.
    ///
    /// The returned value may be dereferenced for data access
    /// and the lock will be dropped when the guard falls out of scope.
    pub fn lock(&self) -> MutexGuard<T> {
        self.obtain_lock();
        MutexGuard {
            lock: unsafe { &mut *self.lock.get() },
            data: unsafe { &mut *self.data.get() },
        }
    }
}

impl<T: ?Sized + Default> Default for Mutex<T> {
    fn default() -> Mutex<T> {
        Mutex::new(Default::default())
    }
}

impl<'a, T: ?Sized> Deref for MutexGuard<'a, T> {
    type Target = T;
    fn deref(&self) -> &T {
        &*self.data
    }
}

impl<'a, T: ?Sized> DerefMut for MutexGuard<'a, T> {
    fn deref_mut(&mut self) -> &mut T {
        &mut *self.data
    }
}

impl<'a, T: ?Sized> Drop for MutexGuard<'a, T> {
    /// The dropping of the MutexGuard will release the lock it was created from.
    fn drop(&mut self) {
        // TODO
    }
}
```

> 为什么需要引入 `MutexGuard` ？（3 分）

- 修改 `yield_now`

```rust
// in process/processor.rs

impl Processor {
    pub fn yield_now(&self) {
        let inner = self.inner();
        if !inner.current.is_none() {
            unsafe {
                let flags = disable_and_store();
                let current_thread = &mut inner.current.as_mut().unwrap().1;
                current_thread.switch_to(&mut *inner.idle);
                restore(flags);
            }
        }
    }
}
```

- 实现 `park`

```rust
// in process/mod.rs

pub fn park() {
    CPU.park();
}


impl Processor {
    pub fn park(&self) {
        self.inner().pool.set_sleep(self.current_tid());
        self.yield_now();
    }
}

// in process/thread_pool.rs

impl ThreadPool {
    pub fn set_sleep(&mut self, tid: Tid) {
        let proc = self.threads[tid].as_mut().expect("thread not exist");
        proc.status = Status::Sleeping;
    }
}
```

- 将之前所有用到 `yield_now` 的地方（除了 `Mutex.rs`）替换为 `park`

```rust
// in sync/condvar.rs

impl Condvar {
    pub fn wait(&self) {
        self.wait_queue.lock().push_back(current_tid());
        park();
    }
}

// syscall.rs

fn sys_exec(path: *const u8) -> isize {
    let valid = process::execute(unsafe { from_cstr(path) }, Some(process::current_tid()));
    if valid {
        process::park();
    }
    return 0;
}
```

> 为什么需要修改 `yield_now` 并增加 `park` ，如果都仍然使用旧的 `yield_now` 会出现什么问题？（3 分）

### 实现 `sleep`

- 增加计时器 `process/timer.rs`

后面会使用计时器，在线程睡眠时间到了的时候将其唤醒（回调函数设置为 `wakeup(tid)` ）。

```rust
//! A naive timer

use alloc::{boxed::Box, collections::BinaryHeap};
use core::cmp::Ordering;

/// The type of callback function.
type Callback = Box<dyn FnOnce() + Send + Sync + 'static>;

struct Node(u64, Callback);

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        if self.0 < other.0 {
            return Ordering::Greater;
        } else if self.0 > other.0 {
            return Ordering::Less;
        } else {
            return Ordering::Equal;
        }
    }
}

impl Eq for Node {}

impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Node {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

/// A naive timer
#[derive(Default)]
pub struct Timer {
    events: BinaryHeap<Node>,
}

impl Timer {
    /// Add a timer with given `deadline`.
    ///
    /// The `callback` will be called on timer expired.
    pub fn add(&mut self, deadline: u64, callback: impl FnOnce() + Send + Sync + 'static) {
        self.events.push(Node(deadline, Box::new(callback)));
    }

    /// Called on each tick.
    ///
    /// The caller should give the current time `now`, and all expired timer will be trigger.
    pub fn tick(&mut self, now: u64) {
        while let Some(event) = self.events.peek() {
            if event.0 > now {
                return;
            }
            let callback = self.events.pop().unwrap().1;
            callback();
        }
    }
}
```

- 增加 `sleep`

```rust
// timer.rs

pub fn now() -> u64 {
    get_cycle() / TIMEBASE
}

// process/mod.rs

pub mod timer;
use self::timer::Timer;
use crate::timer::now;
use lazy_static::lazy_static;
use spin::Mutex;

lazy_static! {
    static ref TIMER: Mutex<Timer> = Mutex::new(Timer::default());
}

pub fn tick() {
    CPU.tick();
    TIMER.lock().tick(now());
}

pub fn sleep(sec: usize) {
    let tid = current_tid();
    TIMER
        .lock()
        .add(now() + (sec * 100) as u64, move || wake_up(tid));
    park();
}
```

- 修改 `idle`

```rust
// in interrupt.rs

#[inline(always)]
pub fn enable() {
    unsafe {
        asm!("csrsi sstatus, 1 << 1" :::: "volatile");
    }
}

// in process/processor.rs

impl Processor {
    pub fn idle_main(&self) -> ! {
        let inner = self.inner();
        disable_and_store();
        loop {
            if let Some(thread) = inner.pool.acquire() {
                inner.current = Some(thread);
                inner
                    .idle
                    .switch_to(&mut *inner.current.as_mut().unwrap().1);
                let (tid, thread) = inner.current.take().unwrap();
                inner.pool.retrieve(tid, thread);
                enable();
                disable_and_store();
            } else {
                enable_and_wfi();
                disable_and_store();
            }
        }
    }
}
```

> 为什么需要在 `idle_main` 中增加一瞬间的中断开启，不增加这部分会出现什么问题？（3 分）

### 实现 `spawn`

- `process/mod.rs`

```rust
/// Spawn a new kernel thread from function `f`.
pub fn spawn<F>(f: F)
where
    F: FnOnce() + Send + 'static,
{
    let f = Box::into_raw(Box::new(f));
    let new_thread = Thread::new_kernel(entry::<F> as usize);
    new_thread.append_initial_arguments([f as usize, 0, 0]);
    CPU.add_thread(new_thread);

    // define a normal function, pass the function object from argument
    extern "C" fn entry<F>(f: usize) -> !
    where
        F: FnOnce() + Send + 'static,
    {
        let f = unsafe { Box::from_raw(f as *mut F) };
        f();
        exit(0);
        unreachable!()
    }
}
```

### 哲学家就餐问题测试

[测试文件](https://github.com/rcore-os/rCore_tutorial/blob/master/test/mutex_test.rs)

将该文件直接替换 `init.rs` ，五个内核线程均正常退出则表示测试通过。

- 修改 `spie`

```rust
impl ContextContent {
    fn new_kernel_thread(entry: usize, kstack_top: usize, satp: usize) -> ContextContent {
        let mut content = ContextContent {
            ra: __trapret as usize,
            satp,
            s: [0; 12],
            tf: {
                let mut tf: TrapFrame = unsafe { zeroed() };
                tf.x[2] = kstack_top;
                tf.sepc = entry;
                tf.sstatus = sstatus::read();
                tf.sstatus.set_spp(sstatus::SPP::Supervisor);
                tf.sstatus.set_spie(false); // changed
                tf.sstatus.set_sie(false);
                tf
            },
        };
        content
    }
}
```

> 为什么需要修改 `spie` ，如果不进行修改可能会出现什么问题？（3 分）
