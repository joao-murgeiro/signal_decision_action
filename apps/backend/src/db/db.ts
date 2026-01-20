import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate(db: Db) {
  db.exec(`
    create table if not exists holdings (
      id integer primary key autoincrement,
      symbol text not null,
      name text,
      shares real not null,
      target_weight real not null, -- 0..1
      created_at text not null default (datetime('now'))
    );

    create unique index if not exists holdings_symbol_unique on holdings(symbol);

    create table if not exists prices (
      symbol text not null,
      date text not null,
      close real not null,
      source text not null,
      ingested_at text not null default (datetime('now')),
      primary key(symbol, date)
    );

    create table if not exists decisions (
      id integer primary key autoincrement,
      decision_type text not null,
      status text not null, -- open|ack|snoozed|dismissed|done
      rationale text not null,
      payload_json text not null,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists settings (
      key text primary key,
      value_json text not null,
      updated_at text not null default (datetime('now'))
    );
  `);

  // defaults
  const upsert = db.prepare(
    "insert into settings(key, value_json) values (?, ?) on conflict(key) do update set value_json=excluded.value_json, updated_at=datetime('now')"
  );
  upsert.run(
    "drift_threshold",
    JSON.stringify({ pct: 0.05 }) // 5% absolute delta
  );
}
