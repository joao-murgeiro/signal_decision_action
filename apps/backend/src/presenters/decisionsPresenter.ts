import { z } from "zod";
import type { Db } from "../db/db.js";
import type { DecisionStatus } from "../types/types.js";
import * as decisionsModel from "../models/decisionsModel.js";
import { runDriftDecisions } from "../services/driftDecisionService.js";

const DecisionStatusSchema = z.enum(["open", "ack", "snoozed", "dismissed", "done"]);

// List decisions with optional status filter.
export function listDecisions(db: Db, query: unknown) {
  const parsed = z
    .object({
      status: DecisionStatusSchema.optional()
    })
    .parse((query as any) ?? {});

  const rows = decisionsModel.listDecisions(db, parsed.status);
  return rows.map((r) => ({
    id: r.id,
    decisionType: r.decision_type,
    status: r.status,
    rationale: r.rationale,
    payload: JSON.parse(r.payload_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

// Validate status input and update a decision row.
export function updateDecisionStatus(db: Db, id: number, body: unknown) {
  const parsed = z
    .object({
      status: DecisionStatusSchema
    })
    .parse(body);

  const updated = decisionsModel.updateDecisionStatus(db, id, parsed.status satisfies DecisionStatus);
  return { updated };
}

// Run drift decision logic and return summary.
export function runDecisions(db: Db) {
  return runDriftDecisions(db);
}
