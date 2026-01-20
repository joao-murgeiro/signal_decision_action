import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

export type Db = Database.Database;

// Open a SQLite connection with WAL + FK enforcement.
export function openDb(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// Apply schema and seed default settings.
export function migrate(db: Db) {
  const schemaSql = readFileSync(
    new URL("../../sql/schema.sql", import.meta.url),
    "utf8"
  );
  db.exec(schemaSql);

  // defaults
  const upsert = db.prepare(
    "insert into settings(key, value_json) values (?, ?) on conflict(key) do update set value_json=excluded.value_json, updated_at=datetime('now')"
  );
  upsert.run(
    "drift_threshold",
    JSON.stringify({ pct: 0.05 }) // 5% absolute delta
  );
}
