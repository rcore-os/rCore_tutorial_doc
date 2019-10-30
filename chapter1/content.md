# 第一章：独立化可执行程序

## 本章概要
这一章你将会学到：如何移除对现有操作系统的依赖，构建一个独立化可执行rust程序。代码可以在[这里]()找到。
## 安装nightly rust

rust 包含：stable、beta、nightly 三个版本。默认情况下我们安装的是 stable 。由于在编写操作系统时需要使用 rust 的一些不稳定的实验功能，所以我们使用如下命令安装rust工具链管理器rustup、rust包管理器cargo，并切换到rust的nightly版本。

```sh
curl https://sh.rustup.rs -sSf | sh
# reboot
rustup default nightly
```

安装成功后使用``rustc --version``或者``rustup show``查看当前rust的版本，确认我们已经切换到了nightly版本。

```sh
$ rustc --version
rustc 1.40.0-nightly (fae75cd21 2019-10-26)
```

## 使用包管理器cargo创建rust binary项目

使用``cargo new``创建一个新的rust binary项目，命令如下：

```sh
$cargo new os --bin --edition 2018
```

| `cargo new` 的参数 | 含义                                      |
| ------------------ | ----------------------------------------- |
| `os`               | 项目的名称                                |
| `--bin`            | 可执行项目，和其相对的是库项目 `--lib`    |
| `--edition 2018`   | 使用新版 Rust 2018 而不是老旧的 Rust 2015 |

创建完成后，整个项目的文件结构如下：

```
os
├── Cargo.toml     项目配置文件
└── src            源代码路径
    └── main.rs    源程序
```

接下来我们进入``os``项目文件夹，并尝试构建、运行项目：

```sh
$ cargo run
   ...
Hello, world!
```

打开``main.rs``发现里面确实只是输出了一行Hello, world!这个应用已经可以正常运行了，但是即使只是这么一个简单的功能，也离不开所在操作系统(Ubuntu)的帮助。我们既然要写一个新的操作系统，就不能依赖于任何已有操作系统！接下来我们尝试移除该应用对于操作系统的依赖。

## 移除标准库依赖

项目默认是链接rust标准库std的，它依赖于操作系统，因此我们需要显式将其禁用：

```rust
// main.rs

#![no_std]
fn main() {
    println!("Hello, world!");
}
```

我们使用``cargo build``构建项目，会出现下面的错误：

> **[danger] cargo build error**
>
> ```rust
> error: cannot find macro `println` in this scope
>  --> src/main.rs:3:5
>   |
> 3 |     println!("Hello, world!");
>   |     ^^^^^^^
> error: `#[panic_handler]` function required, but not found
> error: language item required, but not found: `eh_personality
> ```

接下来，我们依次解决这些问题。

第一个错误是说``println!``宏未找到，实际上这个宏属于rust标准库std，由于它被我们禁用了当然就找不到了。我们暂时将其删除，之后自己给出不依赖操作系统的实现。
> **[info] ``println!``哪里依赖了操作系统**
> 
> 这个宏会输出到**标准输出**，而这需要操作系统的支持。
> 

第二个错误是说需要一个函数作为``panic_handler``，这个函数负责在程序``panic``时调用。它默认使用标准库std中实现的函数，由于我们禁用了标准库，因此只能自己实现它：

```rust
// main.rs

use core::panic::PanicInfo;
// This function is called on panic.
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}
```

> **[info] panic**
>
> panic在rust中表明程序遇到了不可恢复的错误，只能被迫停止运行。
> 

程序在panic后就应该结束，不过我们暂时先让这个handler卡在一个死循环里。因此这个handler不会结束，我们用``!``类型的返回值表明这个函数不会返回。

这里我们用到了核心库``core``，与标准库``std``不同，这个库不需要操作系统的支持，下面我们还会与它打交道。

第三个错误提到了语义项(language item)，它是编译器内部所需的特殊函数或类型。刚才的``panic_handler``也是一个语义项，我们要用它告诉编译器当程序panic之后如何处理。

而这个错误相关语义项``eh_personality``，其中``eh``是``exception handling``的简写，它是一个标记某函数用来实现**堆栈展开**处理功能的语义项。这个语义项也与``panic``有关。

> **[info] 堆栈展开(stack unwinding)**
> 
> 通常，当程序出现了异常 (这里指类似 Java 中层层抛出的异常)，从异常点开始会沿着 caller 调用栈一层一层回溯，直到找到某个函数能够捕获 (catch) 这个异常。这个过程称为 堆栈展开。
>
> 当程序出现不可恢复错误时，我们需要沿着调用栈一层层回溯上去回收每个caller 中定义的局部变量**避免造成内存溢出**。这里的回收包括 C++ 的 RAII 的析构以及 Rust 的 drop。
>
> 而在 Rust 中，panic 证明程序出现了不可恢复错误，我们则会对于每个 caller 函数调用依次这个被标记为堆栈展开处理函数的函数。
>
> 这个处理函数是一个依赖于操作系统的复杂过程，在标准库中实现，我们禁用了标准库使得编译器找不到该过程的实现函数了。

