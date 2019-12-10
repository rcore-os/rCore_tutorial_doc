## 编写用户程序

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/d4608fc1def1514dda3c3b66a477fd6e2f6a0e85)

### 系统调用

我们的用户程序一般在 CPU 的用户态 (U Mode) 下执行，而它只能通过执行 ``ecall`` 指令，触发 ``Environment call from U-mode`` 异常，并进入内核态 (S Mode) ，执行内核的中断服务例程，获取内核服务。

这一章中，简单起见，内核和用户程序约定两个系统调用

* 在屏幕上输出一个字符，系统调用 $$\text{id}=64$$
* 退出用户线程，系统调用 $$\text{id}=97$$

### 创建用户程序模板

我们的内核能给程序提供的唯一支持就是两个简单的系统调用。

所以我们的用户程序基本还是要使用前两章的方法，不同的则是要把系统调用加入进去。

在 ``os/usr`` 目录下使用 Cargo 新建一个二进制项目

```bash
$ cargo new rust --bin --edition 2018
```

首先删除掉默认生成的 ``usr/rust/src/main.rs`` 。

加上工具链

```rust
// usr/rust/rust-toolchain

nightly-2019-12-08
```

我们先来看系统调用：

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

看起来很像内核中 ``src/sbi.rs`` 获取 OpenSBI 服务的代码对不对？其实内核中是从 S Mode 去获取 OpenSBI 提供的 M Mode 服务；这用户程序中是从 U Mode 中去获取内核提供的 S Mode 服务。所以看起来几乎一模一样。

相信内核会给我们提供这两项服务，我们可在用户程序中放心的调用 ``sys_write, sys_exit`` 两函数了！

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

pub fn puts(s: &str) {
    for ch in s.chars() {
        putchar(ch);
    }
}

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => ({
        $crate::io::_print(format_args!($($arg)*));
    });
}

#[macro_export]
macro_rules! println {
    () => ($crate::print!("\n"));
    ($($arg:tt)*) => ($crate::print!("{}\n", format_args!($($arg)*)));
}

struct Stdout;

impl fmt::Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        puts(s);
        Ok(())
    }
}

pub fn _print(args: fmt::Arguments) {
    Stdout.write_fmt(args).unwrap();
}
```

语义项代码：

```rust
// usr/rust/src/lang_items.rs

use core::panic::PanicInfo;
use crate::syscall::sys_exit;
use core::alloc::Layout;

#[linkage = "weak"]
#[no_mangle]
fn main() -> usize {
    panic!("No main() linked");
}

use crate::DYNAMIC_ALLOCATOR;
// 初始化用户堆
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

还有 ``lib.rs``：

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

现在我们可以将每一个含有 ``main`` 函数的 rust 源代码放在 ``usr/rust/src/bin`` 目录下。它们每一个都会被编译成一个独立的可执行文件。

其模板为：

```rust
// usr/rust/src/bin/model.rs

#![no_std]
#![no_main]
#![feature(alloc)]

extern crate alloc;

#[macro_use]
extern crate rust;

#[no_mangle]
pub fn main() -> usize {
    0
}
```

这里返回的那个值即为程序最终的返回值。

所以我们实现一个最简单的程序：

```rust
// usr/rust/src/bin/hello_world.rs

#![no_std]
#![no_main]
#![feature(alloc)]

extern crate alloc;

#[macro_use]
extern crate rust;

#[no_mangle]
pub fn main() -> usize {
    for _ in 0..10 {
        println!("Hello world! from user mode program!");
    }
    0
}
```

为了能够编译，我们还需要一个目标三元组，只不过这里，我们不需要再通过链接脚本手动执行内存布局了！

```json
// usr/rust/riscv64-rust.json

{
  "llvm-target": "riscv64",
  "data-layout": "e-m:e-p:64:64-i64:64-n64-S128",
  "target-endian": "little",
  "target-pointer-width": "64",
  "target-c-int-width": "32",
  "os": "none",
  "arch": "riscv64",
  "cpu": "generic-rv64",
  "features": "+m,+a",
  "max-atomic-width": "64",
  "linker": "rust-lld",
  "linker-flavor": "ld.lld",
  "executables": true,
  "panic-strategy": "abort",
  "relocation-model": "static",
  "abi-blacklist": [
    "cdecl",
    "stdcall",
    "fastcall",
    "vectorcall",
    "thiscall",
    "aapcs",
    "win64",
    "sysv64",
    "ptx-kernel",
    "msp430-interrupt",
    "x86-interrupt"
  ],
  "eliminate-frame-pointer": false
}
```

切换到 ``usr/rust`` 目录，就可以进行交叉编译：

```bash
$ cargo xbuild --target riscv64-rust.json
```

我们将能够在 ``usr/rust/target/riscv64-rust/debug/hello_world`` 看到我们编译出来的可执行文件，接下来的问题就是如何把它加载到内核中执行了！

目前的代码可以在[这里](https://github.com/rcore-os/rCore_tutorial/tree/d4608fc1def1514dda3c3b66a477fd6e2f6a0e85)找到。