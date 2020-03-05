# 3. 虚拟内存管理

## 实验要求

1. 阅读理解文档第五章，并完成编译运行五章代码。
2. 回答问题：
   1. 现有页面替换算法框架的实现存在问题，请解释为什么，并提供你的解决方案（自然语言表述即可，无需编程实现） (10分)
3. 编程实现（20分）：  
   编程解决：实现时钟页面替换算法。详见下文实验指导   
   > 当前框架从master分支出发，实现了用于用户进程的fifo页面替换算法。请同学**自行merge** lab3-base分支的代码，然后在**仅修改fifo.rs**的要求下，实现时钟页面替换算法。

## 实验指导

- 思考：在进行重映射之前的页表是在哪创建的，什么样子的？
- 思考：页表中保存了下一级页表的权限和物理地址（PPN），权限在哪里设置的？物理地址在哪分配的？

1. 从当前master分支实现页面替换算法的过程。  
   在当前master分支的基础上，为了实现页面替换，我们主要进行了如下三方面的拓展。
   * 页面替换接口设计  
     我们将页面替换算法的对外接口进行了一定的抽象，组织成一个trait PageReplace：
     ```rust
     // os/src/memory/page_replace/mod.rs
     pub trait PageReplace: Send {
         fn push_frame(&mut self, vaddr: usize, pt: Arc<Mutex<PageTableImpl>>);
         fn choose_victim(&mut self) -> Option<(usize, Arc<Mutex<PageTableImpl>>)>;
         fn swap_out_one(&mut self) -> Option<frame>;
         fn do_pgfault(&mut self, entry: &mut PageTableEntry, vaddr: usize);
         fn tick(&self);
     }
     ```
     其中：
        * push_frame用于加入物理页帧到算法中。
        * choose_victim用于选择出一个用于交换的物理页帧。
        * swap_out_one接口将会调用choose_victim，选择一个物理页帧，将其内容写入到磁盘，并修改页表项，返回一个可用的物理页帧。
        * do_pgfault用于处理缺页中断，将磁盘中特定位置的物理页帧内容写回到内存中，并修复映射。
        * tick接口则视为动态页面替换算法设计的接口。  
     上述五个接口中，do_pgfault以及swap_out_one已经有默认实现，当实现某一特定页面算法时，仅需对另外三个接口给出特定实现。更详细的代码细节可以参考现有的fifo算法实现。
   * 模拟交换分区  
     由于当前master分支不包含磁盘驱动。所以在fs/mod.rs中，我们在编译时分配了一个2M大小（512个页）的u8数组，作为模拟的交换分区。并同时实现对外的两个接口：
     * disk_page_write：将给定物理页`page`的内容复制到交换分区中的某一位置，并返回该页在交换分区中的具体位置。
     * disk_page_read：从给定的磁盘分区位置`pos`中读取一个页的内容到给定的物理页面`page`，
   * 缺页中断处理  
     当发生缺页中断时，我们借助硬件提供的异常信息，获取当前发生缺页异常的虚拟地址，从而获取该虚拟地址所指向的页表项，将页表项传递给全局页面替换管理器PAGE_REPLACE_HANDLER的do_pgfault接口进行处理，修复映射关系。
2. 测试  
   [测试文件](https://github.com/rcore-os/rCore_tutorial/blob/master/test/init.rs)  
   用该文件替换掉init.rs，并为MemorySet添加一个get_table接口（参考[这里](https://github.com/rcore-os/rCore_tutorial/blob/pgreplace_test/os/src/memory/memory_set/mod.rs#L112))。运行make run可以进行测试。
