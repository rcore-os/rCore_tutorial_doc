## 实现上下文环境保存与恢复

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/837b3cbf0603b642f2e2d47ffcbdf7dda58d3a0e)

```riscv
# src/trap/trap.asm

	.section.text
	.globl __alltraps
__alltraps:
	SAVE_ALL
	mv a0, sp
	jal rust_trap

	.globl __trapret
__trapret
	RESTORE_ALL
	sret
```

我们首先定义 ``__alltraps`` 函数作为所有中断处理程序的入口，这里我们首先通过 ``SAVE_ALL`` 来保存上下文环境，随后将当前栈顶地址 ``sp`` 的值给到寄存器 ``a0`` ，这是因为在risc-v calling convention 中，规定 ``a0`` 保存函数输入的第一个参数，于是我们相当于将栈顶地址传给函数 ``rust_trap`` 作为第一个参数。

随后，我们通过 ``jal`` 调用 ``rust_trap`` 函数并在返回之后跳转到调用语句的下一条指令。实际上调用返回之后进入 ``__trapret`` 函数，这里我们通过 ``RESTORE_ALL`` 恢复中断之前的上下文环境，并最终通过一条 ``sret`` 指令跳转到 ``sepc``，回到触发中断的那条指令所在地址。这会导致触发中断的那条指令又被执行一次。

注意，由于这部分用到了 ``SAVE_ALL`` 和 ``RESTORE_ALL`` 两个宏，所以这部分必须写在最下面。

我们定义几个宏：

```asm
# src/trap/trap.asm

# 表示每个寄存器占的字节数，由于是64位，都是8字节
.equ XLENB 8

# 将地址 sp+8×a2 处的值 load 到寄存器 a1 内
.macro LOAD a1, a2
	ld \a1, \a2*XLENB(sp)
.endm

# 将寄存器 a1 内的值 store 到地址 sp+8*a2 内
.macro STORE a1, a2
	sd \a1, \a2*XLENB(sp)
.endm
```

``SAVE_ALL`` 的原理是：将一整个 ``TrapFrame`` 保存在**内核栈**上。我们现在就处在内核态(S 态)，因此现在的栈顶地址 ``sp`` 就指向内核栈地址。但是，之后我们还要支持运行**用户态程序**，顾名思义，要在用户态(U 态)上运行，在中断时栈顶地址 ``sp`` 将指向用户栈顶地址，这种情况下我们要从用户栈切换到内核栈。

```asm
# src/trap/trap.asm

# 规定若在中断之前处于 U 态(用户态)
# 则 sscratch 保存的是内核栈地址
# 否则中断之前处于 S 态(内核态)，sscratch 保存的是 0
.macro SAVE_ALL
	# 通过原子操作交换 sp, sscratch
	# 实际上是将右侧寄存器的值写入中间 csr
	# 并将中间 csr 的值写入左侧寄存器
	csrrw sp, sscratch, sp
	# 如果 sp=0 ，说明交换前 sscratch=0
	# 说明从内核态进入中断，不用切换栈
	# 因此不跳转，继续执行 csrr 再将 sscratch 的值读回 sp
	# 此时 sp,sscratch 均保存内核栈
	
	# 否则 sp!=0，说明从用户态进入中断，要切换栈
	# 由于 sscratch 规定，二者交换后
	# 此时 sp 为内核栈， sscratch 为用户栈
	# 略过 csrr 指令
	
	# 两种情况接下来都是在内核栈上保存上下文环境
	bnez sp, trap_from_user
trap_from_kernel:
	csrr sp, sscratch
trap_from_user:
	# 提前分配栈帧
	addi sp, sp, -36*XLENB
	# 按照地址递增的顺序，保存除x0, x2之外的通用寄存器
	# x0 恒为 0 不必保存
	# x2 为 sp 寄存器，需特殊处理
	STORE x1, 1
	STORE x3, 3
	STORE x4, 4
	...
    STORE x30, 30
    STORE x31, 31
	
	# 若从内核态进入中断，此时 sscratch 为内核栈地址
	# 若从用户态进入中断，此时 sscratch 为用户栈地址
	# 将 sscratch 的值保存在 s0 中，并将 sscratch 清零
	csrrw s0, sscratch, x0
	# 分别将四个寄存器的值保存在 s1,s2,s3,s4 中
	csrr s1, sstatus
	csrr s2, sepc
	csrr s3, stval
	csrr s4, scause
	
	# 将 s0 保存在栈上
	STORE s0, 2
	# 将 s1,s2,s3,s4 保存在栈上
	STORE s1, 32
	STORE s2, 33
	STORE s3, 34
	STORE s4, 35
.endm
```

在 ``SAVE_ALL`` 之后，我们将一整个 ``TrapFrame`` 存在了内核栈上，且在地址区间$$[\text{sp},\text{sp}+36\times8)$$上按照顺序存放了 ``TrapFrame`` 的各个字段。这样，``rust_trap`` 可以通过栈顶地址正确访问 ``TrapFrame`` 了。

而 ``RESTORE_ALL`` 正好是一个反过来的过程：

