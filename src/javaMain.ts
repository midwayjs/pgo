import * as core from '@serverless-devs/core';
import {JavaStartupAcceleration} from './javaIndex';
import * as path from "path";
import {join} from "path";
import {existsSync, readFile} from 'fs-extra'
import * as YAML from 'js-yaml';
import * as child_process from 'child_process'
import {ARTIFACT_DIR, error, info, NAS, OSS, SRPATH, STREAM} from "./common";

export default class JavaStartupAccelerationComponent {
  defaultAccess = 'default';
  constructor(defaultAccess) {
    this.defaultAccess = defaultAccess;
  }

  async index(params) {
    let args = await this.parseArgs(params.argsObj);
    let moduleName = args.moduleName;
    let serviceName = await this.getServiceConfig(moduleName, 'name');
    let functionName = await this.getFunctionConfig(moduleName, 'name');
    let fcEndpoint = await this.getFCEndpoint();
    let initializer = await this.getFunctionConfig(moduleName, 'initializer');
    let runtime = await this.getFunctionConfig(moduleName, 'runtime');
    let region = await this.getModulesProps(moduleName, 'region');
    let role = await this.getServiceConfig(moduleName, 'role');
    let logConfig = await this.getServiceConfig(moduleName, 'logConfig');
    const access = params?.project?.access || this.defaultAccess;
    const credential = await this.getCredential(access);
    let codeUri = await this.getFunctionConfig(moduleName, 'codeUri');
    let srpath = await this.getFunctionEnvVar(moduleName, 'SRPATH');
    if (!srpath) {
      srpath = SRPATH;
    }
    srpath = this.removeStrSuffix(srpath, "/");
    let sharedDirName = path.basename(srpath);

    let downloader = args.downloader;
    let uploader = args.uploader;
    let ossUtilUrl, ossEndpoint;
    if (downloader == OSS) {
      ossUtilUrl = await this.getGlobalConfig('ossUtilUrl');
      ossEndpoint = await this.getModulesProps(moduleName, 'ossEndpoint', false);
    }

    let enable = args.enable;
    if (!enable && uploader != NAS && path.dirname(srpath) != '/code') {
      throw new Error('environment var SRPATH should start with /code');
    }

    let vpcConfig, nasConfig;
    if (downloader == NAS || uploader == NAS) {
      vpcConfig = await this.getServiceConfig(moduleName, 'vpcConfig');
      nasConfig = await this.getServiceConfig(moduleName, 'nasConfig');
      let fcDir = nasConfig.mountPoints[0].fcDir;
      if (!fcDir) {
        throw new Error("fcDir is empty, please check");
      }
      fcDir = this.removeStrSuffix(fcDir, "/");
      let mountPoint = {
        serverAddr: nasConfig.mountPoints[0].serverAddr + ":" + nasConfig.mountPoints[0].nasDir,
        mountDir: fcDir
      };
      nasConfig.mountPoints = [mountPoint];
      if (uploader == NAS) {
        if (fcDir == srpath || srpath.indexOf(fcDir) != 0) {
          throw new Error("SRPATH should be subdir of fcDir");
        }
        if (!srpath.endsWith("/runtime.data.share")) {
          throw new Error("invalid SRPATH [" + srpath + "], should end with /runtime.data.share, for example: /mnt/nas/runtime.data.share");
        }
      }
    }

    let ossBucket, ossKey;
    if (uploader == OSS) {
      ossBucket = await this.getFunctionConfig(moduleName, 'ossBucket');
      ossKey = await this.getFunctionConfig(moduleName, 'ossKey');
      codeUri = ARTIFACT_DIR;
    }

    if (!enable) {
      if (codeUri != ARTIFACT_DIR) {
        throw new Error('codeUri should be ' + ARTIFACT_DIR);
      }
    }

    let initTimeout = args.initTimeout;
    let timeout = args.timeout;
    let maxMemory = args.maxMemory;
    let funcEnvVars = await this.getFunctionEnvVars(moduleName);
    const instance = new JavaStartupAcceleration(process.cwd(), {
      region,
      fcEndpoint,
      access,
      runtime,
      sharedDirName,
      initializer,
      credential,
      role,
      logConfig,
      downloader,
      uploader,
      ossUtilUrl,
      ossBucket,
      ossKey,
      ossEndpoint,
      vpcConfig,
      nasConfig,
      srpath,
      initTimeout,
      timeout,
      maxMemory,
      enable,
      serviceName,
      functionName,
      funcEnvVars
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

  async getGlobalConfig(key: string) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        return yaml[key];
      } catch (e) {
        error('read global config [' + key + '] error');
        throw e;
      }
    }
  }

