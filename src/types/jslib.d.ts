// k6's module loader resolves imports by full URL, not by npm package name, so
// TypeScript needs an explicit ambient declaration to type-check imports like
// `import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.6.0/index.js'`.
declare module 'https://jslib.k6.io/k6-utils/1.6.0/index.js' {
  export function uuidv4(): string;
  export function randomIntBetween(min: number, max: number): number;
  export function randomItem<T>(arr: T[]): T;
  export function randomString(length: number, charset?: string): string;
  export function findBetween(content: string, left: string, right: string): string;
}
