## 实现记事本

为了实现上节中交互式终端的目标，先不管运行程序，我们首先要能够通过键盘向终端程序中输入。也就是说，我们要实现一个用户程序，它能够接受键盘的输入，并将键盘输入的字符显示在屏幕上。这不能叫一个终端，姑且叫它记事本吧。

这个用户程序需要的功能是：接受键盘输入（可以被称为“标准输入”）的一个字符。

为此我们需约定这样一个系统调用：

* 文件读入，系统调用 $$\text{id}=63$$

我们先在用户程序模板中声明该系统调用：

```rust
// usr/rust/src/syscall.rs

enum SyscallId {
    Read = 63,
}

pub fn sys_read(fd: usize, base: *const u8, len: usize) -> i64 {
    sys_call(SyscallId::Read, fd, base as usize, len, 0)
}
```

这里的系统调用接口设计上是一个记事本所需功能更强的文件读入：传入的参数中，``fd`` 表示文件描述符，``base`` 表示要将读入的内容保存到的虚拟地址，``len`` 表示最多读入多少字节。其返回值是成功读入的字节数。

方便起见，我们还是将这个系统调用封装一下来实现我们所需的功能。

```rust
// usr/rust/src/io.rs

use crate::syscall::sys_read;

// 每个进程默认打开三个文件
// 标准输入 stdin fd = 0
// 标准输出 stdout fd = 1
// 标准错误输出 stderr fd = 2
pub const STDIN: usize = 0;

// 调用 sys_read 从标准输入读入一个字符
pub fn getc() -> u8 {
    let mut c = 0u8;
    assert_eq!(sys_read(STDIN, &mut c, 1), 1);
    c
}
```

接下来我们可以利用 ``getc`` 着手实现我们的记事本了！

```rust
// usr/rust/src/bin/notebook.rs

#![no_std]
#![no_main]

#[macro_use]
extern crate user;

use rust::io::getc;

const LF: u8 = 0x0au8;
const CR: u8 = 0x0du8;

#[no_mangle]
pub fn main() {
    println!("Welcome to notebook!");
    loop {
        let c = getc();
        match c {
            LF | CR => {
                print!("{}", LF as char);
                print!("{}", CR as char)
            }
            _ => print!("{}", c as char)
        }
    }
}
```

很简单，就是将接受到的字符打印到屏幕上。

看一下 ``getc`` 的实现，我们满怀信心 ``sys_read`` 的返回值是 $$1$$ ，也就是确保一定能够读到字符。

### 缓冲区

实际上，我们用一个缓冲区来表示标准输入。你可以将其看作一个字符队列。

* 键盘是生产者：每当你按下键盘，所对应的字符会加入队尾；
* ``sys_read`` 是消费者：每当调用 ``sys_read`` 函数，会将队头的字符取出，并返回。

在 ``sys_read`` 的时候，如果队列不是空的，那么一切都好；如果队列是空的，由于它要保证能够读到字符，因此它只能够等到什么时候队列中加入了新的元素再返回。

而这里的“等”，又有两种等法：

最简单的等法是：在原地 ``while (q.empty()) {}`` 。也就是知道队列非空才跳出循环，取出队头的字符并返回。

另一种方法是：当 ``sys_read`` 发现队列是空的时候，自动放弃 CPU 资源进入睡眠（或称阻塞）状态，也就是从调度单元中移除当前所在线程，不再参与调度。而等到某时刻按下键盘的时候，发现有个线程在等着这个队列非空，于是赶快将它唤醒，重新加入调度单元，等待 CPU 资源分配过来继续执行。

后者相比前者的好处在于：前者占用了 CPU 资源却不干活，只是在原地等着；而后者虽然也没法干活，却很有自知之明的把 CPU 资源让给其他线程使用，这样就提高了 CPU 的利用率。

我们就使用后者来实现 ``sys_read`` 。

### 条件变量

这种线程将 CPU 资源放弃，并等到某个条件满足才准备继续运行的机制，可以使用条件变量 (Condition Variable) 来描述。而它的实现，需要依赖几个新的线程调度机制。

