## 内核重映射实现之三：完结

* [代码][CODE]

在内存模块初始化时，我们新建一个精细映射的 ``MemorySet`` 并切换过去供内核使用。
```rust
// src/memory/mod.rs

use memory_set::{
    MemorySet,
    attr::MemoryAttr,
    handler::Linear
};

pub fn init(l: usize, r: usize) {
    FRAME_ALLOCATOR.lock().init(l, r);
    init_heap();
    // 内核重映射
    kernel_remap();
    println!("++++ setup memory!    ++++");
}

pub fn kernel_remap() {
    let mut memory_set = MemorySet::new();
    
    // 將启动栈 push 进来
    extern "C" {
        fn bootstack();
        fn bootstacktop();
    }
    memory_set.push(
        bootstack as usize,
        bootstacktop as usize,
        MemoryAttr::new(),
        Linear::new(PHYSICAL_MEMORY_OFFSET),
    );

    unsafe {
        memory_set.activate();
    }
}
```
这里要注意的是，我们不要忘了将启动栈加入实际可用的虚拟内存空间。因为我们现在仍处于启动过程中，因此离不开启动栈。

主函数里则是：
```rust
// src/init.rs

#[no_mangle]
pub extern "C" fn rust_main() -> ! {
    crate::interrupt::init();

	extern "C" {
		fn end();
	}
	crate::memory::init(
        ((end as usize - KERNEL_BEGIN_VADDR + KERNEL_BEGIN_PADDR) >> 12) + 1,
        PHYSICAL_MEMORY_END >> 12
    );

    crate::timer::init();
    loop {}
}
```

运行一下，可以发现屏幕上仍在整齐的输出着 ``100 ticks``！
我们回过头来验证一下关于读、写、执行的权限是否被正确处理了。
写这么几个测试函数：
```rust
// 只读权限，却要写入
fn write_readonly_test() {
    extern "C" {
        fn srodata();
    }
    unsafe {
        let ptr = srodata as usize as *mut u8;
        *ptr = 0xab;
    }
}

// 不允许执行，非要执行
fn execute_unexecutable_test() {
    extern "C" {
        fn sbss();
    }
    unsafe {
        asm!("jr $0" :: "r"(sbss as usize) :: "volatile");
    }
}

// 找不到页表项
fn read_invalid_test() {
    println!("{}", unsafe { *(0x12345678 as usize as *const u8) });
}
```
在 ``memory::init`` 后面调用任一个测试函数，都会发现内核 ``panic`` 并输出：
> **[danger]** undefined trap
> ```rust
> panicked at 'undefined trap!', src/interrupt.rs:40:14
> ```

这说明内核意识到出了某些问题进入了中断，但我们并没有加以解决。
我们在中断处理里面加上对应的处理方案：
```rust
// src/interrupt.rs

#[no_mangle]
pub fn rust_trap(tf: &mut TrapFrame) {
    match tf.scause.cause() {
        Trap::Exception(Exception::Breakpoint) => breakpoint(&mut tf.sepc),
        Trap::Interrupt(Interrupt::SupervisorTimer) => super_timer(),
        Trap::Exception(Exception::InstructionPageFault) => page_fault(tf),
        Trap::Exception(Exception::LoadPageFault) => page_fault(tf),
        Trap::Exception(Exception::StorePageFault) => page_fault(tf),
        _ => panic!("undefined trap!")
    }
}

fn page_fault(tf: &mut TrapFrame) {
    println!("{:?} va = {:#x} instruction = {:#x}", tf.scause.cause(), tf.stval, tf.sepc);
    panic!("page fault!");
}
```
我们再依次运行三个测试，会得到结果为：
> **[success] 权限测试**
> ```rust
> // read_invalid_test Result
> Exception(LoadPageFault) va = 0x12345678 instruction = 0xffffffffc020866c
> panicked at 'page fault!', src/interrupt.rs:65:5
> // execute_unexecutable_test Result
> Exception(InstructionPageFault) va = 0xffffffffc021d000 instruction = 0xffffffffc021d000
> panicked at 'page fault!', src/interrupt.rs:65:5
> // write_readonly_test Result
> Exception(StorePageFault) va = 0xffffffffc0213000 instruction = 0xffffffffc0208684
panicked at 'page fault!', src/interrupt.rs:65:5
> ```

从中我们可以清楚的看出内核成功的找到了错误的原因，内核各段被成功的设置了不同的权限。我们达到了内核重映射的目的！
目前的代码能在[这里][CODE]找到。

[CODE]: https://github.com/rcore-os/rCore_tutorial/tree/e54dce49
