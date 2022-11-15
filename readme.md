## 介绍

PGO（Profile Guided Optimization），是一种根据运行时 Profiling Data 来进行优化的技术。
本项目的主要目标是通过运行时信息优化动态语言的启动速度。

目前本项目通过不同的方案支持如下语言

### Node.js
### Java
### Python

### Node.js

## 介绍

PGO（Profile Guided Optimization），是一种根据运行时 Profiling Data 来进行优化的技术，通过下面两个方面，使 Node.js 应用启动时间提升数倍：
### 1. require 关系加速

在一个文件中进行 `require` 一个 `a`，它会通过一系列寻径，最终得到对应的 `a` 对应文件的绝对路径；而同样在另一个文件中也进行 `require` 一个 `a`，其得到的绝对路径可能就不相同了。PGO 将不同文件里面 `require` 各种字符串得到的结果关系一一对应起来，得到一份二维 map。有了这一份关系数据，对 `require` 函数进行改造，在寻径逻辑前加一段逻辑，即从 Map 中查找对应关系，若找到了对应关系，则直接返回对应内容；若找不到，则使用原始的寻径逻辑进行兜底，从而实现加速。

### 2. require 文件缓存

在反复 `require` 的逻辑中，反复判断文件是否存在是一个扎堆的逻辑，而另一个扎堆的问题就是反复读取碎片文件。

PGO 的 `Require Cache` 中除了之前提到的关系之外，还会存储：

1. 源文件的文本信息；
2. 源文件编译出来的 V8 byte code。

这些信息与关系信息一并结构化存储于一个缓存文件中，使得我们一加载这个缓存文件，无须经过任何反序列化的步骤，就可以直接使用该 Map。

有了这么一个文件，我们只需要在进程刚启动的时候加载一遍缓存文件。然后每次 require 的时候，都直接从缓存关系中查找出来对应的文件，再从缓存中获取该文件的源代码文本及其 byte code，直接加载。

这么依赖，我们省去的就是：

+ 寻径时间（反复 statx，在 Node.js 中的封装逻辑更为复杂）；
+ 读取文件时间（反复 openat，经 Node.js 封装逻辑更为复杂）；
+ 源代码文本编译执行缩减为 byte code 编译执行。


## 如何使用？
目前 PGO 与 [Serverless Devs](https://www.serverless-devs.com/zh-cn) 实现了集成，可以通过 Serverless Devs 的 `s cli` 直接使用。

1. 在 `s.yaml` 中的 service actions 中添加 `pre-deploy` ，配置 run 命令为 `s cli pgo`，如图所示


![](https://gw.alicdn.com/imgextra/i2/O1CN01I1r4Px1zLjaHcU0ZD_!!6000000006698-2-tps-1646-642.png)

2. 将 `s.yaml` 中的 runtime 改为 `nodejs14`

3. 部署函数
```shell
s deploy
```

4. 调用函数
```shell
s cli fc-api invokeFunction --serviceName fctest --functionName functest1 --event '{}'
```

## 参数

可以通过 `s cli pgo gen --参数key 参数value` 来传递参数

+ `remove-nm`：构建完成 pgo 后自动删除 node_modules， `s cli pgo gen --remove-nm`

## 生成详细过程
#### 1. 基于当前项目代码，生成PGO文件
![](https://gw.alicdn.com/imgextra/i2/O1CN01XHeTqp1cXsvsuRAyq_!!6000000003611-2-tps-1164-930.png)
#### 2. 将生成的 PGO 文件存入项目目录
![](https://gw.alicdn.com/imgextra/i2/O1CN01xp4Du11Xq8dg742js_!!6000000002974-2-tps-1050-629.png)
#### 3. 线上使用 PGO 文件加速启动
![](https://gw.alicdn.com/imgextra/i4/O1CN01OGG21g1VhJmLQlEAS_!!6000000002684-2-tps-886-506.png)


---

Alibaba Node.js 架构