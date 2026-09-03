// Ambient declarations for the xk6-sql extension (https://github.com/grafana/xk6-sql),
// adapted from its official TypeScript declaration file (https://sql.x.k6.io/index.d.ts).
// This module only exists in a custom k6 binary built with xk6 -- see
// scripts/build-k6-sql.sh and README.md "Database performance testing".
declare module 'k6/x/sql' {
  export interface Options {
    conn_max_idle_time?: string;
    conn_max_lifetime?: string;
    max_idle_conns?: number;
    max_open_conns?: number;
  }

  export interface Result {
    lastInsertId(): number;
    rowsAffected(): number;
  }

  export interface Row {
    [key: string]: unknown;
  }

  export interface Database {
    close(): void;
    exec(query: string, ...args: unknown[]): Result;
    execWithTimeout(timeout: string, query: string, ...args: unknown[]): Result;
    query(query: string, ...args: unknown[]): Row[];
    queryWithTimeout(timeout: string, query: string, ...args: unknown[]): Row[];
  }

  export function open(driverID: symbol, dataSourceName: string, options?: Options): Database;

  const _default: { open: typeof open };
  export default _default;
}

// The driver module's default export is an opaque driver-identifier symbol,
// passed as the first argument to sql.open(). One ambient module per driver
// actually built into the custom binary (see scripts/build-k6-sql.sh).
declare module 'k6/x/sql/driver/postgres' {
  const driver: symbol;
  export default driver;
}
