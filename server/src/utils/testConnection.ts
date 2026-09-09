import mysql from "mysql2/promise";
import { buildConnectionOptions, type DbConnectionConfig } from "../db/remote.js";

/* Test MySQL connectivity with the given credentials.
   Creates a throwaway connection (not the production pool), runs SELECT 1, and cleans up.
   Returns { success: true } or { success: false, error: string }. */
export const testConnection = async (
  config: DbConnectionConfig
): Promise<{ success: boolean; error?: string }> => {
  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection(buildConnectionOptions(config));
    await connection.query("SELECT 1");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
};
