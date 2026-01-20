import type { Db } from "../db/db.js";
import type { HoldingInput, HoldingRow } from "../types/types.js";

// Fetch all holdings ordered by symbol.
export function listHoldings(db: Db): HoldingRow[] {
  return db
    .prepare("select id, symbol, name, shares, target_weight, created_at from holdings order by symbol asc")
    .all() as HoldingRow[];
}

// List just the symbols for holdings.
export function listHoldingSymbols(db: Db): string[] {
  const rows = db.prepare("select symbol from holdings").all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

// Insert a new holding and return its id.
export function createHolding(db: Db, input: HoldingInput): number {
  const stmt = db.prepare("insert into holdings(symbol, name, shares, target_weight) values (?, ?, ?, ?)");
  const res = stmt.run(input.symbol, input.label ?? null, input.shares, input.targetWeight);
  return Number(res.lastInsertRowid);
}

// Look up an existing holding id by symbol.
export function getHoldingIdBySymbol(db: Db, symbol: string): number | null {
  const row = db.prepare("select id from holdings where symbol = ?").get(symbol) as { id: number } | undefined;
  return row?.id ?? null;
}

// Increment shares and update weight/name for an existing holding.
export function incrementHolding(
  db: Db,
  symbol: string,
  sharesToAdd: number,
  targetWeight: number,
  label: string | null
): number {
  const stmt = db.prepare(
    "update holdings set shares = shares + ?, target_weight = ?, name = coalesce(?, name) where symbol = ?"
  );
  const res = stmt.run(sharesToAdd, targetWeight, label, symbol);
  return res.changes;
}

// Update a holding row by id.
export function updateHolding(db: Db, id: number, input: HoldingInput): number {
  const stmt = db.prepare("update holdings set symbol=?, name=?, shares=?, target_weight=? where id=?");
  const res = stmt.run(input.symbol, input.label ?? null, input.shares, input.targetWeight, id);
  return res.changes;
}

// Delete a holding row by id.
export function deleteHolding(db: Db, id: number): number {
  const res = db.prepare("delete from holdings where id=?").run(id);
  return res.changes;
}
