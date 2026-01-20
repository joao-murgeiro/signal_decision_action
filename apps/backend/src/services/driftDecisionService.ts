import type { Db } from "../db/db.js";
import type { DecisionStatus, HoldingRow } from "../types/types.js";
import * as holdingsModel from "../models/holdingsModel.js";
import * as pricesModel from "../models/pricesModel.js";
import * as decisionsModel from "../models/decisionsModel.js";
import * as settingsModel from "../models/settingsModel.js";

type DriftDecision = {
  symbol: string;
  targetWeight: number;
  currentWeight: number;
  delta: number; // current - target
  shares: number;
  lastClose: number;
  lastCloseDate: string;
  marketValue: number;
  portfolioValue: number;
};

// Evaluate portfolio drift and create decision records.
export function runDriftDecisions(db: Db): { created: number; evaluated: number } {
  const holdings = holdingsModel.listHoldings(db);
  if (holdings.length === 0) return { created: 0, evaluated: 0 };

  const threshold = settingsModel.getDriftThreshold(db); // abs delta

  const latest = pricesModel.listLatestPrices(db);
  const priceBySymbol = new Map(latest.map((r) => [r.symbol.toUpperCase(), r]));

  const valued = holdings
    .map((h) => {
      const p = priceBySymbol.get(h.symbol.toUpperCase());
      if (!p) return null;
      const marketValue = h.shares * p.close;
      return { holding: h, price: p, marketValue };
    })
    .filter(Boolean) as {
    holding: HoldingRow;
    price: { symbol: string; date: string; close: number };
    marketValue: number;
  }[];

  const portfolioValue = valued.reduce((sum, v) => sum + v.marketValue, 0);
  if (portfolioValue <= 0) return { created: 0, evaluated: valued.length };

  let created = 0;
  for (const v of valued) {
    const currentWeight = v.marketValue / portfolioValue;
    const targetWeight = v.holding.target_weight;
    const delta = currentWeight - targetWeight;
    if (Math.abs(delta) < threshold) continue;

    const already = decisionsModel.countOpenDecisionForSymbolAndDate(db, v.holding.symbol, v.price.date);
    if (already > 0) continue;

    const payload: DriftDecision = {
      symbol: v.holding.symbol,
      targetWeight,
      currentWeight,
      delta,
      shares: v.holding.shares,
      lastClose: v.price.close,
      lastCloseDate: v.price.date,
      marketValue: v.marketValue,
      portfolioValue
    };

    const direction = delta > 0 ? "overweight" : "underweight";
    const rationale = `${v.holding.symbol} is ${direction} by ${(Math.abs(delta) * 100).toFixed(2)}% vs target.`;
    decisionsModel.insertDecision(db, "portfolio.drift", "open" satisfies DecisionStatus, rationale, JSON.stringify(payload));
    created += 1;
  }

  return { created, evaluated: valued.length };
}
