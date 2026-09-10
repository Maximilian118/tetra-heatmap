import logger from "./log.js";

/* Tracks whether an invalid DB_SSL value has already been reported, to avoid log spam */
let warnedInvalidDbSsl = false;

/* Parse the DB_SSL environment variable into an SSL override.
   Returns true/false when set to a recognised boolean value, or null when unset
   (or unrecognised) — meaning the UI-configured setting applies.
   Read lazily at call time: ESM import hoisting means module-scope reads would
   run before dotenv.config() populates process.env in bare-metal runs. */
export const getDbSslOverride = (): boolean | null => {
  const raw = process.env.DB_SSL;
  if (raw === undefined || raw.trim() === "") return null;

  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;

  if (!warnedInvalidDbSsl) {
    logger.warn(`Ignoring invalid DB_SSL value "${raw}" — expected true/false/1/0`);
    warnedInvalidDbSsl = true;
  }
  return null;
};
