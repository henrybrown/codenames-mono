import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { z } from "zod";
import winston from "winston";
import util from "util";

export const consoleFormat = winston.format.printf(
  ({ level, message, timestamp, meta, ...rest }) => {
    const prefix = `[env] `;

    const metaStr = meta
      ? `\n  ↳ ${util.inspect(meta, { colors: true, depth: null }).replace(/\n/g, "\n    ")}`
      : "";

    return `${timestamp} ${level} ${prefix}${message}${metaStr}`;
  },
);

const envLoadLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        consoleFormat,
      ),
    }),
  ],
});

export const loadEnvFromPackageDir = () => {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    envLoadLogger.error(`[X] No .env file found at: ${process.cwd()}`);
    throw new Error("Missing .env file. Please create one with required environment variables.");
  }

  envLoadLogger.info(`Loading environment from: ${envPath}`);
  dotenv.config({ path: envPath });

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    envLoadLogger.error("[X] Environment validation failed:");
    result.error.errors.forEach((issue) => {
      envLoadLogger.error(`    - ${issue.path.join(".")}: ${issue.message}`);
    });
    envLoadLogger.error("Please check your .env file and correct all issues above.");
    throw result.error;
  }

  const parsedEnv = result.data;

  if (parsedEnv.NODE_ENV === "development") {
    envLoadLogger.info("Environment Configuration:");
    envLoadLogger.info(`    - Environment: ${parsedEnv.NODE_ENV}`);
    envLoadLogger.info(`    - Port: ${parsedEnv.PORT}`);
    envLoadLogger.info(`    - Database: ${parsedEnv.DATABASE_URL}`);
    envLoadLogger.info(`    - LLM: ${parsedEnv.LLM_PROVIDER}/${parsedEnv.LLM_MODEL} @ ${parsedEnv.LLM_URL}`);
    envLoadLogger.info(
      `    - LLM Health Check: ${parsedEnv.LLM_HEALTH_CHECK_ENABLED} (throttle=${parsedEnv.LLM_HEALTH_THROTTLE_MS}ms, threshold=${parsedEnv.LLM_HEALTH_GPU_THRESHOLD})`
    );
    envLoadLogger.info(`    - Log Console Level: ${parsedEnv.LOG_CONSOLE_LEVEL}`);
  }

  envLoadLogger.info("Environment validated");
  return parsedEnv;
};

const EnvSchema = z.object({
  PORT: z.string().transform(Number).default("3000"),
  DATABASE_URL: z.string().url("Invalid DATABASE_URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "production", "test"]),
  LLM_PROVIDER: z.enum(["gemini", "openai", "anthropic", "ollama"]).default("gemini"),
  LLM_API_KEY: z.string().default("ollama"),
  LLM_URL: z.string().url("Invalid LLM_URL").default("https://generativelanguage.googleapis.com"),
  LLM_MODEL: z.string().min(1, "LLM_MODEL must not be empty").default("gemini-2.5-flash"),
  LLM_TEMPERATURE: z.string().transform(Number).default("0.7"),
  LLM_NUM_CTX: z.string().transform(Number).default("4096"),
  LLM_HEALTH_CHECK_ENABLED: z.string()
    .transform((v) => v !== "false")
    .default("true"),
  LLM_HEALTH_THROTTLE_MS: z.string()
    .transform(Number)
    .pipe(z.number().int().min(1000))
    .default("30000"),
  LLM_HEALTH_GPU_THRESHOLD: z.string()
    .transform(Number)
    .pipe(z.number().min(0).max(1))
    .default("0.99"),
  LOG_FILE_LEVEL: z.enum(["debug", "info", "warn", "error", "http"]).default("info"),
  LOG_CONSOLE_LEVEL: z.enum(["debug", "info", "warn", "error", "http", "silent"]).default("info"),
  LOG_FILE_PATH: z.string().default("./logs/app.info"),
  LOG_HTTP_REQUESTS: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  LOG_HTTP_VERBOSE: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  LOG_HTTP_TO_CONSOLE: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  CORS_ORIGINS: z.string().optional(),
});
