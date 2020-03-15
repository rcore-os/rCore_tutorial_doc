## 练习说明

1. 所有题目分数总和：140 ，满分 100 ，超出 100 按 100 计算。
2. 可以把 https://github.com/rcore-os/rCore_tutorial 的 master 分支作为起点，逐步完成所有 8 个实验；也可以按照 tutorial 一步一步完善内核的功能，每完成若干个章节，去做实验作为练习。两种做实验的方式都是允许的，只要能够通过评测脚本的测试即可。

## 实验报告要求

1. 对于实验$$X(1\leq X\leq 8)$$，使用 markdown 格式编写实验报告并命名为`labX.md`(如 `lab1.md`)，在项目根目录下创建 `report` 文件夹并将该实验报告放在其中。不接受其他命名/格式的实验报告。
2. 不要在报告里大段粘贴代码，讲清楚实验过程和思路即可。
3. 有需要的话可以新建分支或者保留 commit ，独立检查每个功能。
4. 每道题的报告均会进行字数统计，字数超过 `平均字数 * 3` 或低于 `平均字数 / 3` 的同学可能被酌情扣分。（求求你们别卷了）
5. 提交到 `git.tsinghua` 。
6. **注意：完成后，请把代码和文档在 Deadline 之前提交到规定的地方。不接受迟交和晚交的情况。**

## 测评方式

### 整体情况

目前为止(2020-03-07)：

- lab1/4 不进行任何测试
- lab2/3/7 进行内核态测试
- lab5/6/8 进行用户态测试

我们将测试流程打包成了一个脚本方便同学们自我检测。

### 评测脚本使用方法

在使用评测脚本之前，请确保自己的代码目录结构与 [master 分支](https://github.com/rcore-os/rCore_tutorial/tree/master) 基本一致，并将其中的 [评测脚本 `test.py`](https://github.com/rcore-os/rCore_tutorial/blob/master/test.py) 与 [放置测试程序的目录 `test/`](https://github.com/rcore-os/rCore_tutorial/tree/master/test) 还有 [Makefile](https://github.com/rcore-os/rCore_tutorial/blob/master/Makefile) 置于你的代码仓库的根目录中。
测评脚本使用方法如下：
`python3 test.py labX` ，其中$$X\in\{2,3,5,6,7,8\}$$，可以自动完成代码的替换工作(内核态、用户态的替换方式的细节参见下面)并进行评测，最后将运行结果放在 `labX.result` 文件中。如果这个过程没有出现错误(如编译错误、或环境配置有问题等)，评测脚本还会直接打开 `labX.result` 文件查看运行结果。不必担心替换会污染代码，脚本会自动完成备份和恢复工作。

### 内核态测试

在运行内核态测试 (lab2/3/7) 之前，请确保 `os/src/init.rs` 存在且完成的是内核初始化的工作。
评测脚本会直接将 `os/src/init.rs` 替换为对应的内核态测试程序 `test/XX_test.rs` 并 `make run` 。

> **[info] 对于在做 lab2/3 而 tutorial 进度已经到第八章第二小节的同学**
>
> lab2/3 的测试程序中去掉了第八章之后 `init.rs` 中嵌入用户镜像的引用代码如下：
>
> ```rust
> // os/src/init.rs
> global_asm!(include_str!("link_user.S"));
> ```
>
> 因此，为了能够通过测试脚本测试 lab2/3 ，一种可行的对于原版代码的修改方式为：
>
> 将下面的代码注释掉：
>
> ```rust
> // os/src/fs/mod.rs
> extern "C" {
>    fn _user_img_start();
>    fn _user_img_end();
> };
> let start = _user_img_start as usize;
> let end = _user_img_end as usize;
> Arc::new(unsafe { device::MemBuf::new(start, end) })
> ```
>
> 并替换为
>
> ```rust
> // os/src/fs/mod.rs
> Arc::new(unsafe { device::MemBuf::new(0, 0) })
> ```

### 用户态测试

在运行用户态测试 (lab5/6/8) 之前，请确保 `os/src/process/mod.rs` 存在，且在 `process::init()` 函数中会通过 `execute('rust/user_shell', None)` 会将用户终端加载到内存并放入进程池。
如果用户态测试程序为 `test/usr/XX_test.rs`，评测脚本会将上述提到的 `rust/user_shell` 替换为 `rust/XX_test`，即不经过用户终端直接 `make run` 运行用户程序。目前脚本的功能并不完善，无法在所有进程结束后自动退出，因此我们等待数秒钟通过 `C-a + x` 退出 Qemu 让脚本继续运行。

> **[info] 提前实现 execute**
>
> 注意到，`execute` 直到第九章的第三小节才完全实现。然而做 lab5/6 只要求做完前八章。为了支持用户态测试，一种可行的方法是：
>
> 1. 完成第九章第一小节；
> 2. 然后跳过第九章第二小节，直接把第九章第三小节的 `execute` 函数移植过来；
> 3. 最后将代码略作修改，调用 `execute` 函数完成 `process::init()`，使得 lab5/6 的用户态测试可以正常运行。
