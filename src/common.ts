export const OSS = 'oss';
export const NAS = 'nas';
export const STREAM = 'stream';
export const SRPATH = '/code/runtime.data.share';
export const QUICK_START = '/code/quickstart.sh';
export const ARTIFACT_DIR = 'target/artifact';
export const OSS_UTIL_URL = 'https://gosspublic.alicdn.com/ossutil/1.7.9/ossutil64';

const prefix = '[acceleration adapter] ';

export function info(msg: string) {
    console.info(prefix + msg);
}

export function error(msg: string) {
    console.error(prefix + msg);
}
