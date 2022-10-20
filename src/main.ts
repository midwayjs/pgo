import * as minimist from 'minimist';

import {PGO} from './index';
import JavaStartupAccelerationComponent from "./javaMain";
import * as common from "./common"

export default class PGOComponent {
  defaultAccess = 'default';

  constructor(params: any = {}) {
    if (params.access) {
      this.defaultAccess = params.access;
    }
  }

  async gen(params) {
    await this.index(params);
  }

  async index(params) {
    const args = minimist(params.argsObj || []);
    const access = params?.project?.access || this.defaultAccess;
    const credential = await common.getCredential(access);
    const endpoint = await common.getEndPoint();
    const lang = this.getLang(args);
    if (lang === 'java') {
      await this.java(params);
    } else if (lang === 'node') {
      const pgoInstance = new PGO(process.cwd(), {
        initializer: params?.props?.initializer || 'index.initializer',
        credential,
        access,
        endpoint,
        region: 'cn-chengdu'
      });
      await pgoInstance.gen(args);
    } else {
      common.error("cannot parse runtime language, try to specific `--module` or `--lang`.");
    }
  }

  getLang(args) {
    // todo: read lang from `runtime` field of service.
    return args.lang;
  }

  async java(params) {
    const component = new JavaStartupAccelerationComponent(this.defaultAccess);
    await component.index(params);
  }
}
