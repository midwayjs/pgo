const prefix = '[acceleration adapter] ';

export function info(msg: string) {
    console.info(prefix + msg);
}

export function error(msg: string) {
    console.error(prefix + msg);
}
