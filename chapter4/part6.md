## 内核重映射实现之三：完结

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

