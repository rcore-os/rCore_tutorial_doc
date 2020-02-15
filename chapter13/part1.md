## fork 介绍

fork 的功能是复制一个运行中的程序，具体来说就是一个程序在某一时刻发起 sys_fork 进入中断，由操作系统将此时的程序复制。从中断返回后，两个程序都会继续执行 fork 的下一条指令。

fork 产生的新线程，除了返回值不一样，其它都完全一样。通过返回值，我们可以让两个线程进行不同的操作。

**fork 的返回值：**

- 如果是父线程（原线程），则返回子线程（新线程）的 tid
- 如果是子线程（新线程），则 0

规范和细节听起来很麻烦，我们直接看例子：

- `usr/rust/src/syscall.rs`

```rust
enum SyscallId {
    Fork = 57,
    ...
}

pub fn sys_fork() -> i64 {
    sys_call(SyscallId::Fork, 0, 0, 0, 0)
}
```

- `usr/rust/src/bin/fork.rs`

```rust
#![no_std]
#![no_main]

#[macro_use]
extern crate user;

use user::syscall::sys_fork;

#[no_mangle]
pub fn main() -> usize {
    let tid = sys_fork();
    let tid = sys_fork();
    if tid == 0 {
        println!("I am child");
    } else {
        println!("I am father");
    }
    println!("ret tid is: {}", tid);
    0
}
```

- 输出

```bash
I am child
ret tid is: 0
thread 3 exited, exit code = 0
I am father
ret tid is: 3
thread 2 exited, exit code = 0
I am child
ret tid is: 0
thread 4 exited, exit code = 0
I am father
ret tid is: 4
thread 1 exited, exit code = 0
```

从结果来看，一共退出了四次程序，所以一共进行了三次 fork ：

1. 第三行，`thread 1` fork 产生 `thread 2`
2. `thread 1` 执行第四行，产生 `thread 3`
3. `thread 2` 执行第四行，产生 `thread 4`

每个线程都只输出两行，以及一行程序退出时由操作系统输出的信息。可以看出 `thread 1` 和 `thread 2` 都声称自己是 father ，这是由于它们在第四行 fork 之后，分别成为了 `thread 3` 和 `thread 4` 的 father 。需要注意的是，`thread 1` 还是 `thread 2` 的 father 哦。至于线程的执行顺序，那就看调度器算法咯。。。
