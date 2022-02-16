## 介绍

PGO（Profile Guided Optimization），是一种根据运行时 Profiling Data 来进行优化的技术。


## 如何使用？
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
