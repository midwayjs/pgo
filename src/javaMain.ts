import * as core from '@serverless-devs/core';
import {JavaStartupAcceleration} from './javaIndex';
import {join} from "path";
import {existsSync, readFile} from 'fs-extra'
import * as YAML from 'js-yaml';
import * as child_process from 'child_process'
import {info} from "./common";
import * as path from "path";

export default class JavaStartupAccelerationComponent {
  defaultAccess = 'default';
  constructor(defaultAccess) {
    this.defaultAccess = defaultAccess;
  }

  async index(params) {
    info('args: ' + JSON.stringify(params.argsObj));
    const argv = require('yargs/yargs')(params.argsObj).argv;
    if (!argv.module) {
      throw new Error('please specify module name');
    } else {
      info('module name ' + argv.module);
    }
    let moduleName = argv.module;
    let fcEndpoint = await this.getFCEndpoint();
    let initializer = await this.getFunctionConfig(moduleName, 'initializer');
    let runtime = await this.getFunctionConfig(moduleName, 'runtime');
    let region = await this.getModulesProps(moduleName, 'region');
    let role = await this.getServiceConfig(moduleName, 'role');
    let logConfig = await this.getServiceConfig(moduleName, 'logConfig');
    const access = params?.project?.access || this.defaultAccess;
    const credential = await this.getCredential(access);

    let srpath = await this.getFunctionEnvVar(moduleName, 'SRPATH');
    let sharedDirName = path.basename(srpath);
    if (path.dirname(srpath) != '/code') {
      throw new Error('environment var SRPATH should start with /code');
    }

    let codeUri = await this.getFunctionConfig(moduleName, 'codeUri');
    if (codeUri != 'target/artifact') {
      throw new Error('codeUri should be ' + 'target/artifact');
    }

    const instance = new JavaStartupAcceleration(process.cwd(), {
      region,
      fcEndpoint,
      access,
      runtime,
      sharedDirName,
      initializer,
      credential,
      role,
      logConfig
    });

    await instance.gen();
  }

  async getCredential(access) {
    const credential =  await core.getCredential(access);
    return {
      accountId: credential.AccountID,
      secret: credential.AccessKeySecret,
      ak: credential.AccessKeyID,
    };
  }

  async getFCEndpoint() {
    let output = child_process.execSync('s cli fc-default get');
    let lines = output.toString().split("\n");
    for (let index in lines) {
      if (lines[index].indexOf('fc-endpoint:') === 0) {
        return lines[index].split(": ")[1];
      }
    }
  }

  async getModulesProps(moduleName: string, key: string) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        return yaml['services'][moduleName]['props'][key];
      } catch (e) {
        console.error('read module prop [' + key + '] error');
        throw e;
      }
    }
  }

  async getServiceConfig(moduleName: string, key: string) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        return yaml['services'][moduleName]['props']['service'][key];
      } catch (e) {
        console.error('read module config [' + key + '] error');
        throw e;
      }
    }
  }

  async getFunctionConfig(moduleName: string, key: string, errorIfNotExist: boolean = false) {
    const yaml = await this.getConfig();

    let value = null;
    if (yaml) {
      try {
        value = yaml['services'][moduleName]['props']['function'][key];
      } catch (e) {
        if (errorIfNotExist) {
          throw e;
        } else {
          console.error('function config [' + key + '] does not exist:' + e.message);
        }
      }
    }

    return value;
  }

  async getFunctionEnvVar(moduleName: string, name: string) {
    const environmentVariables = await this.getFunctionConfig(moduleName, "environmentVariables", true);

    if (environmentVariables[name]) {
      return environmentVariables[name];
    } else {
      throw new Error("function has no environment variable: " + name);
    }
  }

  async getConfig() {
    const yamlContent = await this.readFileContent('s.yaml')
    return YAML.load(yamlContent);
  }

  async readFileContent(fileName: string) {
    const path = join(process.cwd(), fileName);
    const isExists = existsSync(path);
    if (!isExists) {
      throw new Error("File " + fileName + " does not exist");
    }

    return await readFile(path, 'utf-8');
  }
}
