const SYMBOL_LIST_URLS = [
  "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
  "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
];

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

type SymbolCache = {
  fetchedAt: number;
  symbols: Set<string>;
};

let cache: SymbolCache | null = null;
let inFlight: Promise<Set<string>> | null = null;

function parseSymbols(text: string): Set<string> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return new Set();

  const header = lines[0].split("|").map((h) => h.trim().toLowerCase());
  const symbolIndex = header.indexOf("symbol") !== -1 ? header.indexOf("symbol") : header.indexOf("act symbol");
  const etfIndex = header.indexOf("etf");
  const testIndex = header.indexOf("test issue");

  if (symbolIndex === -1 || etfIndex === -1) return new Set();

  const symbols: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith("File Creation Time")) continue;
    const parts = line.split("|");
    if (parts.length <= Math.max(symbolIndex, etfIndex, testIndex)) continue;
    if (testIndex !== -1 && parts[testIndex] === "Y") continue;
    if (parts[etfIndex] !== "Y") continue;
    const symbol = (parts[symbolIndex] ?? "").trim();
    if (symbol) symbols.push(symbol.toUpperCase());
  }

  return new Set(symbols);
}

async function fetchSymbols(): Promise<Set<string>> {
  const responses = await Promise.all(
    SYMBOL_LIST_URLS.map(async (url) => {
      const res = await fetch(url, { headers: { "user-agent": "sda-platform/0.1" } });
      if (!res.ok) throw new Error(`symbol_list_http_${res.status}`);
      return res.text();
    })
  );

  const merged = new Set<string>();
  for (const text of responses) {
    for (const symbol of parseSymbols(text)) merged.add(symbol);
  }
  return merged;
}

async function loadSymbols(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.symbols;
  if (inFlight) return inFlight;

  inFlight = fetchSymbols()
    .then((symbols) => {
      cache = { fetchedAt: Date.now(), symbols };
      return symbols;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function assertSymbolAllowed(symbol: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const symbols = await loadSymbols();
    if (!symbols.has(symbol.toUpperCase())) {
      return { ok: false, reason: "symbol_not_allowed" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "symbol_list_unavailable" };
  }
}
