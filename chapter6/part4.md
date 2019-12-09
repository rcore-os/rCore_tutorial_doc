## 内核线程创建与切换测试

我们想做的事情是：新建一个临时线程，从启动线程切换到临时线程，再切换回来。

临时线程入口点：

```rust
// src/process/mod.rs

use structs::Thread;

#[no_mangle]
pub extern "C" fn temp_thread(from_thread: &mut Thread, current_thread: &mut Thread) {
    println!("I'm leaving soon, but I still want to say: Hello world!");
    current_thread.switch_to(from_thread);
}
```

传入的参数中有一个 ``from_thread`` ，它本应代表启动线程。但是身处启动线程中，我们如何构造一个 ``Thread`` 实例表示其自身呢？

```rust
// src/context.rs

impl Context {
    pub fn null() -> Context {
        Context { content_addr: 0, }
    }
}

// src/process/structs.rs

impl Thread {
    pub fn get_boot_thread() -> Box<Thread> {
        Box::new(Thread {
            context: Context::null(),
            kstack: KernelStack::new_empty(),
        })
    }
}
```

其实作为一个正在运行的线程，栈早就开好了，我们什么都不用做啦！一切都被我们的线程切换机制搞定了。

下面正式开始测试：

```rust
// src/process/mod.rs

pub fn init() {
    
    let mut boot_thread = Thread::get_boot_thread();
    let mut temp_thread = Thread::new_kernel(temp_thread as usize);
    
    unsafe {
        // 对于放在堆上的数据，我只想到这种比较蹩脚的办法拿到它所在的地址...
        temp_thread.append_initial_arguments([&*boot_thread as *const Thread as usize, &*temp_thread as *const Thread as usize, 0]);
    }
    boot_thread.switch_to(&mut temp_thread);
    
    println!("switched back from temp_thread!");
    loop {}
}

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
	crate::process::init();
    crate::timer::init();
    loop {}
}
```

终于能够 ``make run`` 看一下结果啦！

> **[success] 内核线程切换与测试**
> 
> ```
> I'm leaving soon, but I still want to say: Hello world!
> switched back from temp_thread!
> ```
> 

可见我们切换到了临时线程，又切换了回来！测试成功！

截至目前所有的代码可以在[这里]()找到以供参考。