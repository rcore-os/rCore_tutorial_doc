## 运行实验  
本实验支持docker环境下开展，在docker hub上已有可用的docker环境，在当前目录下运行`make docker`将会从云端拉取docker镜像，并将当前目录挂载到/mnt位置。

```shell	
make docker # 会进入docker中的终端
cd /mnt
# 然后可以进行编译/qemu中运行实验。例如：
cd usr
make user_img
cd ../os
make build
make run
```

如有兴趣，也可以自行构建/调整docker镜像，相关的Dockerfile文件在当前目录下，我们提供了`make docker_build`命令来帮助构建，详情请看Dockerfile和Makefile