```asm
# src/trap/trap.asm

.macro RESTORE_ALL
	# s1 = sstatus
	LOAD s1, 32
	# s2 = sepc
	LOAD s2, 33
	# 我们可以通过另一种方式判断是从内核态还是用户态进入中断
	# 如果从内核态进入中断， sstatus 的 SPP 位被硬件设为 1
	# 如果从用户态进入中断， sstatus 的 SPP 位被硬件设为 0
	# 取出 sstatus 的 SPP 
	andi s0, s1, 1 << 8
	# 若 SPP=0 ， 从用户态进入中断，进行 _to_user 额外处理
	bnez s0, _to_kernel
_to_user:
	# 释放在内核栈上分配的内存
	addi s0, sp, 36 * XLENB
	# RESTORE_ALL 之后，如果从用户态进入中断
	# sscratch 指向用户栈地址！
	# 现在令 sscratch 指向内核栈顶地址
	# 如果是从内核态进入中断，在 SAVE_ALL 里面
	# 就把 sscratch 清零了，因此保证了我们的规定
	csrw sscratch, s0
_to_kernel:
	# 恢复 sstatus, sepc 寄存器
	csrw sstatus, s1
	csrw sepc, s2

	# 恢复除 x0, x2(sp) 之外的通用寄存器
	LOAD x1, 1
	LOAD x3, 3
	LOAD x4, 4
	...
	LOAD x31, 31
	
	# 如果从用户态进入中断， sp+2*8 地址处保存用户栈顶地址
	# 切换回用户栈
	# 如果从内核态进入中断， sp+2*8 地址处保存内核栈顶地址
	# 切换回内核栈
	LOAD x2, 2
.endm
```

现在是时候实现中断处理函数 ``rust_trap``了！

```rust
// src/interrupt.rs

// 引入 TrapFrame 结构体
use crate::context::TrapFrame;

// 载入 trap.asm
global_asm!(include_str!("trap/trap.asm"));

pub fn init() {
    unsafe {
        extern "C" {
            // 中断处理总入口
            fn __alltraps();
        }
        // 经过上面的分析，由于现在是在内核态
        // 我们要把 sscratch 初始化为 0
        sscratch::write(0);
        // 仍使用 Direct 模式
        // 将中断处理总入口设置为 __alltraps
        stvec::write(__alltraps as usize, stvec::TrapMode::Direct);
    }
    println!("++++ setup interrupt! ++++");
}

// 删除原来的 trap_handler ，改成 rust_trap 
// 以 &mut TrapFrame 作为参数，因此可以知道中断相关信息
// 在这里进行中断分发及处理
#[no_mangle]
pub fn rust_trap(tf: &mut TrapFrame) {
    println!("rust_trap!");
    // 触发中断时，硬件会将 sepc 设置为触发中断指令的地址
    // 而中断处理结束，使用 sret 返回时也会跳转到 sepc 处
    // 于是我们又要执行一次那条指令，触发中断，无限循环下去
    // 而我们这里是断点中断，只想这个中断触发一次
    // 因此我们将中断帧内的 sepc 字段设置为触发中断指令下一条指令的地址，即中断结束后跳过这条语句
    // 由于 riscv64 的每条指令都是 32 位，4 字节，因此将地址+ 4 即可
    // 这样在 RESTORE_ALL 时，这个修改后的 sepc 字段就会被 load 到 sepc 寄存器中
    // 使用 sret 返回时就会跳转到 ebreak 的下一条指令了
    tf.sepc += 4;
}
```

看起来很对，那我们 ``make run`` 运行一下吧！

> **[danger] infinite rust_trap**
> 
> 结果却不尽如人意，输出了一大堆乱码！
> 

我们使用 `make asm` 检查一下生成的汇编代码，看看是不是哪里出了问题。找到我们手动触发中断的 ``ebreak`` 指令：

```riscv
...
0000000080200010 rust_main:
80200010: 01 11                         addi    sp, sp, -32
80200012: 06 ec                         sd      ra, 24(sp)
80200014: 22 e8                         sd      s0, 16(sp)
80200016: 00 10                         addi    s0, sp, 32
80200018: 97 00 00 00                   auipc   ra, 0
8020001c: e7 80 40 10                   jalr    260(ra)
80200020: 09 a0                         j       2
80200022: 02 90                         ebreak

0000000080200024 .LBB0_3:
80200024: 17 35 00 00                   auipc   a0, 3
...
```

不是说 riscv64 里面每条指令长度为 4 字节吗？我们发现 ``ebreak`` 这条指令仅长为 2 字节。我们将 ``ebreak`` 所在的地址 +4 ，得到的甚至不是一条合法指令的开头，而是下一条指令正中间的地址！这样当然有问题了。

我们回头来看 riscv64 目标三元组中的一个设置：

```json
"features": "+m,+a,+c",
```

实际上，这表示指令集的拓展。``+m`` 表示可以使用整数乘除法指令； ``+a`` 表示可以使用原子操作指令； ``+c`` 表示开启压缩指令集，即对于一些常见指令，编译器会将其压缩到 $$16$$ 位即 $$2$$ 字节，来降低可执行文件的大小！这就出现了上面那种诡异的情况。

所以我们只需将 sepc 修正为 +2：

```diff
-    tf.sepc += 4;
+    tf.sepc += 2;
```

再 ``make run`` 尝试一下：

> **[success] back from trap **
> 
> ```
> ++++ setup interrupt! ++++
> rust_trap!
> panicked at 'end of rust_main', src/init.rs:9:5
> ```
> 

可以看到，我们确实手动触发中断，调用了中断处理函数，并通过上下文保存与恢复机制保护了上下文环境不受到破坏，正确在 ``ebreak`` 中断处理程序返回之后 ``panic``。

迄今为止的代码可以在[这里](https://github.com/rcore-os/rCore_tutorial/tree/837b3cbf0603b642f2e2d47ffcbdf7dda58d3a0e)找到。如果出现了问题的话就来检查一下吧。