## 文件读写

- [代码][code]

> 心态炸了。本来已经写好了，因为文件不小心被删了只能重写一遍。:cry:

我们要在用户态支持文件读写功能。具体的用户态程序如下：

```rust
// usr/rust/src/bin/write.rs

#![no_std]
#![no_main]

extern crate alloc;

#[macro_use]
extern crate user;

use user::io::*;
use user::syscall::{
    sys_open,
    sys_close,
    sys_read,
    sys_write,
};

const BUFFER_SIZE: usize = 20;
const FILE: &'static str = "temp\0";
const TEXT: &'static str = "Hello world!\0";

#[no_mangle]
pub fn main() -> usize {
    // 将字符串写到文件 temp 中
    let write_fd = sys_open(FILE.as_ptr(), O_WRONLY);
    sys_write(write_fd as usize, TEXT.as_ptr(), TEXT.len());
    println!("write to file 'temp' successfully...");
    sys_close(write_fd as i32);

    // 将字符串从文件 temp 读入内存
    let read_fd = sys_open(FILE.as_ptr(), O_RDONLY);
    let mut read = [0u8; BUFFER_SIZE];
    sys_read(read_fd as usize, &read[0] as *const u8, BUFFER_SIZE);
    println!("read from file 'temp' successfully...");

    // 检查功能是否正确
    let len = (0..BUFFER_SIZE).find(|&i| read[i] as u8 == 0).unwrap();
    print!("content = ");
    for i in 0usize..len {
        assert!(read[i] == TEXT.as_bytes()[i]);
        putchar(read[i] as char);
    }
    putchar('\n');
    sys_close(read_fd as i32);
    0
}
```

我们要实现两个新的系统调用：

```rust
// usr/rust/src/syscall.rs

enum SyscallId {
    Open = 56,
    Close = 57,
	...
}

pub fn sys_open(path: *const u8, flags: i32) -> i64 {
    sys_call(SyscallId::Open, path as usize, flags as usize, 0, 0)
}

pub fn sys_close(fd: i32) -> i64 {
    sys_call(SyscallId::Close, fd as usize, 0, 0, 0)
}
```

``sys_open, sys_close`` 的 syscall id 分别为 $$56, 57$$ 。为了说明它们的功能，我们需要先介绍一下文件描述符 (fd, File Descriptor) 的概念。在一个进程内，文件描述符用来描述一个打开的文件，它被所有的线程共享。而 ``sys_open`` 的功能是为当前进程打开一个文件，并返回这个文件对应的文件描述符。这个文件描述符接下来可被读写相关的系统调用 ``sys_read, sys_write`` 利用来访问对应的文件。当所有的访问结束后，进程通过 ``sys_close`` 关闭文件描述符对应的文件，并回收文件描述符。

我们看到，传入 ``sys_open`` 的参数除了 ``path`` 表示文件路径，还有一个标志位 ``flags``。它的作用是控制当前进程对打开文件的读写权限。与 Linux 一致，我们定义下面的标志位：

```rust
// usr/rust/src/io.rs
pub const O_RDONLY: i32 = 0;    // 只读
pub const O_WRONLY: i32 = 1;	// 只写
pub const O_RDWR: i32 = 2;		// 可读可写
pub const O_CREAT: i32 = 64;	// 打开文件时若文件不存在，创建它
pub const O_APPEND: i32 = 1024;	// 从文件结尾开始写入
```

此外，之前定义的 ``sys_write`` 功能太弱，仅支持向标准输出写入单个字符。我们将其按照 ``sys_read`` 的标准重写，支持文件描述符、内存缓冲区以及长度。

```rust
// usr/rust/src/syscall.rs
pub fn sys_write(fd: usize, base: *const u8, len: usize) -> i64 {
    sys_call(SyscallId::Write, fd, base as usize, len, 0)
}
```

调用 ``sys_write`` 的地方也要做相应修改：

```diff
// usr/rust/src/io.rs
pub fn putchar(ch: char) {
-   sys_write(ch as u8);
+   sys_write(STDOUT, &ch as *const char as *const u8, 1);
}
```

注意到我们在打开文件时并没有使用标志位 ``O_CREAT`` ，因此假定文件系统内 ``temp`` 文件一定存在。因此，我们直接把这个文件和众多用户程序一起打包到磁盘镜像中。

```diff
//  usr/Makefile
$(sfsimg): rcore-fs-fuse rust
+   @dd if=/dev/zero of=$(out_dir)/temp bs=1K count=2
	@rcore-fs-fuse --fs sfs $@ $(out_dir) zip 
```

现在用户态准备完毕，我们来看看内核态要做出哪些变化。

首先我们来支持文件描述符机制。它是用来描述进程内打开的文件，而这个结构体我们定义如下：

