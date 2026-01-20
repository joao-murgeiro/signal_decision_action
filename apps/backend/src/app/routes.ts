import type { FastifyInstance } from "fastify";
import type { Db } from "../db/db.js";
import * as holdingsPresenter from "../presenters/holdingsPresenter.js";
import * as decisionsPresenter from "../presenters/decisionsPresenter.js";
import * as pricesPresenter from "../presenters/pricesPresenter.js";

type RouteDeps = {
  db: Db;
};

// Register HTTP routes and wire them to presenters.
export function registerRoutes(app: FastifyInstance, deps: RouteDeps) {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/holdings", async () => holdingsPresenter.listHoldings(deps.db));

  app.post("/api/holdings", async (req, reply) => {
    const res = await holdingsPresenter.createHolding(deps.db, req.body);
    reply.code(res.status);
    return res.body;
  });

  app.put("/api/holdings/:id", async (req) => {
    const id = Number((req.params as any).id);
    return holdingsPresenter.updateHolding(deps.db, id, req.body);
  });

  app.delete("/api/holdings/:id", async (req) => {
    const id = Number((req.params as any).id);
    return holdingsPresenter.deleteHolding(deps.db, id);
  });

  app.post("/api/prices/refresh", async () => {
    return pricesPresenter.refreshPrices(deps.db);
  });

  app.post("/api/decisions/run", async () => {
    return decisionsPresenter.runDecisions(deps.db);
  });

  app.get("/api/decisions", async (req) => {
    return decisionsPresenter.listDecisions(deps.db, req.query);
  });

  app.post("/api/decisions/:id/status", async (req) => {
    const id = Number((req.params as any).id);
    return decisionsPresenter.updateDecisionStatus(deps.db, id, req.body);
  });
}
