import winston from "winston";

/* Format: [29-03-26 16:02:43] [info] Sync started */
const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] [${level}] ${message}`;
});

/* Winston logger with DD-MM-YY timestamped console output */
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "DD-MM-YY HH:mm:ss" }),
    winston.format.colorize({ level: true }),
    consoleFormat,
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
