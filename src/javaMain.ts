import * as core from "@serverless-devs/core"

import * as path from "path";
import {join} from "path";
import {existsSync, readFile} from 'fs-extra'

import {JavaStartupAcceleration} from './javaIndex';
import {ARTIFACT_DIR, error, info, NAS, OSS, SRPATH, STREAM, getEndPoint, getCredential} from "./common";

export default class JavaStartupAccelerationComponent {
  defaultAccess = 'default';

  constructor(defaultAccess) {
    this.defaultAccess = defaultAccess;
  }

  async index(params) {
    await this.checkSBuildArtifacts();

    let args = await this.parseArgs(params.argsObj);
    let debug = args.debug;
    if (debug) {
      info("index args: " + JSON.stringify(params));
    }
    info("parsed args: " + JSON.stringify(args));

    let fcEndpoint = await getEndPoint();
    let moduleName = args.moduleName;
    let serviceName = await this.getServiceConfig(moduleName, 'name');
    let functionName = await this.getFunctionConfig(moduleName, 'name');
    let initializer = await this.getFunctionConfig(moduleName, 'initializer');
    let runtime = await this.getFunctionConfig(moduleName, 'runtime');
    let region = await this.getModulesProps(moduleName, 'region');
    let role = await this.getServiceConfig(moduleName, 'role', false);
    let logConfig = await this.getServiceConfig(moduleName, 'logConfig', false);
    const access = params?.project?.access || this.defaultAccess;
    const credential = await getCredential(access);
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
      ossUtilUrl = await this.getGlobalConfig('ossUtilUrl', false);
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
    let instanceType = args.instanceType;
    let features = args.features;
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
      instanceType,
      enable,
      serviceName,
      functionName,
      funcEnvVars,
      features,
      debug
    });

    await instance.gen();
  }

  async getGlobalConfig(key: string, errorIfNotExist: boolean = true) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        let value = await this.replaceReference(yaml[key]);
        if (value === undefined) {
          throw new Error("key " + key + " does not exist");
        }
        return value;
      } catch (e) {
        error('read global config [' + key + '] error: ' + e.message);
        if (errorIfNotExist) {
          throw e;
        }
      }
    }
    return null;
  }

  async getModulesProps(moduleName: string, key: string, errorIfNotExist: boolean = true) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        let value = await this.replaceReference(yaml['services'][moduleName]['props'][key]);
        if (value === undefined) {
          throw new Error("key " + key + " does not exist");
        }
        return value;
      } catch (e) {
        info('read module prop [' + key + '] error: ' + e.message);
        if (errorIfNotExist) {
          throw e;
        }
      }
    }
    return null;
  }

  async getServiceConfig(moduleName: string, key: string, errorIfNotExist: boolean = true) {
    const yaml = await this.getConfig();
    if (yaml) {
      try {
        let value = await this.replaceReference(yaml['services'][moduleName]['props']['service'][key]);
        if (value === undefined) {
          throw new Error("key " + key + " does not exist");
        }
        return value;
      } catch (e) {
        error('read module config [' + key + '] error: ' + e.message);
        if (errorIfNotExist) {
          throw e;
        }
      }
    }
    return null;
  }

  async getFunctionConfig(moduleName: string, key: string, errorIfNotExist: boolean = true) {
    const yaml = await this.getConfig();

    if (yaml) {
      try {
        let value = await this.replaceReference(yaml['services'][moduleName]['props']['function'][key]);
        if (value === undefined) {
          throw new Error("key " + key + " does not exist");
        }
        return value;
      } catch (e) {
        error('read function config [' + key + '] error: ' + e.message);
        if (errorIfNotExist) {
          throw e;
        }
      }
    }

    return null;
  }

  async replaceReference(value) {
    if (typeof value !== 'string') {
      return value;
    }
    let myRegexp = new RegExp("\\${([a-zA-Z_.0-9]+)}", "g");
    let match = myRegexp.exec(value);
    if (match == null) {
      return value;
    }

    let ref = match[1].split('.');
    let config = await this.getConfig();
    for (let i = 0; i < ref.length; i++) {
      config = config[ref[i]];
    }
    return config;
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
    return core.parseYaml(yamlContent);
  }

  async checkSBuildArtifacts() {
    const path = join(process.cwd(), ".s", "build", "artifacts");
    if (existsSync(path)) {
      throw new Error("s build artifacts dir [" + path + "] should be deleted");
    } else {
      info("check s build artifacts: ok");
    }
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
      maxMemory: 4096,
      instanceType: "c1",
      enable: false,
      features: '',
      debug: false
    };

    const argv = require('yargs/yargs')(argStr).argv;

    if (argv.debug) {
      args.debug = true;
    }

    if (argv.enable) {
      args.enable = true;
    }

    if (argv.features) {
      args.features = argv.features;
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
    if (argv.instanceType) {
      args.instanceType = argv.instanceType;
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
