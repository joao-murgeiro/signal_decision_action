import Fastify from "fastify";
import { migrate, openDb } from "../db/db.js";
import { registerRoutes } from "./routes.js";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.SDA_DB_PATH ?? "./sda.sqlite";

export function buildServer() {
  const app = Fastify({ logger: true });
  const db = openDb(DB_PATH);
  migrate(db);

  registerRoutes(app, { db });

  return app;
}

export async function startServer() {
  const app = buildServer();
  await app.listen({ port: PORT, host: "127.0.0.1" });
}
