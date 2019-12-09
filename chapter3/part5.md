## 时钟中断

在本节中，我们处理一种很重要的中断：时钟中断。这种中断我们可以设定为每隔一段时间硬件自动触发一次，在其对应的中断处理程序里，我们回到内核态，并可以对用户态的程序进行调度、监控管理他们对于资源的使用情况。

> **[info] riscv 中的中断寄存器**
> 
> S 态的中断寄存器主要有 **sie, sip** 两个，其中 s 表示 S 态，i 表示中断， e/p 表示 enable (使能)/ pending (提交申请)。
> 处理的中断分为三种：
> 1. SI(Software Interrupt)，软件中断
> 2. TI(Timer Interrupt)，时钟中断
> 3. EI(External Interrupt)，外部中断
> 
> 比如 ``sie`` 有一个 ``STIE`` 位， 对应 ``sip`` 有一个 ``STIP`` 位，与时钟中断 TI 有关。当硬件决定触发时钟中断时，会将 ``STIP`` 设置为 1，当一条指令执行完毕后，如果发现 ``STIP`` 为 1，此时如果使能，即 ``sie`` 的 ``STIE`` 位也为 1 ，就会进入 S 态时钟中断的处理程序。

### 时钟初始化

```rust
// src/lib.rs

mod timer;

// src/timer.rs

use crate::sbi::set_timer;
use riscv::register::{
    time,
    sie
};

// 当前已触发多少次时钟中断
pub static mut TICKS: usize = 0;
// 触发时钟中断时间间隔
// 数值一般约为 cpu 频率的 1% ， 防止过多占用 cpu 资源
static TIMEBASE: u64 = 100000;
pub fn init() {
    unsafe {
        // 初始化时钟中断触发次数
        TICKS = 0;
        // 设置 sie 的 TI 使能 STIE 位
        sie::set_stimer();
    }
    // 硬件机制问题我们不能直接设置时钟中断触发间隔
    // 只能当每一次时钟中断触发时
    // 设置下一次时钟中断的触发时间
    // 设置为当前时间加上 TIMEBASE
    // 这次调用用来预处理
    clock_set_next_event();
    println!("++++ setup timer!     ++++");
}

pub fn clock_set_next_event() {
	// 调用 OpenSBI 提供的接口设置下次时钟中断触发时间
    set_timer(get_cycle() + TIMEBASE);
}

// 获取当前时间
fn get_cycle() -> u64 {
    time::read() as u64
}
```
### 开启内核态中断使能

事实上寄存器 ``sstatus`` 中有一控制位 ``SIE``，表示 S 态全部中断的使能。如果没有设置这个也是不能正常接受 S 态时钟中断的。
```rust
// src/interrupt.rs

pub fn init() {
    unsafe {
        extern "C" {
            fn __alltraps();
        }
        sscratch::write(0);
        stvec::write(__alltraps as usize, stvec::TrapMode::Direct);
        // 设置 sstatus 的 SIE 位
        sstatus::set_sie();
    }
    println!("++++ setup interrupt! ++++");
}
```

### 响应时钟中断
让我们来更新 ``rust_trap`` 函数来让它能够处理多种不同的中断——当然事到如今也只有三种中断：
1. 使用 ``ebreak`` 触发的断点中断；
2. 使用 ``ecall`` 触发的系统调用中断；
3. 时钟中断。


```rust
// src/interrupt.rs

use riscv::register::{
    scause::{
        self,
        Trap,
        Exception,
        Interrupt
    },
    sepc,
    stvec,
    sscratch,
    sstatus
};
use crate::timer::{
    TICKS,
    clock_set_next_event
};

#[no_mangle]
pub fn rust_trap(tf: &mut TrapFrame) {
    // 根据中断原因分类讨论
    match tf.scause.cause() {
        // 断点中断
        Trap::Exception(Exception::Breakpoint) => breakpoint(&mut tf.sepc),
        // S 态时钟中断
        Trap::Interrupt(Interrupt::SupervisorTimer) => super_timer(),
        _ => panic!("undefined trap!")
    }
}

// 断点中断处理：输出断点地址并改变中断返回地址防止死循环
fn breakpoint(sepc: &mut usize) {
    println!("a breakpoint set @0x{:x}", sepc);
    *sepc += 4;
}

// S 态时钟中断处理
fn super_timer() {
    // 设置下一次时钟中断触发时间
    clock_set_next_event();
    unsafe {
        // 更新时钟中断触发计数
        // 注意由于 TICKS 是 static mut 的
        // 后面会提到，多个线程都能访问这个变量
        // 如果同时进行 +1 操作，会造成计数错误或更多严重bug
        // 因此这是 unsafe 的，不过目前先不用管这个
        TICKS += 1;
        // 每触发 100 次时钟中断将计数清零并输出
        if (TICKS == 100) {
            TICKS = 0;
            println!("* 100 ticks *");
        }
    }
    // 由于一般都是在死循环内触发时钟中断
    // 因此我们同样的指令再执行一次也无妨
    // 因此不必修改 sepc
}
```

同时修改主函数 ``rust_main`` ：

```rust
// src/init.rs

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    crate::interrupt::init();
    // 时钟初始化
    crate::timer::init();
    unsafe {
        asm!("ebreak"::::"volatile");
    }
    panic!("end of rust_main");
    loop {}
}
```

我们期望能够同时处理断点中断和时钟中断。断点中断会输出断点地址并返回，接下来就是 ``panic``，我们 ``panic`` 的处理函数定义如下：

```rust
// src/lang_items.rs

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    println!("{}", info);
    loop {}
}
```

就是输出 panic 信息并死循环。我们可以在这个死循环里不断接受并处理时钟中断了。

最后的结果确实如我们所想：

> **[success] breakpoint & timer interrupt handling**
> ```rust
> ...opensbi output...
> ++++ setup interrupt! ++++
> ++++ setup timer!     ++++
> a breakpoint set @0xffffffffc0200060
> panicked at 'end of rust_main', src/init.rs:13:5
> * 100 ticks *
> * 100 ticks *
> ...
> ```

如果出现问题的话，可以在[这里]()找到目前的代码。
