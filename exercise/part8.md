# 8. 文件系统

## 实验要求

1. 阅读理解文档第九章，并确保已经在之前的实验中实现了 ``sys_fork`` 系统调用。
2. 编程实现：基于第九章的内容，支持 pipe ，使得给定的用户态测试程序得到正确的结果。（20 分）

## 实验指导

新增如下系统调用：

```rust
// usr/rust/src/syscall.rs
enum SyscallId {
    ...
    Pipe = 59,
}

pub fn sys_pipe(pipefd: &mut[i32; 2]) -> i64;
```

``sys_pipe`` 的功能是：为当前进程创建一个管道，并返回两个文件描述符分别代表它的读端和写端。

[测试程序](https://github.com/rcore-os/rCore_tutorial/blob/master/test/usr/pipe_test.rs)的功能如下：

1. 父进程调用 ``sys_pipe`` ，创建管道并获得两个文件描述符分别指向管道的读端和写端。
2. 调用 ``sys_fork`` 产生子进程，子进程拥有同样的文件描述符。
3. 父进程关闭管道读端，子进程关闭管道写端。
4. 父进程向管道中写入数据，子进程将管道中的数据读出。

从测试程序中可以看出：
1. 针对于管道的情形，``sys_read/sys_write`` 每次只需读/写一个字符；
2. 为了能够得到正确的输出，``sys_read`` 在当前管道为空的情况下需要将子进程阻塞等待父进程向管道写入字符。

测试方法：``python3 test.py lab8``。

其参考输出为：

```rust
fd_read = 3, fd_write = 4
forking
message sent to child process pid 1!
thread 0 exited, exit code = 0
message received in child process = Hello world!
thread 1 exited, exit code = 0
```

## 思考题
1. 如果父进程还没写数据，子进程就开始读数据会怎么样？应如何解决？
2. 简要说明你是如何保证读者和写者对于管道 ``Pipe`` 的访问不会触发 race condition 的？
3. 在实现中是否曾遇到死锁？如果是，你是如何解决它的？

## 提示
* 在 ``os/src/fs/file.rs`` 新增 ``FileDescriptorType::FD_PIPE``，并在 ``File`` 内保存 ``Pipe`` 的指针。``Pipe`` 可以用一个环形队列来实现，维护两个指针表示读者和写者当前所在的位置。
* 拓展原来的 ``sys_read, sys_close`` 来支持管道。
* 拓展原来的 ``sys_fork`` 支持文件描述符的复制。
* 灵活利用 ``Arc, spin::Mutex`` 等 wrapper 实现同步互斥。

