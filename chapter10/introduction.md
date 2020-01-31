```mermaid
graph TB
   subgraph dependence
       interrupt
       thread
   end
   subgraph sync
       SpinLock --> interrupt
       Condvar --> SpinLock
    Condvar --> thread
    Mutex --> Condvar
       Monitor --> Condvar
       Semaphore --> Condvar
       Semaphore --> SpinLock
       mpsc --> SpinLock
    mpsc --> Condvar
   end
   subgraph test
       Dining_Philosophers --> Mutex
       Dining_Philosophers --> Monitor
   end
```
