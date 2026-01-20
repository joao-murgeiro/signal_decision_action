import type { Db } from "../db/db.js";
import * as holdingsModel from "../models/holdingsModel.js";
import * as pricesModel from "../models/pricesModel.js";
import { fetchLatestDailyCloseUsd } from "../services/stooqService.js";

// Refresh latest prices for all holdings via Stooq.
export async function refreshPrices(db: Db) {
  const symbols = holdingsModel.listHoldingSymbols(db);
  const uniqueSymbols = Array.from(new Set(symbols.map((h) => h.toUpperCase()))).sort();

  const results: Array<{ symbol: string; ok: boolean; date?: string; close?: number; error?: string }> = [];
  for (const symbol of uniqueSymbols) {
    try {
      const { date, close } = await fetchLatestDailyCloseUsd(symbol);
      pricesModel.upsertPrice(db, symbol, date, close, "stooq");
      results.push({ symbol, ok: true, date, close });
    } catch (e: any) {
      results.push({ symbol, ok: false, error: String(e?.message ?? e) });
    }
  }

  return { refreshed: results.length, results };
}
