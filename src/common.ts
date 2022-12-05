export const OSS = 'oss';
export const NAS = 'nas';
export const STREAM = 'stream';
export const SRPATH = '/code/runtime.data.share';
export const QUICK_START = '/code/quickstart.sh';
export const ARTIFACT_DIR = 'target/artifact';
export const OSS_UTIL_URL = 'https://gosspublic.alicdn.com/ossutil/1.7.9/ossutil64';

import { copy, ensureDir } from 'fs-extra';
import { createWriteStream } from 'fs-extra';

import * as core from '@serverless-devs/core';
import * as clientInner from '@alicloud/fc2';


import * as main from './main'

import { tmpdir } from 'os';
import { join } from 'path';

const prefix = '[acceleration adapter] ';

export function debug(msg: string) {
  console.debug(prefix + msg);
}

export function info(msg: string) {
  console.info(prefix + msg);
}

export function error(msg: string) {
  console.error(prefix + msg);
}

export async function getEndPoint() {
  const fcDefault = await core.loadComponent('devsapp/fc-default');
  const fcEndpoint: string = await fcDefault.get({ args: 'fc-endpoint' });
  if (!fcEndpoint) {
    return undefined;
  }
  const enableFcEndpoint: any = await fcDefault.get({ args: 'enable-fc-endpoint' });
  return enableFcEndpoint === true || enableFcEndpoint === 'true' ? fcEndpoint : undefined;
}

export async function copyToTmp(dir: string): Promise<string> {
  const tmpName = `pgo-tmp-${Date.now()}`;
  const tmpDir = join(tmpdir(), tmpName);
  await ensureDir(tmpDir);
  await copy(dir, tmpDir)
  return tmpDir
}

export abstract class AbstractPGO {
  options: main.PGOOptions;

  abstract run(): Promise<any>

  constructor(options: main.PGOOptions) {
    this.options = options
  }

  // context during creating temporary function to generate archive
  // service/function/trigger registered here will be automatically cleanup
  tmpContext: {
    client: any,
    service: string,
    function: string,
    trigger: string,
  }

  async get_client() {
    var client = this.tmpContext?.client

    if (!client) {
      console.debug('initing sdk')
      client = new clientInner(this.options.credentials.accountID, {
        region: this.options.region,
        endpoint: this.options.endpoint,
        accessKeyID: this.options.credentials.accessKeyID,
        accessKeySecret: this.options.credentials.accessKeySecret,
      });

      this.tmpContext = {
        client: client,
        service: this.tmpContext?.service,
        function: this.tmpContext?.function,
        trigger: this.tmpContext?.trigger,
      }
    }

    return this.tmpContext.client
  }

  async cleanup_tmp_function(): Promise<void> {
    const client = await this.get_client()
    const s = this.tmpContext.service

    const { aliases } = (await client.listAliases(s, { limit: 100 })).data;
    await Promise.all(aliases.map(alias => client.deleteAlias(s, alias.aliasName)));

    const { versions } = (await client.listVersions(s, { limit: 100 })).data;
    await Promise.all(versions.map(version => client.deleteVersion(s, version.versionId)));

    const { functions } = (await client.listFunctions(s, { limit: 100 })).data;

    for (const func of functions) {
      const { triggers } = (await client.listTriggers(s, func.functionName, { limit: 100 })).data;
      await Promise.all(triggers.map(trigger => client.deleteTrigger(s, func.functionName, trigger.triggerName)));
    }

    await Promise.all(functions.map(func => client.deleteFunction(s, func.functionName)));

    await client.deleteService(s);
  }

  async makeZip(sourceDirection: string, targetFileName: string) {
    return new Promise((res, rej) => {
      const archiver = require('archiver');

      const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
      });

      archive
        .once('finish', res)
        .once('error', rej)
        .on('warning', function (err) {
          if (err.code === 'ENOENT') {
          } else {
            throw err;
          }
        })
        .pipe(createWriteStream(targetFileName));

      archive.directory(sourceDirection, false);
      archive.finalize();
    })
  }

  /**
   * 服务端以 base64 分块传输
   */
  async downloadArchive(serviceName, functionName) {
    const client = await this.get_client()

    const result = await client.invokeFunction(serviceName, functionName, JSON.stringify({ type: 'size' }));
    if (!result.data || !/^\d+$/.test(result.data)) {
      console.log('result.data', result.data);
      throw new Error(`PGO gen error:` + (result.data || 'unknown'));
    }
    const size = +result.data;
    const partSize = 3 * 1024 * 1024;
    let buffer = Buffer.from('');
    let currentLen = 0;
    while (currentLen < size) {
      let curPartSize = size - currentLen;
      if (curPartSize > partSize) {
        curPartSize = partSize;
      }
      const result = await client.invokeFunction(serviceName, functionName, JSON.stringify({ start: currentLen, size: partSize }));
      const buf = Buffer.from(result.data, 'base64');
      buffer = Buffer.concat([buffer, buf]);
      currentLen += curPartSize;
    }
    return buffer;
  }
}