```rust
// src/process/mod.rs

// 当前线程自动放弃 CPU 资源并进入阻塞状态
// 线程状态： Running(Tid) -> Sleeping
pub fn yield_now() {
    CPU.yield_now();
}
// 某些条件满足，线程等待 CPU 资源从而继续执行
// 线程状态： Sleeping -> Ready
pub fn wake_up(tid: Tid) {
    CPU.wake_up(tid);
}
// 获取当前线程的 Tid
pub fn current_tid() -> usize {
    CPU.current_tid()
}

// src/process/processor.rs

impl Processor {
    ...
    pub fn yield_now(&self) {
        let inner = self.inner();
        if !inner.current.is_none() {
            unsafe {
                // 由于要进入 idle 线程，必须关闭异步中断
                // 手动保存之前的 sstatus
                let flags = disable_and_store();
                let tid = inner.current.as_mut().unwrap().0;
                let thread_info = inner.pool.threads[tid].as_mut().expect("thread not existed when yielding");
                // 修改线程状态
                thread_info.status = Status::Sleeping;
                // 切换到 idle 线程
                inner.current
                    .as_mut()
                    .unwrap()
                    .1
                    .switch_to(&mut *inner.idle);
                
                // 从 idle 线程切换回来
				// 恢复 sstatus
                restore(flags);
            }
        }
    }

    pub fn wake_up(&self, tid: Tid) {
        let inner = self.inner();
        inner.pool.wakeup(tid);
    }

    pub fn current_tid(&self) -> usize {
        self.inner().current.as_mut().unwrap().0 as usize
    }
}

// src/process/thread_pool.rs

impl ThreadPool {
    ...
    pub fn wakeup(&mut self, tid: Tid) {
        let proc = self.threads[tid].as_mut().expect("thread not exist when waking up");
        proc.status = Status::Ready;
        self.scheduler.push(tid);
    }
}
```

下面我们用这几种线程调度机制来实现条件变量。
```rust
// src/sync/mod.rs

pub mod condvar;

// src/sync/condvar.rs

use spin::Mutex;
use alloc::collections::VecDeque;
use crate::process::{ Tid, current_tid, yield_now, wake_up };

#[derive(Default)]
pub struct Condvar {
	// 加了互斥锁的 Tid 队列
	// 存放等待此条件变量的众多线程
    wait_queue: Mutex<VecDeque<Tid>>,
}

impl Condvar {
    pub fn new() -> Self {
        Condvar::default()
    }

	// 当前线程等待某种条件满足才能继续执行
    pub fn wait(&self) {
    	// 将当前 Tid 加入此条件变量的等待队列
        self.wait_queue
            .lock()
            .push_back(current_tid());
        // 当前线程放弃 CPU 资源
        yield_now();
    }

	// 条件满足
    pub fn notify(&self) {
    	// 弹出等待队列中的一个线程
        let tid = self.wait_queue.lock().pop_front();
        if let Some(tid) = tid {
        	// 唤醒该线程
            wait_up(tid);
            // 当前线程放弃 CPU 资源
            yield_now();
        }
    }
}
```

讲清楚了机制，下面我们看一下具体实现。

### 缓冲区实现

```rust
// src/fs/mod.rs

pub mod stdio;

// src/fs/stdio.rs

use alloc::{ collections::VecDeque, sync::Arc };
use spin::Mutex;
use crate::process;
use crate::sync::condvar::*;
use lazy_static::*;

pub struct Stdin {
    // 字符队列
    buf: Mutex<VecDeque<char>>,
    // 条件变量
    pushed: Condvar,
}

impl Stdin {
    pub fn new() -> Self {
        Stdin {
            buf: Mutex::new(VecDeque::new()),
            pushed: Condvar::new(),
        }
    }

    // 生产者：输入字符
    pub fn push(&self, ch: char) {
        // 将字符加入字符队列
        self.buf
            .lock()
            .push_back(ch);
        // 如果此时有线程正在等待队列非空才能继续下去
        // 将其唤醒
        self.pushed.notify();
    }

    // 消费者：取出字符
    // 运行在请求字符输入的线程上
    pub fn pop(&self) -> char {
        loop {
            // 将代码放在 loop 里面防止再复制一遍
            
            // 尝试获取队首字符
            let ret = self.buf.lock().pop_front();
            match ret {
                Some(ch) => {
                    // 获取到了直接返回
                    return ch;
                },
                None => {
                    // 否则队列为空，通过 getc -> sys_read 获取字符的当前线程放弃 CPU 资源
                    // 进入阻塞状态等待唤醒
                    self.pushed.wait();
                    
                    // 被唤醒后回到循环开头，此时可直接返回
                }
            }
        }
    }
}

lazy_static! {
    pub static ref STDIN: Arc<Stdin> = Arc::new(Stdin::new());
}
```

