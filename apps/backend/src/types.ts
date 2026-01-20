import { z } from "zod";

export const HoldingInputSchema = z.object({
  symbol: z.string().trim().min(1).max(12).transform((s) => s.toUpperCase()),
  name: z.string().trim().max(120).optional().nullable(),
  shares: z.number().finite().positive(),
  targetWeight: z.number().finite().min(0).max(1)
});
export type HoldingInput = z.infer<typeof HoldingInputSchema>;

export type HoldingRow = {
  id: number;
  symbol: string;
  name: string | null;
  shares: number;
  target_weight: number;
  created_at: string;
};

export type PriceRow = {
  symbol: string;
  date: string; // YYYY-MM-DD
  close: number;
  source: string;
  ingested_at: string;
};

export type DecisionStatus = "open" | "ack" | "snoozed" | "dismissed" | "done";

export type DecisionRow = {
  id: number;
  decision_type: string;
  status: DecisionStatus;
  rationale: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

