import { execSync } from "child_process";
import { join } from 'path';
import { copy, writeFile, unlink, readFileSync, rm, pathExists } from 'fs-extra';
import * as uuid from 'uuid-1345';


// import * as common from "./common"
// import {PromiseOnly} from "got";

import * as common from "./common";

export class PyCDS extends common.AbstractPGO {
  async run() {
    return this.cleanup_artifacts()
      .then(this.create_tmp_function.bind(this))
      .then(this.download_from_tmp_function.bind(this))
      .then(this.patch_orig_function.bind(this))
      .then(this.cleanup_tmp_function.bind(this), (reason) =>
        this.cleanup_tmp_function.bind(this)().finally(_ => Promise.reject(reason))
      )
  }

  async cleanup_artifacts(): Promise<void> {
    const archive = join(this.options.codeUri, 'cds.img')
    const dots = join(this.options.codeUri, '.s')

    const removes: Promise<void>[] = [
      pathExists(archive).then(value => value ? unlink(archive) : Promise.resolve(undefined)),
      pathExists(dots).then(value => value ? rm(dots) : Promise.resolve(undefined))
    ]

    return Promise.all(removes).then(_ => {
      common.info('历史文件清理完成')
      return Promise.resolve(undefined)
    }).catch(err => Promise.reject('历史文件清理失败，跳过生成'))
  }

  async download_from_tmp_function(): Promise<void> {
    common.debug('download')
    await writeFile(join(this.options.codeUri, 'cds.img'), await this.downloadArchive(this.tmpContext.service, this.tmpContext.function))
    console.log(1)
    return
  }

  patch_orig_function(): Promise<any> {
    // throw new Error("Method not implemented.");
    return Promise.resolve(undefined)
  }

  async create_tmp_function(): Promise<any> {
    var tmpFuncArgs = {}
    const tmpFunc = await common.copyToTmp('.')
    common.debug(`copy original project to ${tmpFunc}`)

    try {
      const cmd = `s ${this.options.service}` + ' build --use-docker' +
        ' --command "PYTHONUSERBASE=/code/.s/python pip3 install --user --upgrade code-data-share"'
      common.debug("正在使用 docker 环境安装启动加速组件，首次使用可能较慢。")
      common.debug("如长时间无响应，可使用如下命令拉取成功后重新运行")
      common.debug(`cd "${tmpFunc}" && ${cmd}`)
      execSync(cmd, { cwd: tmpFunc }
      )
    } catch (error) {
      common.error(error.message)
      common.error(error.stdout)
      common.error(error.stderr)
      return Promise.reject("安装 pycds 依赖失败，跳过生成")
    }

    const funcCode = join(tmpFunc, this.options.codeUri)
    const tmpEntry = join(funcCode, 'pgo_index.py')

    await copy(join(__dirname, '../resources/pgo_index.py'), tmpEntry);
    if (this.options.initializer) {
      const initializer = this.options.initializer.split('.')
      await writeFile(tmpEntry, `from ${initializer[0]} import ${initializer[1]}\n` + readFileSync(tmpEntry, 'utf-8'));
      tmpFuncArgs['initializer'] = `pgo_index.${initializer[1]}`
    }

    const tmpArchive = join(tmpFunc, "tmp.zip")
    await this.makeZip(funcCode, tmpArchive)

    console.debug('initing sdk')
    const client = await this.get_client();

    // create service
    console.debug('create service')

    const tmpSession = uuid.v1()
    const serviceName = `pgo-service-${tmpSession}`
    const functionName = `pgo-function-${tmpSession}`
    const triggerName = `pgo-function-${tmpSession}`

    this.tmpContext.service = serviceName
    this.tmpContext.function = functionName
    this.tmpContext.trigger = triggerName

    return client.createService(serviceName, { description: '用于 Alinode Cloud Require Cache 生成', })
      .catch((err: any) => Promise.reject(new Error(`service 创建失败: ${err}`)))
      .then(_ => {
        return client.createFunction(serviceName, {
          code: {
            zipFile: readFileSync(tmpArchive, 'base64')
          },
          description: '',
          functionName,
          handler: 'pgo_index.gen_handler',
          memorySize: 1024,
          runtime: 'python3.9',
          timeout: 300,
          initializationTimeout: 300,
          environmentVariables: {
            PYTHONUSERBASE: '/code/.s/python',
            PYCDSMODE: 'TRACE',
            PYCDSLIST: '/tmp/cds.lst'
          },
          ...tmpFuncArgs
        }).catch((err: any) => Promise.reject(new Error(`function 创建失败: ${err}`)))
      })
  }
}
