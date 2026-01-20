import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate, openDb } from "../db/db.js";
import { registerRoutes } from "./routes.js";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.SDA_DB_PATH ?? "./sql/sda.sqlite";

// Build the Fastify app and register routes.
export function buildServer() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const app = Fastify({ logger: true });
  const db = openDb(DB_PATH);
  migrate(db);

  registerRoutes(app, { db });

  return app;
}

// Start the HTTP server on the configured port.
export async function startServer() {
  const app = buildServer();
  await app.listen({ port: PORT, host: "127.0.0.1" });
}