### 生产者：键盘中断

首先我们要能接受到外部中断，而 ``OpenSBI`` 默认将外部中断和串口开关都关上了，因此我们需要手动将他们打开：

```rust
// src/interrupt.rs

pub fn init() {
    ...
    
    // enable external interrupt
    sie::set_sext();

    // closed by OpenSBI, so we open them manually
    // see https://github.com/rcore-os/rCore/blob/54fddfbe1d402ac1fafd9d58a0bd4f6a8dd99ece/kernel/src/arch/riscv32/board/virt/mod.rs#L4
    init_external_interrupt();
    enable_serial_interrupt();
}

pub unsafe fn init_external_interrupt() {
    let HART0_S_MODE_INTERRUPT_ENABLES: *mut u32 = access_pa_via_va(0x0c00_2080) as *mut u32;
    const SERIAL: u32 = 0xa;
    HART0_S_MODE_INTERRUPT_ENABLES.write_volatile(1 << SERIAL);
}

pub unsafe fn enable_serial_interrupt() {
    let UART16550: *mut u8 = access_pa_via_va(0x10000000) as *mut u8;
    UART16550.add(4).write_volatile(0x0B);
    UART16550.add(1).write_volatile(0x01);
}
```

随后，我们对外部中断进行处理：

```rust
// src/interrupt.rs

#[no_mangle]
pub fn rust_trap(tf: &mut TrapFrame) {
    ...
    Trap::Interrupt(Interrupt::SupervisorExternal) => external(),
    ...
}
 
fn external() {
    // 键盘属于一种串口设备，而实际上有很多种外设
    // 这里我们只考虑串口
    let _ = try_serial();
}

fn try_serial() -> bool {
    // 通过 OpenSBI 获取串口输入
    match super::io::getchar_option() {
        Some(ch) => {
            // 将获取到的字符输入标准输入
            if (ch == '\r') {
                crate::fs::stdio::STDIN.push('\n');
            }
            else {
                crate::fs::stdio::STDIN.push(ch);
            }
            true
        },
        None => false
    }
}

// src/io.rs

pub fn getchar() -> char {
    let c = sbi::console_getchar() as u8;

    match c {
        255 => '\0',
        c => c as char
    }
}
// 调用 OpenSBI 接口
pub fn getchar_option() -> Option<char> {
    let c = sbi::console_getchar() as isize;
    match c {
        -1 => None,
        c => Some(c as u8 as char)
    }
}
```

### 消费者：sys_read 实现

这就很简单了。

```rust
// src/syscall.rs

pub const SYS_READ: usize = 63;

pub fn syscall(id: usize, args: [usize; 3], tf: &mut TrapFrame) -> isize {
    match id {
        SYS_READ => {
            sys_read(args[0], args[1] as *mut u8, args[2])
        }
        ...
    }
}

// 这里 fd, len 都没有用到
fn sys_read(fd: usize, base: *mut u8, len: usize) -> isize {
    unsafe {
        *base = crate::fs::stdio::STDIN.pop() as u8;
    }
    return 1;
}
```

现在我们可以将要运行的程序从 ``rust/hello_world`` 改成 ``rust/notebook`` 了！运行一下，我们已经实现了字符的输入及显示了！