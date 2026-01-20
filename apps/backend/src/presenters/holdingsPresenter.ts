import type { Db } from "../db/db.js";
import { HoldingInputSchema } from "../types/types.js";
import * as holdingsModel from "../models/holdingsModel.js";
import { assertSymbolAllowed } from "../services/etfSymbolService.js";

export function listHoldings(db: Db) {
  const rows = holdingsModel.listHoldings(db);
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    shares: r.shares,
    targetWeight: r.target_weight,
    createdAt: r.created_at
  }));
}

export async function createHolding(
  db: Db,
  body: unknown
): Promise<{ status: number; body: { id: number } | { error: string } }> {
  const input = HoldingInputSchema.parse(body);
  const validation = await assertSymbolAllowed(input.symbol);
  if (!validation.ok) {
    return { status: 422, body: { error: validation.reason ?? "symbol_not_allowed" } };
  }
  try {
    const id = holdingsModel.createHolding(db, input);
    return { status: 201, body: { id } };
  } catch (e: any) {
    const message = String(e?.message ?? "");
    const isUniqueConflict =
      message.includes("holdings_symbol_unique") || message.includes("UNIQUE constraint failed: holdings.symbol");
    if (isUniqueConflict) {
      const changes = holdingsModel.incrementHolding(db, input.symbol, input.shares, input.targetWeight, input.name ?? null);
      if (changes > 0) {
        const id = holdingsModel.getHoldingIdBySymbol(db, input.symbol);
        return { status: 200, body: { id: id ?? 0 } };
      }
      return { status: 409, body: { error: "symbol_already_exists" } };
    }
    throw e;
  }
}

export function updateHolding(db: Db, id: number, body: unknown) {
  const input = HoldingInputSchema.parse(body);
  const updated = holdingsModel.updateHolding(db, id, input);
  return { updated };
}

export function deleteHolding(db: Db, id: number) {
  const deleted = holdingsModel.deleteHolding(db, id);
  return { deleted };
}
