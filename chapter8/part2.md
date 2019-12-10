## 在内核中实现系统调用

* [代码][CODE]

上一节中，我们需要实现两个系统调用：

1. 在屏幕上输出一个字符
2. 结束运行，退出当前线程

这些功能我们的内核都已经实现完毕，因此重点是将系统调用这条调用链建立起来。

```rust
// src/interrupt.rs

#[no_mangle]
pub fn rust_trap(tf: &mut TrapFrame) {
    match tf.scause.cause() {
        ...
        Trap::Exception(Exception::UserEnvCall) => syscall(tf),
        ...
    }
}
```

首先是发现中断原因是在用户态执行 ``ecall`` 指令时，说明用户程序向我们请求服务，我们转入 ``syscall`` 函数。

```rust
// src/interrupt.rs

fn syscall(tf: &mut TrapFrame) {
    // 返回后跳转到 ecall 下一条指令
    tf.sepc += 4;
    let ret = crate::syscall::syscall(
        tf.x[17],
        [tf.x[10], tf.x[11], tf.x[12]],
        tf
    );
    tf.x[10] = ret as usize;
}
```

我们从中断帧中取出中断之前的寄存器 $$a_7,a_0,a_1,a_2$$ 的值，分别表示 syscall id 以及传入的参数。这是通过用户态的内联汇编 ``ecall`` 传给我们的。

我们将系统调用单开一个模块来实现：

```rust
// src/lib.rs

mod syscall;

// src/syscall.rs

use crate::context::TrapFrame;
use crate::process;

pub const SYS_WRITE: usize = 64;
pub const SYS_EXIT: usize = 93;

pub fn syscall(id: usize, args: [usize; 3], tf: &mut TrapFrame) -> isize {
    match id {
        SYS_WRITE => {
            print!("{}", args[0] as u8 as char);
            0
        },
        SYS_EXIT => {
            sys_exit(args[0]);
            0
        },
        _ => {
            panic!("unknown syscall id {}", id);
        },
    }
}

fn sys_exit(code: usize) {
    process::exit(code);
}
```

不必花太多功夫，我们就在内核中支持了两个系统调用！

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/86abde4d
