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