```rust
// os/src/fs/mod.rs
pub mod file;

// os/src/fs/file.rs
use alloc::sync::Arc;
use rcore_fs::vfs::INode;
use rcore_fs_sfs::INodeImpl;
use crate::fs::ROOT_INODE;

// 文件描述符类型
#[derive(Copy,Clone,Debug)]
pub enum FileDescriptorType {
    FD_NONE,	// 空类型
    FD_INODE,	// INode 类型
    FD_DEVICE,	// 设备类型
}

// 进程内打开的文件
#[derive(Clone)]
pub struct File {
    fdtype: FileDescriptorType,
    // 进程对该文件的权限
    readable: bool,
    writable: bool,
    // 该文件的 INode 指针，用于进行实际读写
    pub inode: Option<Arc<dyn INode>>,
    // 进程中该文件的偏移量指针
    offset: usize,
}
```

一些简单的函数：

```rust
// os/src/fs/file.rs
impl File {
    // 初始化
    pub fn default() -> Self {
        File {
            fdtype: FileDescriptorType::FD_NONE,
            readable: false,
            writable: false,
            inode: None,
            offset: 0,
        }
    }
    // get/set 函数
    pub fn set_readable(&mut self, v: bool) { self.readable = v; }
    pub fn set_writable(&mut self, v: bool) { self.writable = v; }
    pub fn get_readable(&self) -> bool { self.readable }
    pub fn get_writable(&self) -> bool { self.writable }
    pub fn set_fdtype(&mut self, t: FileDescriptorType) { self.fdtype = t; }
    pub fn get_fdtype(&self) -> FileDescriptorType { self.fdtype }
    pub fn set_offset(&mut self, o: usize) { self.offset = o; }
    pub fn get_offset(&self) -> usize { self.offset }
}
```

每个进程都有一个打开的文件列表，我们需要在进程控制块中开一个新的字段 ``ofile`` 。数组中的一项如果是 ``None`` ，表明这个文件描述符可用。

```diff
// os/src/consts.rs
+pub const NOFILE: usize = 16;

// os/src/process/structs.rs
+use crate::fs::file::File;
+use spin::Mutex;
+use alloc::sync::Arc;
pub struct Thread {
    pub context: Context,
    pub kstack: KernelStack,
	pub wait: Option<Tid>,
+   pub ofile: [Option<Arc<Mutex<File>>>; NOFILE],
}
```

在新建内核线程 ``new_kernel`` 以及获得启动线程 ``get_boot_thread`` 中，最终的返回值也需要进行变化：

```diff
// os/src/process/structs.rs
Box::new(Thread {
	...
+   ofile: [None; NOFILE],
})
```

为了能够编译通过，我们需要打开以下开关：

```rust
// os/src/lib.rs
#![feature(const_in_array_repeat_expressions)]
```

新建用户进程 ``new_user`` 中，我们进行类似的初始化，但是要将数组的前三项 $$0,1,2$$ 赋值。这是因为它们分别表示标准输入 (stdin)、标准输出 (stdout)、标准错误输出 (stderr) ，在创建用户进程的时候默认打开。也就是再分配文件描述符的时候，是从 $$3$$ 开始分配的。

```rust
//  os/src/process/structs.rs
impl Thread {
    pub unsafe fn new_user(data: &[u8], wait_thread: Option<Tid>) -> Box<Thread> {
        ...
        let mut thread = Thread {
            context: Context::new_user_thread(entry_addr, ustack_top, kstack.top(), vm.token()),
            kstack: kstack,
            wait: wait_thread,
            ofile: [None; NOFILE],
        };
        for i in 0..3 {
            thread.ofile[i] = Some(Arc::new(Mutex::new(File::default())));
        }
        Box::new(thread)
    }
}
```

在进程中分配、回收文件描述符：

```rust
//  os/src/process/structs.rs
impl Thread {
    // 分配文件描述符
    pub fn alloc_fd(&mut self) -> i32 {
        let mut fd = 0;
        for i in 0usize..NOFILE {
            if self.ofile[i].is_none() {
                fd = i;
                break;
            }
        }
        self.ofile[fd] = Some(Arc::new(Mutex::new(File::default())));
        fd as i32
    }
	// 回收文件描述符
    pub fn dealloc_fd(&mut self, fd: i32) {
        assert!(self.ofile[fd as usize].is_some());
        self.ofile[fd as usize] = None;
    }
}
```

接下来我们看看在内核态中如何实现这些系统调用。

