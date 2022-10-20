export const OSS = 'oss';
export const NAS = 'nas';
export const STREAM = 'stream';
export const SRPATH = '/code/runtime.data.share';
export const QUICK_START = '/code/quickstart.sh';
export const ARTIFACT_DIR = 'target/artifact';
export const OSS_UTIL_URL = 'https://gosspublic.alicdn.com/ossutil/1.7.9/ossutil64';

import * as core from '@serverless-devs/core';

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
    const fcEndpoint: string = await fcDefault.get({args: 'fc-endpoint'});
    if (!fcEndpoint) {
        return undefined;
    }
    const enableFcEndpoint: any = await fcDefault.get({args: 'enable-fc-endpoint'});
    return enableFcEndpoint === true || enableFcEndpoint === 'true' ? fcEndpoint : undefined;
}


export async function getCredential(access) {
    const credential = await core.getCredential(access);
    return {
        accountId: credential.AccountID,
        secret: credential.AccessKeySecret,
        ak: credential.AccessKeyID,
    };
}
