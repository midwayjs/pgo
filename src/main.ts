import * as core from '@serverless-devs/core';
import { PGO } from './index';
import * as minimist from 'minimist';
import JavaStartupAccelerationComponent from "./javaMain";

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
    const credential = await this.getCredential(access);
    const endpoint = await this.getEndPoint();
    if (args.lang === 'java') {
      await this.java(params);
    } else {
      const pgoInstance = new PGO(process.cwd(), {
        initializer: params?.props?.initializer || 'index.initializer',
        credential,
        access,
        endpoint,
        region: 'cn-chengdu'
      });
      await pgoInstance.gen(args);
    } 
  }

  async java(params) {
    const component = new JavaStartupAccelerationComponent(this.defaultAccess);
    await component.index(params);
  }

  async getEndPoint() {
    const fcDefault = await core.loadComponent('devsapp/fc-default');
    const fcEndpoint: string = await fcDefault.get({ args: 'fc-endpoint' });
    if (!fcEndpoint) {
      return undefined;
    }
    const enableFcEndpoint: any = await fcDefault.get({ args: 'enable-fc-endpoint' });
    return enableFcEndpoint === true || enableFcEndpoint === 'true' ? fcEndpoint : undefined;
  }

  async getCredential(access) {
    const credential =  await core.getCredential(access);
    return {
      accountId: credential.AccountID,
      secret: credential.AccessKeySecret,
      ak: credential.AccessKeyID,
    };
  }

}
