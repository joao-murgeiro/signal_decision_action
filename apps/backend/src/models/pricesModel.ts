import type { Db } from "../db/db.js";

export type LatestPrice = { symbol: string; date: string; close: number };

// Fetch the most recent close for each symbol.
export function listLatestPrices(db: Db): LatestPrice[] {
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
  return latestPriceStmt.all() as LatestPrice[];
}

// Insert or update a price row for a symbol/date.
export function upsertPrice(db: Db, symbol: string, date: string, close: number, source: string) {
  const insert = db.prepare(
    "insert into prices(symbol, date, close, source) values (?, ?, ?, ?) on conflict(symbol, date) do update set close=excluded.close, source=excluded.source, ingested_at=datetime('now')"
  );
  insert.run(symbol, date, close, source);
}
