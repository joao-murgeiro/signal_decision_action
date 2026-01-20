import { z } from "zod";

// Minimal CSV row shape we care about from Stooq's daily endpoint.
// The actual CSV can contain more columns, but we only read Date + Close.
type StooqRow = {
  Date: string;
  Close: string;
};

// Validate the parsed CSV structure to avoid surprising runtime shapes.
const CsvResponseSchema = z.object({
  header: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string()))
});

// Very small CSV parser for Stooq's simple, comma-separated format.
// We trim lines, split the header, then map each line to a key/value record.
function parseCsv(csv: string): { header: string[]; rows: Record<string, string>[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { header: [], rows: [] };

  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = (cols[i] ?? "").trim();
    });
    return rec;
  });
  return CsvResponseSchema.parse({ header, rows });
}

export async function fetchLatestDailyCloseUsd(symbolUpper: string): Promise<{ date: string; close: number }> {
  // Stooq uses lower-case symbol + .us for US tickers (ETFs included)
  const stooqSymbol = `${symbolUpper.toLowerCase()}.us`;
  // f=sd2c => Symbol,Date,Close; h= header; e=csv
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2c&h&e=csv`;

  // Fetch the CSV for the most recent daily close.
  const res = await fetch(url, { headers: { "user-agent": "sda-platform/0.1" } });
  if (!res.ok) throw new Error(`stooq_http_${res.status}`);
  const csv = await res.text();

  const { rows } = parseCsv(csv);
  // expected columns: Symbol,Date,Close (but we only request s d2 c)
  const last = rows.at(-1);
  if (!last) throw new Error("stooq_empty");

  // stooq uses "Date" and "Close" sometimes; with f=sd2c it is "Symbol,Date,Close"
  // Stooq sometimes varies capitalization; accept both.
  const date = last["Date"] ?? last["date"];
  const closeStr = last["Close"] ?? last["close"];
  if (!date || !closeStr) throw new Error("stooq_bad_csv");
  const close = Number(closeStr);
  if (!Number.isFinite(close) || close <= 0) throw new Error("stooq_bad_close");

  return { date, close };
}
