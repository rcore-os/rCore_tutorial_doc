# 内联汇编

Rust 通过 asm！宏来支持使用内联汇编。语法与 GCC & Clang的内联汇编格式类似:

 ```rust
asm!(assembly template
   : output operands
   : input operands
   : clobbers
   : options
   );
 ```

任何 asm 的使用是特征封闭的（需要允许 **#![feature(asm)]** ），当然需要一个 **unsafe** 块。

## 汇编模板

汇编模板(assembly template )是唯一所需的参数，它必须是一个文字字符串（例如，""）：

```rust
#![feature(asm)]

fn foo() {
  unsafe {
    asm!("nop");
  }
}
```

## 操作数

输入操作数(input operands)和输出操作数(output operands)遵循相同的格式："constraints1"(expr1), "constraints2"(expr2), ..."。输出操作数表达式必须是可变左值，或者没有分配内存：

```rust
// Returns the current link register
pub fn lr() -> usize {
    let ptr: usize;
    unsafe {
      asm!("mv $0, ra" : "=r"(ptr));
    }
    ptr
}
```

如果你想在这个位置上使用真正的操作数，然而，你需要把花括号 { } 放在你想要的的寄存器两边，你需要加具体操作数的大小。对于低水平的编程这是非常有用的，在程序中使用哪个寄存器很重要：

```rust
fn sbi_call(which: usize, arg0: usize, arg1: usize, arg2: usize) -> usize {
    let ret;
    unsafe {
        asm!("ecall"
            : "={x10}" (ret)
            : "{x10}" (arg0), "{x11}" (arg1), "{x12}" (arg2), "{x17}" (which)
            : "memory"
            : "volatile");
    }
    ret
}	
```

## Clobbers

一些指令会修改有可能持有不同值的寄存器X，所以我们使用破坏列表(clobbers list)来指示编译器不能保证之前加载载到寄存器X的值将保持有效（因为会被指令修改）。

```rust
// Put the content in addr x0100 into x10
asm!("ld x10, (0x100)" : /* no outputs */ : /* no inputs */ : "{x10}");
```

输入和输出寄存器不需要被列出来，因为信息已经被给定约束传达。否则，任何其他被隐式或显式地使用的寄存器应该列出。如果内联会修改内存，memory 还应该被指定。

## 选择项

最后一部分，options 是 Rust 特有的。形式是逗号分隔字符串（例如：:"foo", "bar", "baz"）。这是用于指定内联汇编的一些额外的信息：　　　　

当前有效的选项是：　　　　

1. *volatile*  这类似于在 gcc/clang 中指定_ _asm__ __volatile__(...) 。　　
2. *alignstack* 某些指定堆的对齐某种方式（例如，SSE）的指令并说明这个指示编译器插入其通常堆栈对齐的代码的指令。　