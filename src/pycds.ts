import { execSync } from "child_process";
import { platform } from 'os';
import { dirname, join, relative } from 'path';
import { lstat, readlink, createWriteStream, readFile, copy, writeFile, unlink, readFileSync, rm, pathExists } from 'fs-extra';
import * as globby from 'globby';
import * as JSZip from 'jszip';
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
      .finally(this.cleanup_tmp_function.bind(this))
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
    return this.get_fcclient()
      .then(client => client.get(`/proxy/${this.tmpContext.service}/${this.tmpContext.function}/pgo_dump/download`))
      .then(data => writeFile(join(this.options.codeUri, 'cds.img'), data))
  }

  patch_orig_function(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async create_tmp_function(): Promise<any> {
    const tmpFunc = await common.copyToTmp('.')
    common.debug(`copy original project to ${tmpFunc}`)

    try {
      execSync(
        's build --use-docker' +
        ' --command "PYTHONUSERBASE=/code/.s/python pip3 install --user --upgrade code-data-share"',
        { cwd: tmpFunc }
      )
    } catch (error) {
      common.error(error.message)
      common.error(error.stdout)
      common.error(error.stderr)
      return Promise.reject("安装 pycds 依赖失败，跳过生成")
    }

    const funcCode = join(tmpFunc, this.options.codeUri)

    await copy(join(__dirname, '../resources/pgo_index.py'), join(funcCode, 'pgo_index.py'));

    await this.makeZip(funcCode, "tmp.zip")

    console.debug('initing sdk')
    const client = await this.get_fcclient();

    // create service
    console.debug('create service')
    const serviceName = "tmp-service-0"
    const functionName = `dump-${uuid.v1()}`;
    const triggerName = 't1'

    return client.createService(serviceName, { description: '用于 Alinode Cloud Require Cache 生成', })
      .catch(err => Promise.reject('service 创建失败，跳过生成'))
      .then(_ => { this.tmpContext.service = serviceName })
      .then(_ => {
        return client.createFunction(serviceName, {
          code: {
            zipFile: readFileSync("tmp.zip", 'base64')
          },
          description: '',
          functionName,
          handler: 'pgo_index.gen_handler',
          initializer: 'pgo_index.initializer',
          memorySize: 1024,
          runtime: 'python3.9',
          timeout: 300,
          initializationTimeout: 300,
          environmentVariables: {
            PYTHONUSERBASE: '/code/.s/python',
            PYCDSMODE: 'TRACE',
            PYCDSLIST: '/tmp/cds.lst'
          },
        })
      })
      .catch(err => Promise.reject('function 创建失败，跳过生成'))
      .then(_ => { this.tmpContext.function = functionName })
      .then(_ => {
        return client.createTrigger(serviceName, functionName, {
          invocationRole: '',
          qualifier: 'LATEST',
          sourceArn: 'test',
          triggerConfig: { authType: "anonymous", methods: ["GET"] },
          triggerName: triggerName,
          triggerType: 'http'
        })
      })
      .catch(err => Promise.reject('trigger 创建失败，跳过生成'))
      .then(_ => { this.tmpContext.trigger = triggerName });
  }

  private async makeZip(sourceDirection: string, targetFileName: string) {
    let ignore = [];
    const fileList = await globby(['**', '.s/**'], {
      onlyFiles: false,
      followSymbolicLinks: false,
      cwd: sourceDirection,
      ignore,
    });
    const zip = new JSZip();
    const isWindows = platform() === 'win32';
    for (const fileName of fileList) {
      const absPath = join(sourceDirection, fileName);
      const stats = await lstat(absPath);

      if (stats.isDirectory()) {
        zip.folder(fileName);
      } else if (stats.isSymbolicLink()) {
        let link = await readlink(absPath);
        if (isWindows) {
          link = relative(dirname(absPath), link).replace(/\\/g, '/');
        }
        zip.file(fileName, link, {
          binary: false,
          createFolders: true,
          unixPermissions: stats.mode,
        });
      } else if (stats.isFile()) {
        const fileData = await readFile(absPath);
        zip.file(fileName, fileData, {
          binary: true,
          createFolders: true,
          unixPermissions: stats.mode,
        });
      }
    }
    await new Promise((res, rej) => {
      zip
        .generateNodeStream({
          platform: 'UNIX',
          compression: 'DEFLATE',
          compressionOptions: {
            level: 6
          }
        })
        .pipe(createWriteStream(targetFileName))
        .once('finish', res)
        .once('error', rej);
    });
  }
}
