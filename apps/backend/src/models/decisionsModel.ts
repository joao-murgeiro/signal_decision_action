import type { Db } from "../db/db.js";
import type { DecisionRow, DecisionStatus } from "../types/types.js";

// List decisions with optional status filter.
export function listDecisions(db: Db, status?: DecisionStatus): DecisionRow[] {
  const where = status ? "where status = ?" : "";
  const stmt = db.prepare(
    `select id, decision_type, status, rationale, payload_json, created_at, updated_at from decisions ${where} order by created_at desc limit 200`
  );
  return (status ? stmt.all(status) : stmt.all()) as DecisionRow[];
}

// Update a decision's status and timestamp.
export function updateDecisionStatus(db: Db, id: number, status: DecisionStatus): number {
  const stmt = db.prepare("update decisions set status=?, updated_at=datetime('now') where id=?");
  const res = stmt.run(status, id);
  return res.changes;
}

// Insert a new decision and return its id.
export function insertDecision(
  db: Db,
  decisionType: string,
  status: DecisionStatus,
  rationale: string,
  payloadJson: string
): number {
  const insertDecision = db.prepare(
    `
    insert into decisions(decision_type, status, rationale, payload_json, created_at, updated_at)
    values (?, ?, ?, ?, datetime('now'), datetime('now'))
  `
  );
  const res = insertDecision.run(decisionType, status, rationale, payloadJson);
  return Number(res.lastInsertRowid);
}

// Count open decisions for a symbol on a given close date.
export function countOpenDecisionForSymbolAndDate(db: Db, symbol: string, lastCloseDate: string): number {
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
  const row = hasOpenForSymbolAndDate.get(symbol, lastCloseDate) as { cnt: number };
  return row?.cnt ?? 0;
}
