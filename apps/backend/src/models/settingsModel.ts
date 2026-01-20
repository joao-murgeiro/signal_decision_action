import type { Db } from "../db/db.js";

// Read and validate the drift threshold setting.
export function getDriftThreshold(db: Db): number {
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