  async getModulesProps(moduleName: string, key: string, errorIfNotExist: boolean = true) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        return yaml['services'][moduleName]['props'][key];
      } catch (e) {
        if (errorIfNotExist) {
          throw e;
        } else {
          info('read module prop [' + key + '] error');
        }
      }
    }
  }

  async getServiceConfig(moduleName: string, key: string) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        return yaml['services'][moduleName]['props']['service'][key];
      } catch (e) {
        error('read module config [' + key + '] error');
        throw e;
      }
    }
  }

  async getFunctionConfig(moduleName: string, key: string, errorIfNotExist: boolean = true) {
    const yaml = await this.getConfig();

    let value = null;
    if (yaml) {
      try {
        value = yaml['services'][moduleName]['props']['function'][key];
      } catch (e) {
        if (errorIfNotExist) {
          throw e;
        } else {
          info('function config [' + key + '] does not exist:' + e.message);
        }
      }
    }

    return value;
  }

  async getFunctionEnvVar(moduleName: string, name: string) {
    const environmentVariables = await this.getFunctionConfig(moduleName, "environmentVariables", false);

    if (environmentVariables && environmentVariables[name]) {
      return environmentVariables[name];
    } else {
      error("function has no environment variable: " + name);
      return null;
    }
  }

  async getFunctionEnvVars(moduleName: string) {
    return await this.getFunctionConfig(moduleName, "environmentVariables", false);
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

  async parseArgs(argStr) {
    info('pgo args: ' + argStr);
    let args = {
      uploader: 'stream',
      downloader: 'oss',
      moduleName: '',
      initTimeout: 5 * 60,
      timeout: 60 * 60,
      maxMemory: 3072,
      enable: false
    };

    const argv = require('yargs/yargs')(argStr).argv;

    if (argv.enable) {
      args.enable = true;
    }

    if (argv.module) {
      args.moduleName = argv.module;
    } else {
      throw new Error('module name is required');
    }

    if (parseInt(argv.initTimeout) > 0) {
      args.initTimeout = parseInt(argv.initTimeout);
    }
    if (parseInt(argv.timeout) > 0) {
      args.timeout = parseInt(argv.timeout);
    }
    if (parseInt(argv.maxMemory) > 0) {
      args.maxMemory = parseInt(argv.maxMemory);
    }

    if (argv.downloader) {
      if (this.checkTransMethod(argv.downloader)) {
        args.downloader = argv.downloader;
      } else {
        throw new Error("invalid downloader, choose one from ['oss', 'nas', 'stream']")
      }
    }

    if (argv.uploader) {
      if (this.checkTransMethod(argv.uploader)) {
        args.uploader = argv.uploader;
      } else {
        throw new Error("invalid uploader, choose one from ['oss', 'nas', 'stream']")
      }
    }

    this.checkTransMethodCombination(args.downloader, args.uploader);

    return args;
  }

  removeStrSuffix(str: string, suffix: string) {
    if (!str) {
      return str;
    }
    if (str.endsWith(suffix)) {
      return str.substring(0, suffix.lastIndexOf(suffix));
    } else {
      return str;
    }
  }

  checkTransMethod(method: string) {
    return method == STREAM || method == OSS || method == NAS;
  }

  /*
   * +------------+------------+-----------------+
   * | downloader | uploader   |      remark     |
   * +------------+------------+ ----------------+
   * | oss,       | stream     |  recommended    |
   * +------------+------------+ ----------------+
   * | nas,       | stream     |  recommended    |
   * +------------+------------+ ----------------+
   * | oss,       | oss        |  recommended    |
   * +-------------------------+ ----------------+
   * | nas,       | nas        |     tested      |
   * +------------+------------+ ----------------+
   * | stream,    | stream     | not recommended |
   * +------------+------------+ ----------------+
   * | nas,       | oss        |   unsupported   |
   * +------------+------------+ ----------------+
   */
  checkTransMethodCombination(downloader: string, uploader: string) {
    if (downloader == NAS && uploader == OSS) {
      throw new Error("the combination is unsupported: downloader [" + downloader + "], uploader [" + uploader + "]")
    }
  }
}
