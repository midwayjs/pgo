import * as minimist from 'minimist';
import * as core from "@serverless-devs/core"
import { existsSync, readFileSync } from 'fs-extra';

import { NodePGO } from './node';
import * as common from "./common"
import * as pycds from "./pycds"

const JAVA_RUNTIME = 'java'

const SUPPORTED_NODE_RUNTIMES = ['nodejs14']
const SUPPORTED_PYTHON_RUNTIMES = ['python3.9']

/**
 * Arguments passed by serverless-devs
 * Ref: https://docs.serverless-devs.com/sdm/serverless_package_model/package_model#%E7%BB%84%E4%BB%B6%E6%A8%A1%E5%9E%8B%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83
 */
export type ComponentProps = {
  command: string;
  project: {
    projectName: string;
    component: string;
    provider: string;
    access: string;
  };
  credentials: {};
  props: any;
  args: string;
  argsObj: [string];
}

export type PGOOptions = {
  service: string;
  lang: string;

  serviceModel;

  // valuable fields exracted from serviceModel
  access: string;
  credentials: {
    accountID: string;
    accessKeyID: string;
    accessKeySecret: string;
  };
  endpoint: string;
  region: string;
  initializer: string;
  handler: string;
  codeUri: string;

  // node
  remove_node_modules: boolean;
};

export const DefaultPGOOptioins = {
  access: 'default',
  serviceModel: undefined,
  remove_node_modules: false
}

async function parseOptions(args: ComponentProps): Promise<PGOOptions> {
  const opts = minimist(args.argsObj)
  console.error(opts)

  var model = opts.model || 's.yaml'
  if (!existsSync(model)) {
    throw new Error(`cannot find ${model} file, specific --model to the yaml file.`)
  }
  const yamlContent = readFileSync(model, 'utf8')
  const serviceModel = core.parseYaml(yamlContent)

  // 读取 service/function
  const fcServices = Object.entries(serviceModel.services).filter((ent, idx) => {
    return ent[1]['component'] == 'fc'
  })
  var funcName: string
  if (fcServices.length == 1) {
    const onlyFunction = fcServices[0][0]
    if (opts.function && opts.function != onlyFunction) {
      throw new Error("function not match");
    }
    funcName = onlyFunction
  } else {
    funcName = opts.function
    if (serviceModel.services[funcName] === undefined) {
      throw new Error(`${funcName} not exists in model.`);
    }
  }

  const access = opts.access || args.project.access;
  const c = args.credentials || await core.getCredential(access);
  const credential = {
    accountID: c.AccountID,
    accessKeySecret: c.AccessKeySecret,
    accessKeyID: c.AccessKeyID,
  }

  return {
    serviceModel: serviceModel,

    service: funcName,

    access: access,
    credentials: credential,
    endpoint: await common.getEndPoint(),
    lang: serviceModel.services[funcName].props.function.runtime,
    initializer: serviceModel.services[funcName].props.function.initializer,
    handler: serviceModel.services[funcName].props.function.handler,
    codeUri: serviceModel.services[funcName].props.function.codeUri,
    region: serviceModel.services[funcName].props.region,

    remove_node_modules: opts?.['remove-nm'],
    // ...DefaultPGOOptioins
  };
}

export default class PGOComponent {
  defaultAccess = 'default';

  constructor(params: any = {}) { }

  async gen(params: ComponentProps) {
    await this.index(params);
  }

  async index(params: ComponentProps) {
    const options = await parseOptions(params)

    var pgoInstance: common.AbstractPGO

    if (SUPPORTED_NODE_RUNTIMES.indexOf(options.lang) != -1) {
      pgoInstance = new NodePGO(options)
    } else if (options.lang === JAVA_RUNTIME) {
      // pgoInstance = new JavaStartupAccelerationComponent(options)
    } else if (SUPPORTED_PYTHON_RUNTIMES.indexOf(options.lang) != -1) {
      pgoInstance = new pycds.PyCDS(options)
    } else {
      common.error("cannot parse runtime language, try to specific `--module` or `--lang`.");
    }

    await pgoInstance.run().catch(err => { common.error(`创建失败，跳过生成: ${err}`) });
  }
}
