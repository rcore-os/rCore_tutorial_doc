## 如何从内核态定向返回

想想在课堂上学到的内容，如果在用户态度我们想要改变返回地址，我们可以修改 `x1(ra)` 寄存器，从内核态返回用户态是一个十分类似的过程，只不过用来描述返回目的地的内容变成了中断帧(`trapframe`)。

```rust
pub struct TrapFrame {
    pub x: [usize; 32],   // General registers
    pub sstatus: Sstatus, // Supervisor Status Register
    pub sepc: usize,      // Supervisor exception program counter
    pub stval: usize,     // Supervisor trap value
    pub scause: Scause,   // Scause register: record the cause of exception/interrupt/trap
}
```

只需要通过修改中断帧我们就可以完全控制从内核态返回后的执行环境。想想新的中断帧应该如何构造呢？新进程没有通用寄存器的信息，我们可以直接初始化为0, `stval`、`scause` 寄存器同理。特殊的通用寄存器 `x2(sp)` 需要我们特殊设置(程序初始化的必要条件，其他的程序会自己搞定)，`sstatus`寄存器对程序状态的控制很重要，需要小心设置。

- `context.rs`

```rust
impl TrapFrame {
    pub fn new_user_thread(entry_addr: usize, sp: usize) -> Self {
        use core::mem::zeroed;
        let mut tf: Self = unsafe { zeroed() };
        tf.x[2] = sp;
        tf.sepc = entry_addr;
        tf.sstatus = sstatus::read();
        tf.sstatus.set_spie(true);　// 使得进入用户态后开启中断
        tf.sstatus.set_sie(false);
        tf.sstatus.set_spp(sstatus::SPP::User);　// 令sret返回Ｕ态
        tf
    }
}
```