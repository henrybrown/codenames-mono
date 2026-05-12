import express from "express";
import cors from "cors";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import { errorHandler, notFoundHandler } from "./shared/http-middleware/error-handler.middleware";
import * as postgresDb from "./shared/db";
import { createHttpClient } from "./shared/http-client";
import { createOpenApiSpec } from "@codenames/shared/api";
import { loadEnvFromPackageDir } from "./shared/config";
import { createAppLogger } from "./shared/logging";
import swaggerUi from "swagger-ui-express";

import { initialize as initializeAuth } from "./auth";
import { initialize as initializeLobby } from "./game/lobby";
import { initialize as initializeGameplay } from "./game/gameplay";
import { initialize as initializeAI } from "./ai";
import { initialize as initializeChat } from "./chat";

import { authMiddleware } from "@backend/shared/http-middleware/auth.middleware";
import { httpLoggerMiddleware } from "@backend/shared/http-middleware/http-logger.middleware";
import { refreshSystemData } from "./shared/data/system-data-loader";
import { initializeWebSocketServer } from "./shared/websocket";

/**
 * Runtime validation of env. variables
 */
let env;
try {
  env = loadEnvFromPackageDir();
} catch (error) {
  console.error("[X] Exiting due to invalid environment variables");
  process.exit(1);
}

/**
 * Initialize application logger
 */
const appLogger = createAppLogger({
  logFilePath: env.LOG_FILE_PATH,
  level: env.LOG_FILE_LEVEL,
  consoleLevel: env.LOG_CONSOLE_LEVEL,
  logDir: env.LOG_FILE_PATH,
});

const startupLogger = appLogger.for({ server: "startup" }).toConsole().create();

startupLogger.info("Server starting");

/**
 * Initialize the Express application with all middleware and features
 */

const app = express();
const dbInstance = await postgresDb.initializeDb(appLogger)(env.DATABASE_URL);
const httpClient = createHttpClient(appLogger);

/**
 * Refresh system data from json files.
 */
try {
  await refreshSystemData(startupLogger)(dbInstance);
} catch (error) {
  startupLogger.error("Failed to refresh system data", {
    error: error instanceof Error ? error.message : String(error),
  });
}

// CORS configuration that allows credentials
const devOrigins = [
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.1.156:8000",
];

const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((s: string) => s.trim())
  : devOrigins;

const corsOptions = {
  origin: corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cookie",
    "Access-Control-Allow-Origin",
  ],
  exposedHeaders: ["Set-Cookie"],
};

// Configure general middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up Swagger docs
const swaggerSpec = createOpenApiSpec();
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// this is the auth middleware handlers to be injected into features
const authHandlers = authMiddleware(env.JWT_SECRET, appLogger);
const httpLoggerHandler = httpLoggerMiddleware({
  enabled: env.LOG_HTTP_REQUESTS,
  verbose: env.LOG_HTTP_VERBOSE,
  toConsole: env.LOG_HTTP_TO_CONSOLE,
});

// Initialize auth feature with JWT options
const auth = initializeAuth(app, dbInstance, {
  secret: env.JWT_SECRET,
  options: {
    expiresIn: "7d",
    algorithm: "HS256",
    issuer: "codenames-app",
  },
}, appLogger);

// Initialize features
const lobby = initializeLobby(app, dbInstance, authHandlers, appLogger);
const gameplay = initializeGameplay(
  app,
  dbInstance,
  authHandlers,
  httpLoggerHandler,
  appLogger,
);

const ai = initializeAI({
  app,
  db: dbInstance,
  httpClient,
  auth: authHandlers,
  httpLogger: httpLoggerHandler,
  appLogger,
  llmConfig: {
    providerName: env.LLM_PROVIDER,
    baseURL: env.LLM_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    temperature: env.LLM_TEMPERATURE,
    maxTokens: env.LLM_NUM_CTX,
    healthCheck: {
      enabled: env.LLM_HEALTH_CHECK_ENABLED,
      throttleMs: env.LLM_HEALTH_THROTTLE_MS,
      gpuThreshold: env.LLM_HEALTH_GPU_THRESHOLD,
    },
  },
  gameplay: {
    services: {
      giveClue:  gameplay.services.giveClue,
      makeGuess: gameplay.services.makeGuess,
      endTurn:   gameplay.services.endTurn,
    },
    state: {
      loadGameAggregate: gameplay.state.loadGameAggregate,
    },
  },
});

// Initialize chat feature
const chat = initializeChat({
  app,
  db: dbInstance,
  auth: authHandlers,
  httpLogger: httpLoggerHandler,
  appLogger,
  gameplay: { state: { loadGameAggregate: gameplay.state.loadGameAggregate } },
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "UP" });
});

app.use(notFoundHandler);
app.use(errorHandler(appLogger));

// Start the server
const httpServer = createServer(app);
const PORT = env.PORT || 3000;

// Initialize WebSocket server
initializeWebSocketServer({
  httpServer,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: corsOptions.origin as string[],
  logger: appLogger,
});

httpServer.listen(PORT, () => {
  startupLogger.info(`${env.NODE_ENV} server running on port ${PORT}`);
  startupLogger.info(`WebSocket ready`);
  startupLogger.info(`AI: ${ai.state.llm.model}`);
  startupLogger.info(`Server running on port ${PORT}`);
});
