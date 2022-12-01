export const OSS = 'oss';
export const NAS = 'nas';
export const STREAM = 'stream';
export const SRPATH = '/code/runtime.data.share';
export const QUICK_START = '/code/quickstart.sh';
export const ARTIFACT_DIR = 'target/artifact';
export const OSS_UTIL_URL = 'https://gosspublic.alicdn.com/ossutil/1.7.9/ossutil64';

import { copy, ensureDir } from 'fs-extra';

import * as core from '@serverless-devs/core';
import * as FCClientInner from '@alicloud/fc2';

import *as main from './main'

// import globby = require('globby');
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

  async get_fcclient() {
    var client = this.tmpContext?.client

    if (!client) {
      console.debug('initing sdk')
      client = new FCClientInner(this.options.credentials.accountID, {
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
    const client = await this.get_fcclient()
    const s = this.tmpContext.service
    const f = this.tmpContext.function

    return client.listTriggers(this.tmpContext.service, this.tmpContext.function)
      .then(data => {
        const { triggers } = data
        return Promise.all(triggers.map(t => client.deleteTrigger(s, f, t.triggerName)))
      })

      .finally(() => { return client.listAliases(s, { limit: 100 }) })
      .then(data => {
        const { aliases } = data
        return Promise.all(aliases.map(a => client.deleteAlias(s, a.aliasName)))
      })

      .finally(() => { return client.listVersions(s, { limit: 100 }) })
      .then(data => {
        const { versions } = data
        return Promise.all(versions.map(v => client.deleteVersion(s, v.versionId)))
      })

      .finally(() => { return client.listFunctions(s, { limit: 100 }) })
      .then(data => {
        const { functions } = data
        return Promise.all(functions.map(f => client.deleteFunction(s, f.functionName)))
      })

      .finally(() => client.deleteService(s) )

      // ignore errors
      .catch(_ => Promise.resolve(undefined))
  }
}
