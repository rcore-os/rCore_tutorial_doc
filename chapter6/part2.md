## 线程切换

我们要用这个函数完成线程切换：

```rust
// src/process/structs.rs

impl Thread {
    pub fn switch_to(&mut self, target: &mut Thread) {
        unsafe {
            self.context.switch(&mut target.context);
        }
    }
}
```

通过调用 ``switch_to`` 函数将当前正在执行的线程切换为另一个线程。实现方法是两个 ``Context`` 的切换。

```rust
// src/context.rs

impl Context {
    #[naked]
    #[inline(never)]
    pub unsafe extern "C" fn switch(&mut self, target: &mut Context) {
        asm!(include_str!("process/switch.asm") :::: "volatile");
    }
}
```

这里需要对两个宏进行一下说明：

* ``#[naked]`` ，告诉 rust 编译器不要给这个函数插入任何开场白 (prologue) 以及结语 (epilogue) 。
  我们知道，一般情况下根据 calling convention ，编译器会自动在函数开头为我们插入设置寄存器、栈（比如保存 callee-save 寄存器，分配局部变量等工作）的代码作为开场白，结语则是将开场白造成的影响恢复。
  
* ``#[inline(never)]`` ，告诉 rust 编译器永远不要将该函数**内联**。

  内联 (inline) 是指编译器对于一个函数调用，直接将函数体内的代码复制到调用函数的位置。而非像经典的函数调用那样，先跳转到函数入口，函数体结束后再返回。这样做的优点在于避免了跳转；但却加大了代码容量。

  有时编译器在优化中会将未显式声明为内联的函数优化为内联的。但是我们这里要用到调用-返回机制，因此告诉编译器不能将这个函数内联。

这个函数我们用汇编代码 ``src/process/switch.asm`` 实现。

由 calling convention ，我们知道的是寄存器 $$a_0,a_1$$ 分别保存“当前线程栈顶地址”所在的地址，以及“要切换到的线程栈顶地址”所在的地址。

所以要做的事情是：

1. 将当前的 CPU 状态保存到当前栈上，并更新“当前线程栈顶地址”，通过写入寄存器 $$a_0$$ 值所指向的内存；
2. 读取寄存器 $$a_1$$ 值所指向的内存获取“要切换到的线程栈顶地址”，切换栈，并从栈上恢复 CPU 状态

```riscv
# src/process/switch.asm

.equ XLENB, 8
.macro Load a1, a2 
	ld \a1, \a2*XLENB(sp)
.endm
.macro Store a1, a2 
	sd \a1, \a2*XLENB(sp)
.endm
	# 在当前栈上分配空间保存当前 CPU 状态
    addi sp, sp, -14*XLENB
    # 更新“当前线程栈顶地址”
    sd sp, 0(a0)
    # 依次保存各寄存器的值
    Store ra, 0
    Store s0, 2
    Store s1, 3
    ...
    Store s10, 12
    Store s11, 13
    csrr s11, satp
    Store s11, 1
	# 当前线程状态保存完毕
	
	# 准备恢复到“要切换到的线程”
	# 读取“要切换到的线程栈顶地址”，并直接换栈
    ld sp, 0(a1)
    # 依序恢复各寄存器
    Load s11, 1
    # 恢复页表寄存器 satp，别忘了使用屏障指令 sfence.vma 刷新 TLB
    csrw satp, s11
    sfence.vma
    Load ra, 0
    Load s0, 2
    Load s1, 3
    ...
    Load s10, 12
    Load s11, 13
    # 各寄存器均被恢复，恢复过程结束
    # “要切换到的线程” 变成了 “当前线程”
    # 在当前栈上回收用来保存线程状态的内存
    addi sp, sp, 14*XLENB

	# 将“当前线程的栈顶地址”修改为 0
	# 这并不会修改当前的栈
	# 事实上这个值只有当对应的线程停止时才有效
	# 这里主要是标志这个线程开始运行了
    sd zero, 0(a1)
    ret
```

这里需要说明的是：

1. 我们是如何利用函数调用及返回机制的

   我们说为了线程能够切换回来，我们要保证切换前后线程状态不变。这并不完全正确，事实上 $$\text{PC}$$ 发生了变化：在切换回来之后我们需要从 ``switch_to`` 返回之后的第一条指令继续执行！

   因此可以较为巧妙地利用函数调用及返回机制：在调用 ``switch_to`` 函数之前编译器会帮我们将 $$\text{ra}$$ 寄存器的值改为 ``switch_to`` 返回后第一条指令的地址。所以我们恢复 $$\text{ra}$$ ，再调用 $$\text{ret: pc}\leftarrow\text{ra}$$ ，这样会跳转到返回之后的第一条指令。

2. 为何不必保存全部寄存器

   因此这是一个函数调用，由 calling convention ，编译器会自动生成代码在调用前后帮我们保存、恢复所有的 caller-saved 寄存器。于是乎我们需要手动保存所有的 callee-saved 寄存器 $$\text{s}_0\sim\text{s}_{11}$$ 。这样所有的寄存器都被保存了。

下面一节我们来研究如何进行线程初始化。