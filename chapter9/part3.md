## 实现终端

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/8d655654ec2f3529623ad76377b18c7d8c70303c)

我们的终端也很简单：其功能为你输入想要执行的用户程序如 ``rust/hello_world`` ，随后按下回车，内核就会帮你执行这个程序。

所以，我们需要实现一个新的系统调用：

* 执行程序，系统调用 $$\text{id} = 221$$

终端的实现基于上一节所讲的记事本：

```rust
// usr/rust/src/bin/user_shell.rs

#![no_std]
#![no_main]
#![feature(alloc)]

extern crate alloc;

#[macro_use]
extern crate user;

const LF: u8 = 0x0au8;
const CR: u8 = 0x0du8;

use rust::io::getc;
use rust::syscall::sys_exec;
use alloc::string::String;

#[no_mangle]
pub fn main() {
   println!("Rust user shell");
   // 保存本行已经输入的内容
   let mut line: String = String::new();
   print!(">> ");
   loop {
       let c = getc();
       match c {
           LF | CR => {
               // 如果遇到回车或换行
               println!("");
               if !line.is_empty() {
                   println!("searching for program {}", line);
                   // 使用系统调用执行程序
                   sys_exec(line.as_ptr());
                   // 清空本行内容
                   line.clear();
               }
               print!(">> ");
           },
           _ => {
               // 否则正常输入
               print!("{}", c as char);
               line.push(c as char);
           }
       }
   }
}
```

以及用户态的系统调用

```rust
// usr/rust/src/syscall.rs

enum SyscallId {
    ...
    Exec = 221,
}

// 传入路径字符串的地址
pub fn sys_exec(path: *const u8) {
    sys_call(SyscallId::Exec, path as usize, 0, 0, 0);
}
```

那我们如何在内核中实现这个系统调用呢？大概流程是：

1. 解析传入的路径字符串
2. 创建一个对应的用户线程，并加入调度

现在的问题是我们只有一个输出即输出到屏幕，如果用户线程和终端线程同时运行，他们输出的信息会混杂在一起让我们很难区分。因此我们的做法是：借用上一节阻塞的方法，当终端线程准备启动其他用户线程时，它会放弃 CPU 资源进入阻塞状态；直到被启动的用户线程结束后才唤醒启动它的终端线程。这样就可解决这个问题。

但是也不必使用上一节中的条件变量，我们在线程结构体中加入：

```rust
// src/process/structs.rs

pub struct Thread {
    ...
    pub wait: Option<Tid>,
}
```

这表示正在等待这个线程运行结束的线程 Tid 。在线程退出时：

```rust
// src/process/processor.rs

impl Processor {
    pub fn exit(&self, code: usize) -> ! {
        disable_and_store();
        let inner = self.inner();
        let tid = inner.current.as_ref().unwrap().0;

        inner.pool.exit(tid);
        println!("thread {} exited, exit code = {}", tid, code);

        // 加入这个判断
        // 如果有一个线程正在等待当前线程运行结束
        // 将其唤醒
        if let Some(wait) = inner.current.as_ref().unwrap().1.wait {
            inner.pool.wakeup(wait);
        }
        
        inner.current
            .as_mut()
            .unwrap()
            .1
            .switch_to(&mut inner.idle);

        loop {}
    }
}
```

由于 ``Thread`` 的字段发生了变化，之前所有创建 ``Thread`` 的代码都要做出相应的修改，将 ``wait`` 字段的值设置为 ``None`` 即可。新建用户线程时，要新加入一个参数 ``wait_thread`` 。

```rust
// src/process/structs.rs

impl Thread {
    pub fn new_kernel(entry: usize) -> Box<Thread> {
        unsafe {
            let kstack_ = KernelStack::new();
            Box::new(Thread {
                context: Context::new_kernel_thread(entry, kstack_.top(), satp::read().bits()),
                kstack: kstack_,
				wait: None
            })
        }
    }
    pub fn get_boot_thread() -> Box<Thread> {
        Box::new(Thread {
            context: Context::null(),
            kstack: KernelStack::new_empty(),
			wait: None
        })
    }
    pub unsafe fn new_user(data: &[u8], wait_thread: Option<Tid>) -> Box<Thread> {
        ...
        Box::new(
            Thread {
                context: Context::new_user_thread(entry_addr, ustack_top, kstack.top(), vm.token()),
                kstack: kstack,
                proc: Some(
                    Arc::new(
                        Process {
                            vm: Arc::new(vm)
                        }
                    ),
                ),
                wait: wait_thread
            }
        )
        ...
    }
}
```



现在我们在内核中实现该系统调用：

```rust
// src/syscall.rs

pub const SYS_EXEC: usize = 221;

pub fn syscall(id: usize, args: [usize; 3], tf: &mut TrapFrame) -> isize {
    match id {
        ...
        SYS_EXEC => {
            sys_exec(args[0] as *const u8)
        },
        ...
    }
}

pub unsafe fn from_cstr(s: *const u8) -> &'static str {
    use core::{ slice, str };
    // 使用迭代器获得字符串长度
    let len = (0usize..).find(|&i| *s.add(i) == 0).unwrap();
    str::from_utf8(slice::from_raw_parts(s, len)).unwrap()
}

fn sys_exec(path: *const u8) -> isize {
    let valid = process::execute(unsafe { from_cstr(path) }, Some(process::current_tid()));
    // 如果正常执行，则阻塞终端线程，等到启动的这个用户线程运行结束
    if valid { process::yield_now(); }
    // 不能正常执行，直接返回；或者被启动线程结束后唤醒终端线程之后返回
    return 0;
}

// src/process/mod.rs

// 返回值表示是否正常执行
pub fn execute(path: &str, host_tid: Option<Tid>) -> bool {
    let find_result = ROOT_INODE.lookup(path);
    match find_result {
        Ok(inode) => {
            let data = inode.read_as_vec().unwrap();
            // 这里创建用户线程时，传入 host_tid
            let user_thread = unsafe { Thread::new_user(data.as_slice(), host_tid) };
            CPU.add_thread(user_thread);
            true
        },
        Err(_) => {
            // 如果找不到路径字符串对应的用户程序
            println!("command not found!");
            false
        }
    }
}
```

这样我们在线程初始化中直接调用这个封装好的函数就好了。

```rust
// src/process/mod.rs

pub fn init() {
    ...
    execute("rust/user_shell", None);
    ...
}
```

这里虽然还是将 ``rust/user_shell`` 硬编码到内核中，但是好歹它可以交互式运行其他程序了！

试一试运行 ``rust/hello_world`` ，它工作的很好；``rust/notebook`` 也不赖，但是我们没有实现 ``Ctrl+c`` 的功能，因此就无法从记事本中退出了。随便输入一个不存在的程序，终端也不会崩溃，而是会提示程序不存在！

所有的代码可以在[这里](https://github.com/rcore-os/rCore_tutorial/tree/8d655654ec2f3529623ad76377b18c7d8c70303c)找到。

