## exec 的实现

在 `sys_exec` 的语义中，我们需要完成的过程包括：
* 1.回收当前进程(Thread)的所有资源
* 2.为新进程申请足够的资源、读取解析镜像
* 3.跳转到新进程开始执行

原进程的资源在进程控制块中：

```rust
pub struct Thread {
    pub context: Context,
    pub kstack: KernelStack,
    pub wait: Option<Tid>,
    pub vm: Option<Arc<Mutex<MemorySet>>>,
}
```

我们不析构这一结构体，而是替换其中内容。其中 `context` 用来是的其他进程跳转到该进程，新进程会在被替换出去的时候设置，我们不需要改变(留好位置就行)，在我们的实现中 `wait` 的含义是结束后需要唤醒的进程，我们可以直接继承(或者说为了简便实现，我们没有提供改变的接口)，`kstack` 仅仅在执行内核代码时使用，进入用户态后一定是空的，仅仅起提供空间的作用，可以直接继承。所以我们只需要改变 `vm`。

因此干如下几件事情：
* 1.为新进程申请足够的资源、读取解析镜像，构造新 `vm`
* 2.替换 `vm`，并激活新页表供用户态使用
* 3.跳转到新进程开始执行

来看代码实现：

```rust
// 输入参数包含了执行程序的位置以及中断帧，其中中断帧用来改变syscall返回时返回的地址
fn sys_exec(path: *const u8, tf: &mut TrapFrame) -> isize {
    let exec_path = unsafe { from_cstr(path) };
    let find_result = ROOT_INODE.lookup(exec_path);
    match find_result {
        Ok(inode) => {
            let data = inode.read_as_vec().unwrap();
            // 该函数完成elf的解析和vm的构造(仅仅重新封装了　Thread::new_user 的部分实现), entry_addr 是新程序的入口地址，ustack_top是用户栈栈顶
            let (mut vm, entry_addr, ustack_top) = unsafe { Thread::new_user_vm(data.as_slice()) };
            //　读取当前进程的进程控制块
            let proc = process::current_thread();
            // 设置新vm
            core::mem::swap(&mut *proc.vm.as_ref().unwrap().lock(), &mut vm);
            // 切换satp(页表)
            unsafe {
                proc.vm.as_ref().unwrap().lock().activate();
            }
            // 仅仅是为了尽早释放锁
            drop(proc);
            //　构造新的tf来改变syscall返回后返回的程序
            *tf = TrapFrame::new_user_thread(entry_addr, ustack_top);
            0
        }
        Err(_) => {
            println!("exec error! cannot find the program {}", exec_path);
            -1
        }
    }
}
```

结合一些接口上的简单修改(`syscall`->`sys_exit`的内容，不赘述)，我们就完成了sys_exec的实现，是不是特别简单呢？我们还没有解决的问题是如何使得 `syscall` 返回的时候返回到新的进程开始执行(`TrapFrame::new_user_thread`)。这将在下一部分细说。

我们替换了原本的sys_exec(实际是一个spawn)，是的它不再可被用户太访问了，除非提供一个新的系统调用。

完成了 sys_fork 和　sys_exec 我们可以对应改写 user_shell 的内容：

```rust
#[no_mangle]
pub fn main() {
    println!("Rust user shell");
    let mut line: String = String::new();
    print!(">> ");
    loop {
        let c = getc();
        match c {
            LF | CR => {
                println!("");
                if !line.is_empty() {
                    println!("searching for program {}", line);
                    // 使用fork和exec完成原本的spawn的功能
                    if sys_fork() == 0 {
                        line.push('\0');
                        sys_exec(line.as_ptr());
                        sys_exit(0);
                    }
                    line.clear();
                }
                print!(">> ");
            }
            _ => {
                print!("{}", c as char);
                line.push(c as char);
            }
        }
    }
}
```

user_shell同时也完成了exec的简单测试。