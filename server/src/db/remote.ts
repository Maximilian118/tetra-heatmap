import mysql from "mysql2/promise";

/* Pool instance — created lazily by getPool() so env vars from dotenv are available.
   (ESM hoists all static imports above top-level code, so creating the pool at module
   evaluation time would read process.env before dotenv.config() runs.) */
let pool: ReturnType<typeof mysql.createPool> | null = null;

/* Return the MySQL connection pool, creating it on first call */
export const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      /* Single connection — we only run one sync query at a time */
      connectionLimit: 1,
      /* Fail fast if the connection can't be established */
      connectTimeout: 10_000,
      /* TetraFlex requires SSL (--require_secure_transport=ON) with a self-signed certificate */
      ssl: { rejectUnauthorized: false },
      /* Prevent idle connections from being dropped */
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    });
  }
  return pool;
};

/* Gracefully close all connections in the pool */
export const closePool = async () => {
  if (pool) await pool.end();
};
