import type { Db } from "./db.js";
import type { DecisionStatus, HoldingRow } from "./types.js";

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

export function runDriftDecisions(db: Db): { created: number; evaluated: number } {
  const holdings = db
    .prepare(
      `
      select id, symbol, name, shares, target_weight, created_at
      from holdings
      order by symbol asc
    `
    )
    .all() as HoldingRow[];

  if (holdings.length === 0) return { created: 0, evaluated: 0 };

  const threshold = getDriftThreshold(db); // abs delta

  // latest prices per symbol
  const latestPriceStmt = db.prepare(
    `
    select p.symbol, p.date, p.close
    from prices p
    join (
      select symbol, max(date) as max_date
      from prices
      group by symbol
    ) lp on lp.symbol = p.symbol and lp.max_date = p.date
  `
  );
  const latest = latestPriceStmt.all() as { symbol: string; date: string; close: number }[];
  const priceBySymbol = new Map(latest.map((r) => [r.symbol.toUpperCase(), r]));

  const valued = holdings
    .map((h) => {
      const p = priceBySymbol.get(h.symbol.toUpperCase());
      if (!p) return null;
      const marketValue = h.shares * p.close;
      return { holding: h, price: p, marketValue };
    })
    .filter(Boolean) as { holding: HoldingRow; price: { symbol: string; date: string; close: number }; marketValue: number }[];

  const portfolioValue = valued.reduce((sum, v) => sum + v.marketValue, 0);
  if (portfolioValue <= 0) return { created: 0, evaluated: valued.length };

  const insertDecision = db.prepare(
    `
    insert into decisions(decision_type, status, rationale, payload_json, created_at, updated_at)
    values (?, ?, ?, ?, datetime('now'), datetime('now'))
  `
  );

  // idempotency-ish: don't create the same open decision repeatedly within the same close date
  const hasOpenForSymbolAndDate = db.prepare(
    `
    select count(1) as cnt
    from decisions
    where decision_type = 'portfolio.drift'
      and status in ('open','ack','snoozed')
      and json_extract(payload_json, '$.symbol') = ?
      and json_extract(payload_json, '$.lastCloseDate') = ?
  `
  );

  let created = 0;
  for (const v of valued) {
    const currentWeight = v.marketValue / portfolioValue;
    const targetWeight = v.holding.target_weight;
    const delta = currentWeight - targetWeight;
    if (Math.abs(delta) < threshold) continue;

    const already = (hasOpenForSymbolAndDate.get(v.holding.symbol, v.price.date) as { cnt: number }).cnt;
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
    insertDecision.run("portfolio.drift", "open" satisfies DecisionStatus, rationale, JSON.stringify(payload));
    created += 1;
  }

  return { created, evaluated: valued.length };
}

function getDriftThreshold(db: Db): number {
  const row = db.prepare("select value_json from settings where key = ?").get("drift_threshold") as
    | { value_json: string }
    | undefined;
  if (!row) return 0.05;
  try {
    const parsed = JSON.parse(row.value_json) as { pct?: unknown };
    const pct = Number(parsed.pct);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 1) return pct;
  } catch {
    // ignore
  }
  return 0.05;
}

