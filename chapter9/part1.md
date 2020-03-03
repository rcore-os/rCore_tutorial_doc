## 使用文件系统

- [代码][code]

### 打包磁盘文件

首先我们将所有编译出来的用户程序放在 `usr/build/riscv64/rust` 文件夹下，并将 `usr/build/riscv64` 文件夹里面的内容使用 [`rcore-fs-fuse`工具](https://github.com/rcore-os/rcore-fs/tree/master/rcore-fs-fuse) 打包成一个磁盘文件，由于选用不同的文件系统磁盘文件的布局会不同，我们这里选用一个简单的文件系统 [`SimpleFileSystem`](https://github.com/rcore-os/rcore-fs/tree/master/rcore-fs-sfs)（简称**SFS**）。

磁盘文件布局为：里面只有一个 `rust` 文件夹，里面放着若干用户程序。

我们写一个 Makefile 来完成编译及打包操作：

```makefile
# usr/Makefile

target := riscv64imac-unknown-none-elf
mode := debug
rust_src_dir := rust/src/bin
rust_target_dir := rust/target/$(target)/$(mode)
rust_srcs := $(wildcard $(rust_src_dir)/*.rs)
rust_targets := $(patsubst $(rust_src_dir)/%.rs, $(rust_target_dir)/%, $(rust_srcs))
out_dir := build/riscv64
sfsimg := build/riscv64.img
.PHONY: rcore-fs-fuse rust user_img clean

rcore-fs-fuse:
ifeq ($(shell which rcore-fs-fuse),)
	@echo Installing rcore-fs-fuse
	@cargo install rcore-fs-fuse --git https://github.com/rcore-os/rcore-fs --rev d8d6119
endif

rust:
	@cd rust && cargo build
	@echo targets includes $(rust_targets)
	@rm -rf $(out_dir)/rust && mkdir -p $(out_dir)/rust
	@rm -f $(sfsimg)
	@cp $(rust_targets) $(out_dir)/rust

$(sfsimg): rcore-fs-fuse rust
	@rcore-fs-fuse --fs sfs $@ $(out_dir) zip

user_img: $(sfsimg)

clean:
	@rm -rf build/
```

上面的脚本如没理解，没有关系，只要我们知道使用 `make user_img` 即可将磁盘打包到 `usr/build/riscv64.img` 。

随后，将内核的 Makefile 中链接的文件从原来的可执行改为现在的磁盘镜像，这样就可以把 OS 和`riscv64.img`文件系统合并在一起了。

```makefile
# Makefile

# export USER_IMG = usr/rust/target/riscv64imac-unknown-none-elf/debug/hello_world
# 改成：
export USER_IMG = usr/build/riscv64.img
```

### 实现*磁盘*设备驱动

首先引入 rust 文件系统的 crate ：

```rust
// Cargo.toml

rcore-fs = { git = "https://github.com/rcore-os/rcore-fs", rev = "d8d61190"  }
rcore-fs-sfs = { git = "https://github.com/rcore-os/rcore-fs", rev = "d8d61190"  }
```

我们知道文件系统需要用到块设备驱动来控制底层的块设备（比如磁盘等）。但是这里我们还是简单暴力的将*磁盘*直接链接到内核中，因此这里的*磁盘设备*其实就是一段内存模拟的。这可比实现真实磁盘驱动要简单多了！但是，我们还是需要按照`Device`接口`read_at`、`write_at`和`sync`去实现。

```rust
// src/fs/device.rs
pub struct MemBuf(RwLock<&'static mut [u8]>); //一块用于模拟磁盘的内存
impl MemBuf {
    // 初始化参数为磁盘的头尾虚拟地址
    pub unsafe fn new(begin: usize, end: usize) -> Self {
        use core::slice;
        MemBuf(
            // 我们使用读写锁
            // 可以有多个线程同时获取 & 读
			// 但是一旦有线程获取 &mut 写，那么其他所有线程都将被阻塞
            RwLock::new(
                slice::from_raw_parts_mut(　begin as *mut u8, end - begin)))
        ...

// 作为文件系统所用的设备驱动，只需实现下面三个接口
// 而在设备实际上是内存的情况下，实现变的极其简单
impl Device for MemBuf {
    fn read_at(&self, offset: usize, buf: &mut [u8]) -> Result<usize> {
        let slice = self.0.read();
        let len = buf.len().min(slice.len() - offset);
        buf[..len].copy_from_slice(&slice[offset..offset + len]);
        Ok(len)
    }
    fn write_at(&self, offset: usize, buf: &[u8]) -> Result<usize> {
        let mut slice = self.0.write();
        let len = buf.len().min(slice.len() - offset);
        slice[offset..offset + len].copy_from_slice(&buf[..len]);
        Ok(len)
    }
    fn sync(&self) -> Result<()> {
        Ok(())
    }
}
```

### 打开 SFS 文件系统

在运行 OS 之前，我们已经通过[`rcore-fs-fuse`工具](https://github.com/rcore-os/rcore-fs/tree/master/rcore-fs-fuse) 把包含用户程序的多个文件打包成一个 [`SimpleFileSystem`](https://github.com/rcore-os/rcore-fs/tree/master/rcore-fs-sfs)格式的磁盘文件`riscv64.img`。bootloader 启动后，把 OS 和 riscv64.img 加载到内存中了。在初始化阶段，OS 为了能够读取`riscv64.img`，需要使用`rcore_fs_sfs::SimpleFileSystem::open(device)`方法打开磁盘并进行初始化，这样后续就可以读取文件系统中的目录和文件了。

```rust
// src/fs/mod.rs
lazy_static! {
    pub static ref ROOT_INODE: Arc<dyn INode> = {
        // 创建内存模拟的"磁盘"设备
        let device = {
            ...
            let start = _user_img_start as usize;
            let end = _user_img_end as usize;
            Arc::new(unsafe { device::MemBuf::new(start, end) })
        };
        // 由于我们在打包磁盘文件时就使用 SimpleFileSystem
		// 所以我们必须使用简单文件系统 SimpleFileSystem 打开该设备进行初始化
        let sfs = SimpleFileSystem::open(device).expect("failed to open SFS");
        // 返回该文件系统的根 INode
        sfs.root_inode()
    };
}

pub trait INodeExt {
    fn read_as_vec(&self) -> Result<Vec<u8>>;
}

impl INodeExt for dyn INode {
    // 将这个 INode 对应的文件读取到一个数组中
    fn read_as_vec(&self) -> Result<Vec<u8>> {
        let size = self.metadata()?.size;
        let mut buf = Vec::with_capacity(size);
        unsafe { buf.set_len(size);　/*???*/ }
        self.read_at(0, buf.as_mut_slice())?;
        Ok(buf)
    }
}

pub fn init() {
    println!("available programs in rust/ are:");
    let mut id = 0;
    // 查找 rust 文件夹并返回其对应的 INode
    let mut rust_dir = ROOT_INODE.lookup("rust").unwrap();
    // 遍历里面的文件并输出
    // 实际上打印了所有 rust 目录下的用户程序
    while let Ok(name) = rust_dir.get_entry(id) {
        id += 1;
        println!("  {}", name);
    }
    println!("++++ setup fs! ++++")
}
```

> **[info]`lazy_static!` 宏**
>
> 这里的 `lazy_static!` 宏指的是等到实际用到的时候再对里面的全局变量进行初始化，而非在编译时初始化。
>
> 这通常用于不可变的某全局变量初始化依赖于运行时的某些东西，故在编译时无法初始化；但是若在运行时修改它的值起到初始化的效果，那么由于它发生了变化不得不将其声明为 `static mut`，众所周知这是 `unsafe` 的，即使不会出问题也很不优雅。在这种情况下，使用 `lazy_static!` 就是一种较为理想的方案。

### 加载并运行用户程序

那么现在我们就可以用另一种方式加载用户程序了！

```rust
// src/process/mod.rs

use crate::fs::{
    ROOT_INODE,
    INodeExt
};

pub fn init() {
    ...
    let data = ROOT_INODE
        .lookup("rust/hello_world")
        .unwrap()
        .read_as_vec()
        .unwrap();
    let user_thread = unsafe { Thread::new_user(data.as_slice()) };
    CPU.add_thread(user_thread);
    ...
}
```

当然，别忘了在这之前初始化文件系统！

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
	crate::fs::init();
    crate::process::init();
    crate::timer::init();
    crate::process::run();
    loop {}
}
```

我们使用 `make run` 运行一下，可以发现程序的运行结果与上一节一致。

如果运行有问题的话，可以在[这里][code]找到代码。

只不过，我们从文件系统解析出要执行的程序。我们可以看到 `rust` 文件夹下打包了哪些用户程序：

> **[success] 磁盘打包与解析**
>
> ```rust
> available programs in rust/ are:
>   .
>   ..
>   model
>   hello_world
> ```

但是现在问题在于我们运行什么程序是硬编码到内核中的。我们能不能实现一个交互式的终端，告诉内核我们想要运行哪个程序呢？接下来我们就来做这件事情！

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch9-pa1
