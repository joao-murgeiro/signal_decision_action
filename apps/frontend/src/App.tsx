import { useEffect, useMemo, useState } from "react";

type Holding = {
  id: number;
  symbol: string;
  label?: string | null;
  shares: number;
  targetWeight: number;
  createdAt: string;
};

type Decision = {
  id: number;
  decisionType: string;
  status: "open" | "ack" | "snoozed" | "dismissed" | "done";
  rationale: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type PriceRefreshResult = {
  symbol: string;
  ok: boolean;
  date?: string;
  close?: number;
  error?: string;
};

const statusOptions: Decision["status"][] = ["open", "ack", "snoozed", "dismissed", "done"];

export default function App() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(false);
  const [priceResults, setPriceResults] = useState<PriceRefreshResult[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<number, string>>({});

  const [form, setForm] = useState({
    symbol: "",
    label: "",
    shares: "10",
    targetPercent: "20"
  });

  const [decisionFilter, setDecisionFilter] = useState<Decision["status"] | "all">("all");

  const totals = useMemo(() => {
    const totalTarget = holdings.reduce((sum, h) => sum + (Number(h.targetWeight) || 0), 0);
    return { totalTarget };
  }, [holdings]);

  async function loadHoldings() {
    const res = await fetch("/api/holdings");
    const data = (await res.json()) as Holding[];
    setHoldings(data);
  }

  async function loadDecisions() {
    const qs = decisionFilter === "all" ? "" : `?status=${decisionFilter}`;
    const res = await fetch(`/api/decisions${qs}`);
    const data = (await res.json()) as Decision[];
    setDecisions(data);
  }

  useEffect(() => {
    void loadHoldings();
    void refreshPrices();
  }, []);

  useEffect(() => {
    void loadDecisions();
  }, [decisionFilter]);

  async function addHolding(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const symbol = form.symbol.trim().toUpperCase();
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          label: form.label || null,
          shares: Number(form.shares),
          targetWeight: Number(form.targetPercent) / 100
        })
      });
      if (!res.ok) {
        const err = await res.json();
        const message =
          err?.error === "symbol_not_allowed"
            ? "Symbol not allowed. Use a US-listed ETF ticker (e.g., SPY, VOO, IVV)."
            : err?.error === "symbol_list_unavailable"
            ? "Symbol list is temporarily unavailable. Please try again."
            : err?.error === "symbol_already_exists"
            ? "That symbol already exists in your holdings."
            : `Failed to add: ${err?.error ?? res.status}`;
        setFormError(message);
      } else {
        setForm({ symbol: "", label: "", shares: "10", targetPercent: "20" });
        await loadHoldings();
        await refreshPrices();
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteHolding(id: number) {
    if (!confirm("Delete holding?")) return;
    setLoading(true);
    try {
      await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      await loadHoldings();
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices() {
    setLoading(true);
    try {
      const res = await fetch("/api/prices/refresh", { method: "POST" });
      const data = (await res.json()) as { results: PriceRefreshResult[] };
      setPriceResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function runDecisions() {
    setLoading(true);
    try {
      await fetch("/api/decisions/run", { method: "POST" });
      await loadDecisions();
    } finally {
      setLoading(false);
    }
  }

  async function updateDecisionStatus(id: number, status: Decision["status"]) {
    setLoading(true);
    try {
      await fetch(`/api/decisions/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      await loadDecisions();
    } finally {
      setLoading(false);
    }
  }

  async function updateHoldingLabel(holding: Holding, label: string) {
    setLoading(true);
    try {
      await fetch(`/api/holdings/${holding.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: holding.symbol,
          label: label.trim() || null,
          shares: holding.shares,
          targetWeight: holding.targetWeight
        })
      });
      await loadHoldings();
      setLabelDrafts((prev) => {
        if (prev[holding.id] !== label) return prev;
        const { [holding.id]: _removed, ...rest } = prev;
        return rest;
      });
    } finally {
      setLoading(false);
    }
  }

  function saveLabelOnBlur(holding: Holding, label: string) {
    const nextLabel = label.trim();
    const currentLabel = holding.label ?? "";
    if (nextLabel === currentLabel) return;
    void updateHoldingLabel(holding, label);
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Portfolio Sentinel</h1>
          <p>US-listed equities (mostly ETFs and Stocks) MVP: Add holdings, Refresh prices, Run decisions.</p>
        </div>
        <div className="actions">
          <button onClick={() => void refreshPrices()} disabled={loading}>
            Refresh prices
          </button>
          <button onClick={() => void runDecisions()} disabled={loading}>
            Run decisions
          </button>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <h2>Holdings</h2>
          <form className="form" onSubmit={(e) => void addHolding(e)}>
            <label>
              Symbol
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="SPY"
                required
              />
            </label>
            <label>
              Label (optional)
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="S&P 500 ETF"
              />
            </label>
            <label>
              Shares
              <input
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
                type="number"
                step="0.01"
                min="0"
                required
              />
            </label>
            <label>
              Target % (0..100)
              <input
                value={form.targetPercent}
                onChange={(e) => setForm({ ...form, targetPercent: e.target.value })}
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
              />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={loading}>
                Add holding
              </button>
            </div>
            {formError && <div className="form-error">{formError}</div>}
          </form>

          <div className="meta">
            Total target %: <strong>{(totals.totalTarget * 100).toFixed(2)}</strong>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Label</th>
                <th>Shares</th>
                <th>Target %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const draftLabel = labelDrafts[h.id] ?? h.label ?? "";
                return (
                  <tr key={h.id}>
                    <td>{h.symbol}</td>
                    <td>
                      <input
                        value={draftLabel}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setLabelDrafts((prev) => ({ ...prev, [h.id]: nextValue }));
                        }}
                        onBlur={(e) => {
                          saveLabelOnBlur(h, e.target.value);
                        }}
                        placeholder="-"
                      />
                    </td>
                    <td>{h.shares}</td>
                    <td>{(h.targetWeight * 100).toFixed(2)}</td>
                    <td>
                      <button onClick={() => void deleteHolding(h.id)} disabled={loading}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    No holdings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Decision Inbox</h2>
          <div className="toolbar">
            <label>
              Filter
              <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as any)}>
                <option value="all">All</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => void loadDecisions()} disabled={loading}>
              Refresh
            </button>
          </div>

          <ul className="list">
            {decisions.map((d) => (
              <li key={d.id} className="list-item">
                <div className="list-main">
                  <div className="list-title">{d.rationale}</div>
                  <div className="list-meta">
                    <span>{d.decisionType}</span>
                    <span>Status: {d.status}</span>
                    <span>{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="list-actions">
                  {statusOptions.map((s) => (
                    <button
                      key={s}
                      onClick={() => void updateDecisionStatus(d.id, s)}
                      disabled={loading || d.status === s}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {decisions.length === 0 && <li className="empty">No decisions yet.</li>}
          </ul>
        </div>
      </section>

      {priceResults && (
        <section className="card card-spaced">
          <h2>Latest Price Refresh</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Status</th>
                <th>Close</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {priceResults.map((r) => (
                <tr key={r.symbol}>
                  <td>{r.symbol}</td>
                  <td>{r.ok ? "ok" : r.error}</td>
                  <td>{r.close?.toFixed(2) ?? "-"}</td>
                  <td>{r.date ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

