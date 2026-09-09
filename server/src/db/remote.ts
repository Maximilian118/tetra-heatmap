import mysql from "mysql2/promise";
import type { Settings } from "./settings.js";
import logger from "../utils/log.js";

/* Subset of settings needed to open a remote MySQL connection */
export type DbConnectionConfig = Pick<
  Settings,
  "dbHost" | "dbPort" | "dbUser" | "dbPassword" | "dbName" | "dbSsl"
>;

/* Pool instance — created by createPool() when settings are configured */
let pool: ReturnType<typeof mysql.createPool> | null = null;

/* Build the connection options shared by the pool and throwaway test connections.
   TetraFlex requires SSL (--require_secure_transport=ON) with a self-signed certificate,
   but other MySQL servers may not support SSL — the dbSsl setting toggles it. */
export const buildConnectionOptions = (config: DbConnectionConfig) => ({
  host: config.dbHost,
  port: config.dbPort,
  user: config.dbUser,
  password: config.dbPassword,
  database: config.dbName,
  /* Fail fast if the connection can't be established */
  connectTimeout: 3_000,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
});

/* Create the MySQL connection pool with the given settings */
export const createPool = (config: DbConnectionConfig) => {
  logger.info(
    `Creating MySQL pool → ${config.dbHost}:${config.dbPort}/${config.dbName} (SSL ${config.dbSsl ? "on" : "off"})`
  );
  pool = mysql.createPool({
    ...buildConnectionOptions(config),
    /* Single connection — we only run one sync query at a time */
    connectionLimit: 1,
    /* Prevent idle connections from being dropped */
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
};

/* Return the current MySQL pool, or null if none has been created */
export const getPool = () => pool;

/* Gracefully close all connections in the pool */
export const closePool = async () => {
  if (pool) {
    logger.info("Closing MySQL pool");
    await pool.end();
    pool = null;
  }
};

/* Destroy the current pool and create a new one with updated settings */
export const recreatePool = async (config: DbConnectionConfig) => {
  await closePool();
  createPool(config);
};
