## 使用 Qemu 加载内核镜像

* [代码](https://github.com/rcore-os/rCore_tutorial/tree/3b1500685e14d7fe509d8b08e1e5eca4a299b022)

### 安装模拟器 Qemu

请到 Qemu 官方网站下载并安装最新版的 Qemu，使用 Ubuntu 自带的软件包管理器 ``apt-get`` 会导致 Qemu 的版本过低无法使用。

```bash
# 确认安装了新版的 Qemu
$ qemu-system-riscv64 --version
QEMU emulator version 4.1.0
Copyright (c) 2003-2019 Fabrice Bellard and the QEMU Project developers
```

同时，我们在每次开机之后要使用此命令来允许模拟器过量使用内存，否则无法正常使用 Qemu：

```bash
$ sudo sysctl vm.overcommit_memory=1
```
### 使用 OpenSBI

之前我们提到过已经将 bootloader 的实现 ``OpenSBI`` 下载到 ``opensbi/opensbi_rv64.elf`` 中了。我们在 Qemu 中将 bootloader 设置为 ``OpenSBI``：

```bash
$ qemu-system-riscv64 \
> --machine virt \
> --nographic \
> --bios opensbi/opensbi_rv64.elf 

OpenSBI v0.4 (Jul  2 2019 11:53:53)
   ____                    _____ ____ _____
  / __ \                  / ____|  _ \_   _|
 | |  | |_ __   ___ _ __ | (___ | |_) || |
 | |  | | '_ \ / _ \ '_ \ \___ \|  _ < | |
 | |__| | |_) |  __/ | | |____) | |_) || |_
  \____/| .__/ \___|_| |_|_____/|____/_____|
        | |
        |_|

Platform Name          : QEMU Virt Machine
Platform HART Features : RV64ACDFIMSU
Platform Max HARTs     : 8
Current Hart           : 0
Firmware Base          : 0x80000000
Firmware Size          : 112 KB
Runtime SBI Version    : 0.1

PMP0: 0x0000000080000000-0x000000008001ffff (A)
PMP1: 0x0000000000000000-0xffffffffffffffff (A,R,W,X)
```

可以看到我们已经将 ``OpenSBI`` 跑起来了。Qemu 可以使用 ``Ctrl+a`` 再按下 ``x`` 退出。

### 加载内核镜像

为了确信我们已经跑起来了内核里面的代码，我们最好在  ``rust_main`` 里面加一点东西。

```rust
// src/main.rs

#![feature(asm)]

// 在屏幕上输出一个字符，目前我们先不用了解其实现原理
pub fn console_putchar(ch: u8) {
    let ret: usize;
    let arg0: usize = ch as usize;
    let arg1: usize = 0;
    let arg2: usize = 0;
    let which: usize = 1;
    unsafe {
        asm!("ecall"
             : "={x10}" (ret)
             : "{x10}" (arg0), "{x11}" (arg1), "{x12}" (arg2), "{x17}" (which)
             : "memory"
             : "volatile"
        );
    }
}

#[no_mangle]
extern "C" fn rust_main() -> ! {
    // 在屏幕上输出 "OK\n" ，随后进入死循环
    console_putchar(b'O');
    console_putchar(b'K');
    console_putchar(b'\n');
    loop {}
}
```

这样，如果我们将内核镜像加载完成后，屏幕上出现了 OK ，就说明我们之前做的事情没有问题。

现在我们生成内核镜像要通过多条命令来完成，我们通过 ``Makefile`` 来简化这一过程。

```makefile
# Makefile

target := riscv64-os
mode := debug
kernel := target/$(target)/$(mode)/os
bin := target/$(target)/$(mode)/kernel.bin

.PHONY: kernel build clean qemu run

kernel:
	@cargo xbuild --target $(target).json
$(bin): kernel
	@riscv64-unknown-elf-objcopy $(kernel) --strip-all -O binary $(bin)
build: $(bin)
clean:
	@rm -r target/
qemu: build
	@qemu-system-riscv64 \
        --machine virt \
        --nographic \
        --bios opensbi/opensbi_rv64.elf \
        --device loader,file=$(bin),addr=0x80200000
run: qemu
```

这里我们通过参数 ``--device`` 来将内核镜像加载到 Qemu 中，我们指定了内核镜像文件，但这个地址 ``0x80200000`` 又是怎么一回事？我们目前先不用在意这些细节，等后面会详细讲解。

于是，我们可以使用 ``make run`` 来用 Qemu 加载内核镜像并运行。匆匆翻过一串长长的 OpenSBI 输出，我们看到了 ``OK`` ！于是历经了千辛万苦我们终于将我们的内核跑起来了！

没有看到 OK ？迄今为止的代码可以在[这里](https://github.com/rcore-os/rCore_tutorial/tree/3b1500685e14d7fe509d8b08e1e5eca4a299b022)找到，请参考。
下一节我们实现格式化输出来使得我们后续能够更加方便的通过输出来进行内核调试。
