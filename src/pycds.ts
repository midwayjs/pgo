import { exec } from "child_process";
import { platform } from 'os';
import { dirname, join, relative } from 'path';
import { lstat, readlink, createWriteStream, readFile } from 'fs-extra';
import * as globby from 'globby';
import * as JSZip from 'jszip';
import * as uuid from 'uuid-1345';


import * as FCClientInner from '@alicloud/fc2';


// import * as common from "./common"
// import {PromiseOnly} from "got";

import * as main from "./main"
import * as common from "./common";
import { readFileSync } from "fs";

abstract class AbstractPGO {
  pwd = process.cwd();
  params: main.ComponentProps;
  options: main.PGOOptions;

  // abstract gen_tmp_function(): Promise<any>;

  abstract create_tmp_function(): Promise<any>

  constructor(params: main.ComponentProps, options: main.PGOOptions) {
    this.params = params
    this.options = options
  }
}

export class PyCDS extends AbstractPGO {
  async create_tmp_function(): Promise<any> {
    exec(
      's build -t ../s.yaml --use-docker' +
      ' --command "PYTHONUSERBASE=/code/.s/python pip3 install --user --upgrade code-data-share"', (error, stdout, stderr) => {
        if (error) {
          console.debug(stdout)
          console.debug(stderr)
          return Promise.reject("安装 pycds 依赖失败，跳过生成")
        }
      }
    )

    await this.makeZip(this.pwd, "tmp.zip")

    // fc SDK
    console.error('initing sdk')
    const { accountId, ak, secret } = await common.getCredential('default')
    const fcClient = new FCClientInner(accountId, {
      region: 'cn-hangzhou',
      endpoint: await common.getEndPoint(),
      accessKeyID: ak,
      accessKeySecret: secret,
    });

    // create service
    console.error('create s')
    const serviceName = "tmp-service-0"
    await fcClient.createService(serviceName, {
      description: '用于 Alinode Cloud Require Cache 生成',
    });
    const functionName = `dump-${uuid.v1()}`;

    console.error('create f')
    await fcClient.createFunction(serviceName, {
      code: {
        zipFile: readFileSync("tmp.zip", 'base64')
      },
      description: '',
      functionName,
      handler: this.options.handler,
      initializer: this.options.initializer,
      memorySize: 1024,
      runtime: 'python3.9',
      timeout: 300,
      initializationTimeout: 300,
      environmentVariables: {
        PGO_RECORD: 'true',
        NODE_ENV: 'development',
      },
    })

    // cleanup
    const { aliases } = (await fcClient.listAliases(serviceName, { limit: 100 })).data;
    await Promise.all(aliases.map(alias => fcClient.deleteAlias(serviceName, alias.aliasName)));

    const { versions } = (await fcClient.listVersions(serviceName, { limit: 100 })).data;
    await Promise.all(versions.map(version => fcClient.deleteVersion(serviceName, version.versionId)));

    const { functions } = (await fcClient.listFunctions(serviceName, { limit: 100 })).data;
    await Promise.all(functions.map(func => fcClient.deleteFunction(serviceName, func.functionName)));

    await fcClient.deleteService(serviceName);
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
