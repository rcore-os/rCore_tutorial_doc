## exec 介绍

sys_exec 会中止当前进程并跳转到开始执行另一个制定的程序。

我们先来看看 sys_exec 的接口, 在 linux C 中最主要的接口是

```c
int execve (const char* path,char* const argv[], char*　const envp[]);
```

其中 `path` 表示启动程序所在的路径名,`argv` 表示启动程序所带的参数, `envp` 表示启动程序所需要的环境变量参数。成功时返回0,失败时返回非零值。这里我们先实现简化的版本：

```c
fn sys_exec(path: *const u8)
```

也就是仅仅考虑执行路径，同时简化了失败时的返回值，失败一律返回-1。

来看一个简单的例子:

```rust
// rust/exec.rs
pub fn main() -> usize {
    println!("this is exec_test ^o^");
    sys_exec("/rust/hello_world\0".as_ptr() as *const u8);
    println!("should not arrive here. exec error.");
    0
}
```

输出应该是这个样子，一旦执行sys_exec，原来程序的一切都被抛弃了。

```bash
this is exec_test ^o^
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
Hello world! from user mode program!
thread 1 exited, exit code = 0
```