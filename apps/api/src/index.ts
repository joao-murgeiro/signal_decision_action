import Fastify from "fastify";
import { z } from "zod";
import { migrate, openDb } from "./db.js";
import { runDriftDecisions } from "./decision.js";
import { fetchLatestDailyCloseUsd } from "./stooq.js";
import { HoldingInputSchema, type DecisionStatus, type HoldingRow } from "./types.js";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.SDA_DB_PATH ?? "./sda.sqlite";

const app = Fastify({ logger: true });
const db = openDb(DB_PATH);
migrate(db);

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/holdings", async () => {
  const rows = db
    .prepare("select id, symbol, name, shares, target_weight, created_at from holdings order by symbol asc")
    .all() as HoldingRow[];
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    shares: r.shares,
    targetWeight: r.target_weight,
    createdAt: r.created_at
  }));
});

app.post("/api/holdings", async (req, reply) => {
  const input = HoldingInputSchema.parse(req.body);
  const stmt = db.prepare("insert into holdings(symbol, name, shares, target_weight) values (?, ?, ?, ?)");
  try {
    const res = stmt.run(input.symbol, input.name ?? null, input.shares, input.targetWeight);
    reply.code(201);
    return { id: Number(res.lastInsertRowid) };
  } catch (e: any) {
    if (String(e?.message ?? "").includes("holdings_symbol_unique")) {
      reply.code(409);
      return { error: "symbol_already_exists" };
    }
    throw e;
  }
});

app.put("/api/holdings/:id", async (req) => {
  const id = Number((req.params as any).id);
  const input = HoldingInputSchema.parse(req.body);
  const stmt = db.prepare("update holdings set symbol=?, name=?, shares=?, target_weight=? where id=?");
  const res = stmt.run(input.symbol, input.name ?? null, input.shares, input.targetWeight, id);
  return { updated: res.changes };
});

app.delete("/api/holdings/:id", async (req) => {
  const id = Number((req.params as any).id);
  const res = db.prepare("delete from holdings where id=?").run(id);
  return { deleted: res.changes };
});

app.post("/api/prices/refresh", async () => {
  const holdings = db.prepare("select symbol from holdings").all() as { symbol: string }[];
  const uniqueSymbols = Array.from(new Set(holdings.map((h) => h.symbol.toUpperCase()))).sort();

  const insert = db.prepare(
    "insert into prices(symbol, date, close, source) values (?, ?, ?, ?) on conflict(symbol, date) do update set close=excluded.close, source=excluded.source, ingested_at=datetime('now')"
  );

  const results: Array<{ symbol: string; ok: boolean; date?: string; close?: number; error?: string }> = [];
  for (const symbol of uniqueSymbols) {
    try {
      const { date, close } = await fetchLatestDailyCloseUsd(symbol);
      insert.run(symbol, date, close, "stooq");
      results.push({ symbol, ok: true, date, close });
    } catch (e: any) {
      results.push({ symbol, ok: false, error: String(e?.message ?? e) });
    }
  }

  return { refreshed: results.length, results };
});

app.post("/api/decisions/run", async () => {
  const res = runDriftDecisions(db);
  return res;
});

app.get("/api/decisions", async (req) => {
  const query = z
    .object({
      status: z.enum(["open", "ack", "snoozed", "dismissed", "done"]).optional()
    })
    .parse((req.query as any) ?? {});

  const where = query.status ? "where status = ?" : "";
  const stmt = db.prepare(
    `select id, decision_type, status, rationale, payload_json, created_at, updated_at from decisions ${where} order by created_at desc limit 200`
  );
  const rows = (query.status ? stmt.all(query.status) : stmt.all()) as any[];

  return rows.map((r) => ({
    id: r.id,
    decisionType: r.decision_type,
    status: r.status,
    rationale: r.rationale,
    payload: JSON.parse(r.payload_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
});

app.post("/api/decisions/:id/status", async (req) => {
  const id = Number((req.params as any).id);
  const body = z
    .object({
      status: z.enum(["open", "ack", "snoozed", "dismissed", "done"])
    })
    .parse(req.body);

  const stmt = db.prepare("update decisions set status=?, updated_at=datetime('now') where id=?");
  const res = stmt.run(body.status satisfies DecisionStatus, id);
  return { updated: res.changes };
});

app.listen({ port: PORT, host: "127.0.0.1" });