```rust
// os/src/syscall.rs
pub const SYS_OPEN: usize = 56;
pub const SYS_CLOSE: usize = 57;

pub fn syscall(id: usize, args: [usize; 3], tf: &mut TrapFrame) -> isize {
    match id {
        SYS_OPEN => sys_open(args[0] as *const u8, args[1] as i32),
        SYS_CLOSE => sys_close(args[0] as i32),
        SYS_READ => unsafe { sys_read(args[0], args[1] as *mut u8, args[2]) },
        SYS_WRITE => unsafe { sys_write(args[0], args[1] as *const u8, args[2]) },
        ...
    }
}
```

与之前的系统调用不同之处在于，在这些系统调用内，当前进程的进程控制块可能被修改。所以我们需要当前进程进程控制块的可变引用。

```rust
// os/src/process/processor.rs
impl Processor {
    ...
    pub fn current_thread_mut(&self) -> &mut Thread {
        self.inner().current.as_mut().unwrap().1.as_mut()
    }
}
// os/src/process/mod.rs
pub fn current_thread_mut() -> &'static mut Thread {
    CPU.current_thread_mut()
}
```

依次实现这些系统调用。

对于 ``sys_open`` ，分配文件描述符，并找到对应文件的 INode ，将指针保存下来。

```rust
// os/src/syscall.rs
fn sys_open(path: *const u8, flags: i32) -> isize {
    let thread = process::current_thread_mut();
    let fd = thread.alloc_fd() as isize;
    thread.ofile[fd as usize]
        .as_ref()
        .unwrap()
        .lock()
        .open_file(unsafe { from_cstr(path) }, flags);
    fd
}
// os/src/fs/file.rs
pub fn open_file(&mut self, path: &'static str, flags: i32) {
    self.set_fdtype(FileDescriptorType::FD_INODE);
    self.set_readable(true);
    if (flags & 1) > 0 {
        self.set_readable(false);
    }
    if (flags & 3) > 0 {
        self.set_writable(true);
    }
    unsafe {
        self.inode = Some(ROOT_INODE.lookup(path).unwrap().clone());
    }
    self.set_offset(0);
}
```

对于 ``sys_close`` ，直接回收对应的文件描述符即可。

```rust
// os/src/syscall.rs
fn sys_close(fd: i32) -> isize {
    let thread = process::current_thread_mut();
    assert!(thread.ofile[fd as usize].is_some());
    thread.dealloc_fd(fd);
    0
}
```

对于 ``sys_open`` ，如果不是标准输入的话，应该从对应的 INode 中读入。

```rust
// os/src/syscall.rs
unsafe fn sys_read(fd: usize, base: *mut u8, len: usize) -> isize {
    if fd == 0 {
        // 如果是标准输入
        unsafe {
            *base = crate::fs::stdio::STDIN.pop() as u8;
        }
        return 1;
    } else {
        let mut thread = process::current_thread_mut();
        assert!(thread.ofile[fd].is_some());
        let mut file = thread.ofile[fd as usize].as_ref().unwrap().lock();
        assert!(file.get_readable());
        match file.get_fdtype() {
            FileDescriptorType::FD_INODE => {
                let mut offset = file.get_offset();
                let s = file
                    .inode
                    .clone()
                    .unwrap()
                    .read_at(offset, core::slice::from_raw_parts_mut(base, len))
                    .unwrap();
                offset += s;
                file.set_offset(offset);
                return s as isize;
            }
            _ => {
                panic!("fdtype not handled!");
            }
        }
    }
}
```

对于 ``sys_write`` ，如果不是标准输出的话，输入到对应的 INode 中。

```rust
// os/src/syscall.rs
unsafe fn sys_write(fd: usize, base: *const u8, len: usize) -> isize {
    if fd == 1 {
        assert!(len == 1);
        unsafe { crate::io::putchar(*base as char); }
        return 1;
    } else {
        let thread = process::current_thread_mut();
        assert!(thread.ofile[fd].is_some());
        let mut file = thread.ofile[fd as usize].as_ref().unwrap().lock();
        assert!(file.get_writable());
        match file.get_fdtype() {
            FileDescriptorType::FD_INODE => {
                let mut offset = file.get_offset();
                let s = file
                    .inode
                    .clone()
                    .unwrap()
                    .write_at(offset, core::slice::from_raw_parts(base, len))
                    .unwrap();
                offset += s;
                file.set_offset(offset);
                return s as isize;
            }
            _ => {
                panic!("fdtype not handled!");
            }
        }
        0
    }
}
```

让我们测试一下用户程序能否正常运行：

> **[success] 文件读写测试**
> ```rust
> >> rust/write
> searching for program rust/write
> write to file 'temp' successfully...
> read from file 'temp' successfully...
> content = Hello world!
> thread 1 exited, exit code = 0
> ```
> 

所有的代码可以在[这里][code]找到。
[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch9-pa4
