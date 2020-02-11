## 使用包管理器 cargo 创建 Rust binary 项目

- [代码][code]

使用 `cargo new` 创建一个新的 Rust binary 项目，命令如下：

```bash
$ cargo new os --bin
```

| `cargo new` 的参数 | 含义                                   |
| ------------------ | -------------------------------------- |
| `os`               | 项目的名称                             |
| `--bin`            | 可执行项目，和其相对的是库项目 `--lib` |

创建完成后，整个项目的文件结构如下：

```
os
├── Cargo.toml     项目配置文件
└── src            源代码路径
    └── main.rs    源程序
```

接下来我们进入 `os` 项目文件夹，并尝试构建、运行项目：

```bash
$ cargo run
   ...
Hello, world!
```

打开 `os/src/main.rs` 发现里面确实只是输出了一行 `Hello, world!` 。这个应用可以正常运行，但是即使只是这么一个简单的功能，也离不开所在操作系统(Ubuntu)的帮助。我们既然要写一个新的操作系统，就不能依赖于任何已有操作系统！接下来我们尝试移除该应用对于操作系统的依赖。

[code]: https://github.com/rcore-os/rCore_tutorial/tree/ch1-pa4
