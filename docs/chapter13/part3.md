## 复制线程上下文

这个比较简单，先写这个吧。

- `context.rs`

```rust
impl Context {
    pub unsafe fn new_fork(tf: &TrapFrame, kstack_top: usize, satp: usize) -> Context {
        ContextContent::new_fork(tf, kstack_top, satp)
    }
}

impl ContextContent {
    unsafe fn new_fork(tf: &TrapFrame, kstack_top: usize, satp: usize) -> Context {
        ContextContent {
            ra: __trapret as usize,
            satp,
            s: [0; 12],
            tf: {
                let mut tf = tf.clone();
                // fork function's ret value, the new process is 0
                tf.x[10] = 0; // a0
                tf
            },
        }
        .push_at(kstack_top)
    }
}
```

由于将 `ra` 赋值为 `__trapret` ，所以在 `switch` 最后执行 ret 的时候，内核会跳转到 `__trapret` ，因为 `tf` 保存了所有的上下文（包含了 `s[0..12]`），所以无需在 `new_fork` 中为 s 寄存器赋值。

将复制好的上下文放入新创建的 kstack 就可以啦。
