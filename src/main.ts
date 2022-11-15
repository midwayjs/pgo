import * as minimist from 'minimist';
import * as core from "@serverless-devs/core"
import { existsSync, readFileSync } from 'fs-extra';

import { PGO } from './index';
import JavaStartupAccelerationComponent from "./javaMain";
import * as common from "./common"
import * as pycds from "./pycds"

const NODE_RUNTIME = 'node'
const JAVA_RUNTIME = 'java'

const SUPPORTED_PYTHON_RUNTIMES = ['python3.9']

/**
 * Ref: https://docs.serverless-devs.com/sdm/serverless_package_model/package_model
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

async function parseOptions(args): Promise<PGOOptions> {
  const opts = minimist(args)
  console.error(opts)

  var model = opts.model || 's.yaml'
  if (!existsSync(model)) {
    throw new Error('cannot find s.yaml file, specific --model to the yaml file.')
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

  // 其他属性
  const lang = serviceModel.services[funcName].props.function.runtime
  const initializer = serviceModel.services[funcName].props.function.initializer
  const handler = serviceModel.services[funcName].props.function.handler
  const codeUri = serviceModel.services[funcName].props.function.codeUri
  const region = serviceModel.services[funcName].props.region

  return {
    serviceModel: serviceModel,

    service: funcName,

    lang: lang,
    initializer: initializer,
    handler: handler,
    codeUri: codeUri,
    region: region,

    remove_node_modules: false,
    ...DefaultPGOOptioins
  };
}

export default class PGOComponent {
  defaultAccess = 'default';

  constructor(params: any = {}) {
    if (params.access) {
      this.defaultAccess = params.access;
    }
  }

  async gen(params: ComponentProps) {
    await this.index(params);
  }

  async index(params: ComponentProps) {
    const options = await parseOptions(params.argsObj || [])

    const args = minimist(params.argsObj || []);
    const access = params?.project?.access || this.defaultAccess;
    const credential = await common.getCredential(access);
    const endpoint = await common.getEndPoint();


    const lang = options.lang;
    if (lang === NODE_RUNTIME) {
      const pgoInstance = new PGO(process.cwd(), {
        initializer: params?.props?.initializer || 'index.initializer',
        credential,
        access,
        endpoint,
        region: 'cn-chengdu'
      });
      await pgoInstance.gen(args);
    } else if (lang === JAVA_RUNTIME) {
      await this.java(params);
    } else if (SUPPORTED_PYTHON_RUNTIMES.indexOf(lang) != -1) {
      await this.python(params, options)
    } else {
      common.error("cannot parse runtime language, try to specific `--module` or `--lang`.");
    }
  }

  getLang(args) {
    // todo: read lang from `runtime` field of service.
    if (!args.lang) {
      return NODE_RUNTIME;
    }
    return args.lang;
  }

  async java(params) {
    const component = new JavaStartupAccelerationComponent(this.defaultAccess);
    await component.index(params);
  }

  async python(params: ComponentProps, options: PGOOptions) {
    common.info("start pycds")
    const instance = new pycds.PyCDS(params, options)
    await instance.run()
      .catch(common.error)
    common.info("end pycds")
  }
}
