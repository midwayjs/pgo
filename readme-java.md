## 介绍
Alibaba Dragonwell 11提供多种可以加速应用启动的技术，为了让函数计算的客户能方便的使用Alibaba Dragonwell的启动加速技术，我们开发了此工具，封装了相关的流程和细节，并提供简单的使用方式，目前已经支持AppCDS和EagerAppCDS技术。需要特别说明的是，启动加速的作用是提升应用的启动速度，不会对您的代码逻辑做任何更改，您可以放心使用本工具。

## 启动加速技术简介
下面对AppCDS和EagerAppCDS启动加速技术做简单的说明。

### CDS
CDS全称是Class-Data Sharing，其原理是让类可以被预处理放到一个归档文件中，后续Java程序启动时，JVM将这个归档文件映射到内存中，类加载器从内存获取对应的Class数据，避免从文件中读取，以节约应用启动的时间。CDS只能作用于Boot Class Loader加载的类。

### AppCDS
在JDK 10中，CDS扩展为AppCDS，AppCDS不仅能够作用于Boot Class Loader，也能够对App Class Loader和Custom Class Loader（客户自定义类加载器）起作用，大大增加CDS技术的适用范围。

### EagerAppCDS
AppCDS技术对于Custom Class Loader加载的类优化效果并不明显。为此阿里JVM团队在Alibaba Dragonwell 11中研发了EagerAppCDS技术，针对特定的Custom Class Loader加载类的过程进行优化，可以进一步降低应用启动时间。

## 本工具原理说明
当您执行s deploy时，s工具会自动首先执行您配置的pre-deploy，进而调用到本工具。本工具会自动在您的云账号中创建一个辅助函数，这个辅助函数会被调用并生成加速相关的文件，然后会下载加速相关的文件到您的本地，这些文件会随同您的代码一起被部署到云上创建正式函数。  

辅助函数和您定义在s.yaml中的函数相比，initializer完全相同，handler不同。您定义的函数的handler是您的业务逻辑，而辅助函数的handler则是用于生成和下载加速文件相关的逻辑，和您的业务逻辑完全无关。在辅助函数的handler执行之前，您的业务函数的initializer会先执行。为了提升启动加速的效果，建议您把类加载和初始化工作放到initializer中。更具体的概念可以参考函数计算 [官方文档](https://help.aliyun.com/document_detail/157704.htm) 

当您调用调用正式函数时，我们会检测您的代码目录中是否存在加速相关文件，如果存在则自动打开启动加速特性；如果代码目录中不存在启动加速相关相关文件，则会以常规方式正常执行，不会对影响您的业务逻辑。

需要说明的是，本工具自动创建辅助函数并调用，会导致额外的费用，价格和正式函数相同。因为仅调用1次或者数次，可以认为费用很低。

流程图如下：  
![](https://img.alicdn.com/imgextra/i4/O1CN0129uvNW1dDYyZ6Pypc_!!6000000003702-0-tps-691-829.jpg)

## 如何使用？
目前 本工具 与 [Serverless Devs](https://www.serverless-devs.com/zh-cn) 实现了集成，可以通过 Serverless Devs 的 `s cli` 直接使用，具体步骤如下：

1. 在 `s.yaml` 中的 service actions 中添加 `pre-deploy` ，配置 run 命令为 `s cli pgo gen --lang=java --module=helloworld`。
![](https://img.alicdn.com/imgextra/i2/O1CN01Mly0DB1p4CH0ESbMz_!!6000000005306-0-tps-1155-816.jpg)

2. 在 `s.yaml` 中的 service actions 中添加 `post-deploy` ，配置 run 命令为 `s cli pgo gen --lang=java --module=helloworld --enable`。
   ![](https://img.alicdn.com/imgextra/i1/O1CN019ppCa3203hcSwjVSl_!!6000000006794-0-tps-1141-1050.jpg)

3. 将 `s.yaml` 中的 runtime 改为 `java11`，并且修改codeUri为固定值target/artifact
![](https://img.alicdn.com/imgextra/i1/O1CN0188jlpL21EWajOK0e2_!!6000000006953-0-tps-945-1167.jpg)

4. 在 `s.yaml` 中为`service`配置logConfig和role，便于把函数产生的日志发送到您的SLS Logstore中
   ![](https://img.alicdn.com/imgextra/i2/O1CN018orbW21GA8r623ARX_!!6000000000581-0-tps-942-1176.jpg)

5. 部署函数  
部署时（s deploy）会优先使用s build的产物，这些产物存放在项目根目录下的.s目录。由于我们在上文中配置了codeUri为target/artifact，所以为了让s deploy读取到target/artifact目录中的文件，必须删除掉.s目录中的文件和文件夹。如果您没有执行过s build，则无需执行下面的删除命令。
```shell
rm -rf .s/*
```
执行部署命令
```shell
s deploy
```

6. 调用函数
- http trigger调用方式
```shell
curl 'curl http://135******1392103.cn-shanghai.fc.aliyuncs.com/2016-08-15/proxy/hello-world-service/http-trigger-java11-springboot/'
```
- event trigger调用方式
```shell
s cli fc-api invokeFunction --serviceName hello-world-service --functionName http-trigger-java11-springboot --event '{}'
```

---

Alibaba JVM 团队
