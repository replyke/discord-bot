const log = (...args: any) => console.log(`[log]`, ...args);
const warn = (...args: any) => console.warn(`[warn]`, ...args);
const error = (...args: any) => console.error(`[error]`, ...args);

export { log, warn, error };
