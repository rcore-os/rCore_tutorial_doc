# 第零章：实验环境说明

## 本章概要

这一章主要包括：

- 在线实验环境的使用说明
- docker 实验环境的使用说明
- 本地实验环境的使用说明

下面的实验环境建立方式由简单到相对复杂一些，同学们可以基于自己的情况选择合适的实验方式。

## 在线环境下运行实验

目前在线实验环境是[基于实验楼的在线实验环境](https://www.shiyanlou.com/courses/1481)。用户只需有一个能够上网的 browser 即可进行实验。首先需要在[实验楼](https://www.shiyanlou.com/)上注册一个账号，然后在[rcore 在线实验环境](https://www.shiyanlou.com/courses/1481)的网页上输入验证码：wfkblCQp 就可以进入在线的实验环境。尝试执行下面的命令就开始进行实验了。

```bash
# 编译
cd rCore_tutorial;  git checkout master; make all
# 运行
make run
```

## docker 环境下运行实验

我们支持 docker 环境下进行实现，在 docker hub 上已有可用的 docker 环境，在当前目录下运行 `make docker` 将会从云端拉取 docker 镜像，并将当前目录挂载到 `/mnt` 位置。

```bash
# 启动docker环境
make docker # 会进入docker中的终端
cd /mnt
# 然后可以进行编译/qemu中运行实验。例如：
# 编译用户态app组成的image
cd usr
make user_img
# 编译内核
cd ../os
make build
# 运行
make run
```

如有兴趣，也可以自行构建/调整 docker 镜像，相关的 Dockerfile 文件在当前目录下，我们提供了 `make docker_build` 命令来帮助构建，详情请看 Dockerfile 和 Makefile

## 本地 Linux 环境下运行实验

我们也支持本地 Linux 环境下开展实验，不过需要提前安装相关软件包，如 rustc nightly，qemu-4.1.0+，device-tree-compiler 等（后续章节会提供安装教程）。具体细节可参考 [支持 docker 建立的 Dockerfile](https://github.com/rcore-os/rCore_tutorial/blob/master/Dockerfile) 和 [支持 github 自动测试的 main.yml](https://github.com/rcore-os/rCore_tutorial/blob/master/.github/workflows/main.yml) 。假定安装好了相关软件，直接只需下面的命令，即可进行实验：

```bash
# 在把实验代码下载到本地
git clone  https://github.com/rcore-os/rCore_tutorial.git
# 编译
cd rCore_tutorial;  git checkout master; make all
# 运行
make run
# 如果一切正常，则qemu模拟的risc-v64计算机将输出

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
switch satp from 0x8000000000080255 to 0x800000000008100e
++++ setup memory!    ++++
++++ setup interrupt! ++++
available programs in rust/ are:
  .
  ..
  user_shell
  notebook
  hello_world
  model
++++ setup fs!        ++++
++++ setup process!   ++++
++++ setup timer!     ++++
Rust user shell
>>
```
