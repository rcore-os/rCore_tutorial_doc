## 实现格式化输出

只能使用 ``console_putchar`` 这种苍白无力的输出手段让人头皮发麻。如果我们能使用 ``print!`` 宏的话该有多好啊！于是我们就来实现自己的 ``print!`` 宏！

我们将这一部分放在 ``src/io.rs`` 中，先用 ``console_putchar`` 实现两个基础函数：

```rust
// src/lib.rs

// 由于使用到了宏，需要进行设置
// 同时，这个 mod 还必须放在其他 mod 前
#[macro_use]
mod io;

// src/io.rs

use crate::sbi;

pub fn putchar(ch: char) {
    sbi::console_putchar(ch as u8 as usize);
}

pub fn puts(s: &str) {
    for ch in s.chars() {
        putchar(ch);
    }
}
```



