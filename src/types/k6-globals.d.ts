// k6's runtime provides a global `console` (log/info/warn/error/debug), but
// @types/k6 doesn't declare it since it isn't part of any k6 module import --
// only the DOM lib does, which we don't want to pull in for a non-browser env.
declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};