简单起见，我们不用考虑内存溢出，设置当程序 panic 时不做任何清理工作，直接退出程序即可。这样堆栈展开处理函数不会被调用，编译器也就不会去寻找它的实现了。

因此，我们在项目配置文件中直接将 dev (use for `cargo build`) 和 release (use for `cargo build --release`) 的 panic 的处理策略设为 abort。

```rust
// in Cargo.toml

[profile.dev]
panic = "abort"

[profile.release]
panic = "abort"
```

此时，我们``cargo build``，但是又出现了新的错误...

> **[danger] cargo build error**
>
> ```rust
> error: requires `start` lang_item
> ```
>

## 移除runtime依赖

对于大多数语言，他们都使用了 **运行时系统(runtime system)** ，这导致 main 并不是他们执行的第一个函数。

以 rust 语言为例：一个典型的链接了标准库的 rust 程序会首先跳转到 C runtime library 中的 **crt0(C runtime zero)** 进入C runtime设置 C 程序运行所需要的环境(比如：创建堆栈，设置寄存器参数等)。

然后 C runtime 会跳转到 rust runtime 的 **入口点(entry point)** 进入rust runtime继续设置rust运行环境，而这个入口点就是被``start``语义项标记的。rust runtime 结束之后才会调用 main 进入主程序。

C runtime 和rust runtime都需要标准库支持，我们的程序无法访问。如果覆盖了``start``语义项，仍然需要``crt0``，并不能解决问题。所以需要重写覆盖 ``crt0`` 入口点：

```rust
// main.rs

#![no_std] // don't link the Rust standard library
#![no_main] // disable all Rust-level entry points

use core::panic::PanicInfo;
// This function is called on panic.
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

#[no_mangle] // don't mangle the name of this function
pub extern "C" fn _start() -> ! {
    // this function is the entry point, since the linker looks for a function named `_start` by default
    loop {}
}
```

我们加上``#![no_main]``告诉编译器我们不用常规的入口链。

同时我们实现一个``_start()``函数，并加上``#[no_mangle]``告诉编译器对于此函数禁用name mangling，确保编译器生成一个名为``_start``的函数，而非为了保证函数名字唯一性而生成的形如`` _ZN3blog_os4_start7hb173fedf945531caE ``乱码般的名字。由于``_start``是大多数系统的默认入口点名字，所以我们要确保它不会发生变化。

接着，我们使用``extern "C"``告诉编译器该函数遵循[C calling convention](https://en.wikipedia.org/wiki/Calling_convention)而不是默认的Rust calling convention。因为这是一个C runtime(crt0)的入口。

返回值类型为``!``表明这个函数是发散的，不允许返回。由于这个函数被操作系统或bootloader直接调用，这样做是必须的。为了从入口点函数退出，我们需要通过``exit``系统调用，但我们目前还没法做到这一步，因此就让它在原地转圈吧。

由于程序会一直停在C runtime crt0的入口点，我们可以移除没用的``main``函数，并加上``![no_main]``表示不用不使用普通的入口点那套理论。

再次``cargo build``，我们即将面对这一章中的最后一个错误！

> **[danger] cargo build error**
> 
> ``linking with `cc` failed: exit code: 1``
> 

这个错误同样与C runtime有关，尽管C runtime的入口点已经被我们覆盖掉了，我们的项目仍默认链接C runtime，因此需要一些C标准库(libc)的内容，由于我们禁用了标准库，我们也同样需要禁用常规的C启动例程。

将``cargo build``换成以下命令：

> **[success] build passed**
>```rust
>$ cargo rustc -- -C link-arg=-nostartfiles
>   Compiling os v0.1.0 ...
>    Finished dev [unoptimized + debuginfo] target(s) in 4.87s
>```
>

我们终于构建成功啦！虽然最后这个命令之后并不会用到，但是暂时看到了一个success不也很好吗？

构建得到的可执行文件位置放在``os/target/debug/os``中。
## 总结与展望
这一章我们配置了rust开发环境，使用包管理器cargo创建了一个二进制项目。作为一个新的操作系统，我们需要移除它对已有的操作系统的依赖，实际上我们分别通过移除标准库依赖与移除运行环境依赖，最终成功构建，得到了一个独立式可执行程序。

下一章我们将在这一章的基础上，针对目标硬件平台构建我们的内核镜像，使用OpenSBI进行启动，同时使用硬件模拟器Qemu模拟启动流程，并实现在屏幕上进行格式化输出。