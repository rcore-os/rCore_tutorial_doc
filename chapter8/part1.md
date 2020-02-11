## 编写用户程序

- [代码][code]

本节的工作很类似[第一章第四节**移除 runtime 依赖**](../chapter1/part4.md)的工作，但区别是，[第一章第四节**移除 runtime 依赖**](../chapter1/part4.md)是要完全移除对 runtime 的需求，以构造 OS；而本节需要实现一个支持 U Mode 应用程序的最小 runti ｍ e，这个 runtime 仅仅需要支持很少系统调用访问和基本的动态内存分配。虽然有区别，很多本节很多代码都可以直接参考[第一章第四节**移除 runtime 依赖**](../chapter1/part4.md)的设计思路和代码。

我们的用户程序一般在 CPU 的用户态 (U Mode) 下执行，而它只能通过执行 `ecall` 指令，触发 `Environment call from U-mode` 异常 l 来发出系统服务请求，此时 CPU 进入内核态 (S Mode) ，OS 通过中断服务例程收到请求，执行相应内核服务，并返回到 U Mode。

这一章中，简单起见，内核和用户程序约定两个系统调用

- 在屏幕上输出一个字符，系统调用 $$\text{id}=64$$
- 退出用户线程，系统调用 $$\text{id}=97$$

### 创建用户程序模板

我们的内核能给程序提供的唯一支持就是两个简单的系统调用。

所以我们的用户程序基本还是要使用前两章的方法，不同的则是要把系统调用加入进去。

创建 `usr` 目录，并在 `usr` 目录下使用 Cargo 新建一个二进制项目，再删除掉默认生成的 `usr/rust/src/main.rs` 。

```bash
$ mkdir usr; cd usr
$ cargo new  rust --bin
$ rm usr/rust/src/main.rs
```

加上工具链

```rust
// usr/rust/rust-toolchain
nightly
```

### 建立最小 Runtime 系统

#### 访问系统调用

我们先来看访问系统调用的实现：

```rust
// usr/rust/src/syscall.rs

enum SyscallId {
    Write = 64,
    Exit = 93,
}

#[inline(always)]
fn sys_call(
    syscall_id: SyscallId,
    arg0: usize,
    arg1: usize,
    arg2: usize,
    arg3: usize,
) -> i64 {
    let id = syscall_id as usize;
    let mut ret: i64;
    unsafe {
        asm!(
            "ecall"
            : "={x10}"(ret)
            : "{x17}"(id), "{x10}"(arg0), "{x11}"(arg1), "{x12}"(arg2), "{x13}"(arg3)
            : "memory"
            : "volatile"
        );
    }
    ret
}

pub fn sys_write(ch: u8) -> i64 {
    sys_call(SyscallId::Write, ch as usize, 0, 0, 0)
}

pub fn sys_exit(code: usize) -> ! {
    sys_call(SyscallId::Exit, code, 0, 0, 0);
    loop {}
}
```

看起来很像内核中 `src/sbi.rs` 获取 OpenSBI 服务的代码对不对？其实内核中是在 S Mode 去获取 OpenSBI 提供的 M Mode 服务；这里是用户程序在 U Mode 去获取内核提供的 S Mode 服务。所以看起来几乎一模一样。

相信内核会给我们提供这两项服务，我们可在用户程序中放心的调用 `sys_write, sys_exit` 两函数了！

#### 格式化输出

接着是一些我们在构建最小化内核时用到的代码，有一些变动，但这里不多加赘述。

格式化输出代码：

```rust
// usr/rust/src/io.rs

use crate::syscall::sys_write;
use core::fmt::{self, Write};

pub fn putchar(ch: char) {
    // 这里 OpenSBI 提供的 console_putchar 不存在了
    // 然而我们有了新的依靠：sys_write
    sys_write(ch as u8);
}
//其他部分与os/src/io.rs 一样
......
```

#### 语义项支持

语义项代码：

```rust
// usr/rust/src/lang_items.rs
......
use crate::DYNAMIC_ALLOCATOR;
// 初始化用户堆，用于U Mode中动态内存分配
fn init_heap() {
    const HEAP_SIZE: usize = 0x1000;
    static mut HEAP: [u8; HEAP_SIZE] = [0; HEAP_SIZE];
    unsafe {
        DYNAMIC_ALLOCATOR.lock().init(HEAP.as_ptr() as usize, HEAP_SIZE);
    }
}

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    let location = _info.location().unwrap();
    let message = _info.message().unwrap();
    println!(
        "\nPANIC in {} at line {} \n\t{}",
        location.file(),
        location.line(),
        message
    );
    loop {}
}

// 这里是程序入口
// 调用 main 函数，并利用 sys_exit 系统调用退出
#[no_mangle]
pub extern "C" fn _start(_args: isize, _argv: *const u8) -> ! {
    init_heap();
    sys_exit(main())
}

#[no_mangle]
pub extern fn abort() {
    panic!("abort");
}

#[lang = "oom"]
fn oom(_: Layout) -> ! {
    panic!("out of memory!");
}
```

看起来很像内核中 `src/lang_item.rs` 获取 OpenSBI 服务的代码对不对？其实内核中是在 S Mode 去获取 OpenSBI 提供的 M Mode 服务；这里是用户程序在 U Mode 去获取内核提供的 S Mode 服务。所以看起来几乎一模一样。

#### 形成 runtime lib

还有 `lib.rs`：

```rust
// usr/rust/Cargo.toml

[dependencies]
buddy_system_allocator = "0.3"

// usr/rust/src/lib.rs

#![no_std]
#![feature(asm)]
#![feature(lang_items)]
#![feature(panic_info_message)]
#![feature(linkage)]

extern crate alloc;

#[macro_use]
pub mod io;

pub mod syscall;
pub mod lang_items;

use buddy_system_allocator::LockedHeap;

#[global_allocator]
static DYNAMIC_ALLOCATOR: LockedHeap = LockedHeap::empty();
```

### 应用程序模板

现在我们可以将每一个含有 `main` 函数的 Rust 源代码放在 `usr/rust/src/bin` 目录下。它们每一个都会被编译成一个独立的可执行文件。

其模板为：

```rust
// usr/rust/src/bin/model.rs

#![no_std]
#![no_main]

extern crate alloc;

#[macro_use]
extern crate user;

#[no_mangle]
pub fn main() -> usize {
    0
}
```

这里返回的那个值即为程序最终的返回值。

### Hello World 应用程序

基于上述应用程序模板，我们可以实现一个最简单的`Hello World`程序：

```rust
// usr/rust/src/bin/hello_world.rs

#![no_std]
#![no_main]

extern crate alloc;

#[macro_use]
extern crate user;

#[no_mangle]
pub fn main() -> usize {
    for _ in 0..10 {
        println!("Hello world! from user mode program!");
    }
    0
}
```

和内核项目一样，这里也创建一个 `.cargo/config` 文件指定默认的目标三元组。但这次我们就不用自定义链接脚本了，用默认的即可。

```toml
# .cargo/config

[build]
target = "riscv64imac-unknown-none-elf"
```

切换到 `usr/rust` 目录，就可以进行交叉编译：

```bash
$ cargo build
```

我们将能够在 `usr/rust/target/riscv64imac-unknown-none-elf/debug/hello_world` 看到我们编译出来的可执行文件，接下来的问题就是如何把它加载到内核中执行了！

目前的代码可以在[这里][code]找到。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch8-pa1
