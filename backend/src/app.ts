import cors from "cors";
import { buildMonthlyDetail } from "./monthly.js";
import { getPortfolio } from "./portfolio.js";
import express, { type RequestHandler, type ErrorRequestHandler } from "express";
import multer from "multer";
import { parseUpload } from "./parser.js";
import { buildGastosReport, buildPrimasReport } from "./report.js";
import { getClient, getRows, getFilters, saveRows } from "./storage.js";
import { authenticate, adminAuthClient, allRows, databaseError, HttpError, requireAdmin } from "./supabase.js";
import type { ExpenseRow, PremiumRow } from "./types.js";

const asyncRoute = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
const adminOnly: RequestHandler = (_req, res, next) => {
  try { requireAdmin(res.locals.auth.profile); next(); } catch (error) { next(error); }
};

export function createApp(verifySession = authenticate) {
  const app = express();
  const upload = multer({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  const CONSOLIDATED = "Consolidado S+D+C";
  const CONSOLIDATED_SET = new Set(["Salud", "Dental", "Catastrófico"]);

  app.disable("x-powered-by");
  app.use(cors({ origin: (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173").split(",").map(value => value.trim()) }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use(asyncRoute(async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "");
    if (!match) throw new HttpError(401, "Inicia sesión para continuar.");
    res.locals.auth = await verifySession(match[1]);
    next();
  }));
  app.use(express.json({ limit: "5mb" }));

  app.post("/upload/primas", adminOnly, upload.single("file"), asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Archivo de primas requerido." });
    try {
      const rows = await parseUpload(file.buffer, "primas");
      await saveRows(res.locals.auth.db, "primas", rows, req.body?.mode === "replace");
      return res.json({ status: "ok", rows: rows.length });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return res.status(400).json({ error: "No se pudo leer el Excel. Revisa su formato y columnas." });
    }
  }));

  app.post("/upload/gastos", adminOnly, upload.single("file"), asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Archivo de gastos requerido." });
    try {
      const rows = await parseUpload(file.buffer, "gastos");
      await saveRows(res.locals.auth.db, "gastos", rows, req.body?.mode === "replace");
      return res.json({ status: "ok", rows: rows.length });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return res.status(400).json({ error: "No se pudo leer el Excel. Revisa su formato y columnas." });
    }
  }));

  app.get("/portfolio", asyncRoute(async (_req, res) => {
    res.json(await getPortfolio(res.locals.auth.db));
  }));

  app.get("/filters", asyncRoute(async (_req, res) => {
    const filters = await getFilters(res.locals.auth.db);
    res.json(filters);
  }));

  app.get("/report/monthly", asyncRoute(async (req, res) => {
    const client = String(req.query.client ?? "");
    const allowedClient = await getClient(res.locals.auth.db, client);
    const period = String(req.query.period ?? "");
    const coverage = String(req.query.coverage ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !coverage || coverage.length > 120) throw new HttpError(400, "Selecciona un mes y una cobertura válidos.");
    const [premiums, expenses] = await Promise.all([
      getRows<PremiumRow>(res.locals.auth.db, allowedClient.id, "primas"),
      getRows<ExpenseRow>(res.locals.auth.db, allowedClient.id, "gastos"),
    ]);
    res.json(buildMonthlyDetail(premiums, expenses, client, coverage, period));
  }));

  app.get("/report/primas", asyncRoute(async (req, res) => {
    const client = String(req.query.client ?? "");
    const allowedClient = await getClient(res.locals.auth.db, client);
    const coverages = String(req.query.coverages ?? "");
    const periods = String(req.query.periods ?? "");
    const report = buildPrimasReport(await getRows<PremiumRow>(res.locals.auth.db, allowedClient.id, "primas"), client, coverages, periods);
    res.json({ series: report });
  }));

  app.get("/report/gastos", asyncRoute(async (req, res) => {
    const client = String(req.query.client ?? "");
    const allowedClient = await getClient(res.locals.auth.db, client);
    const coverages = String(req.query.coverages ?? "");
    const periods = String(req.query.periods ?? "");
    const report = buildGastosReport(await getRows<ExpenseRow>(res.locals.auth.db, allowedClient.id, "gastos"), client, coverages, periods);
    res.json(report);
  }));

  app.get("/report/claimants", asyncRoute(async (req, res) => {
    const client = String(req.query.client ?? "");
    const allowedClient = await getClient(res.locals.auth.db, client);

    const selectedPeriods = String(req.query.periods ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const selectedCoverages = String(req.query.coverages ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const coverageSet = new Set<string>();
    for (const coverage of selectedCoverages) {
      if (coverage === CONSOLIDATED) CONSOLIDATED_SET.forEach((item) => coverageSet.add(item));
      else coverageSet.add(coverage);
    }

    const titulars = new Set<string>();
    const dependents = new Set<string>();

    for (const row of await getRows<ExpenseRow>(res.locals.auth.db, allowedClient.id, "gastos")) {
      if (row.clientName !== client) continue;
      if (selectedPeriods.length > 0 && !selectedPeriods.includes(row.period)) continue;
      if (coverageSet.size > 0 && !coverageSet.has(row.coverage)) continue;
      if (!row.patientRut || row.patientRut === "(Sin rut paciente)") continue;

      if (row.relation === "T") titulars.add(row.patientRut);
      else dependents.add(row.patientRut);
    }

    res.json({
      titularClaimants: titulars.size,
      dependentClaimants: dependents.size,
      source: "gastos",
    });
  }));


  app.get("/me", (_req, res) => res.json(res.locals.auth.profile));
  app.get("/admin/users", adminOnly, asyncRoute(async (_req, res) => {
    const db = res.locals.auth.db;
    const [users, clients, assignments] = await Promise.all([
      allRows(db, "profiles", "id,email,full_name,role,active,portfolio_name", "id"),
      allRows(db, "clients", "id,name,kam_name,manager_name", "id"),
      allRows(db, "client_assignments", "user_id,client_id", "user_id,client_id"),
    ]);
    res.json({ users, clients, assignments });
  }));
  app.post("/admin/users", adminOnly, asyncRoute(async (req, res) => {
    const { email, password, full_name } = req.body ?? {};
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof full_name !== "string" || !full_name.trim() || full_name.trim().length > 120 ||
        typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new HttpError(400, "Completa nombre, correo válido y contraseña de 12 a 128 caracteres.");
    }
    const { data, error } = await adminAuthClient().auth.admin.createUser({
      email: email.trim().toLowerCase(), password, email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });
    if (error || !data.user) throw new HttpError(400, "No se pudo crear la cuenta. Revisa si el correo ya existe y la política de contraseñas.");
    res.status(201).json({ id: data.user.id });
  }));
  app.put("/admin/users/:id", adminOnly, asyncRoute(async (req, res) => {
    const { full_name, active, client_ids, role, portfolio_name } = req.body ?? {};
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!["executive", "manager"].includes(role) || typeof portfolio_name !== "string" || portfolio_name.length > 120 ||
        !uuid.test(req.params.id) || typeof full_name !== "string" || !full_name.trim() || full_name.trim().length > 120 ||
        typeof active !== "boolean" || !Array.isArray(client_ids) || client_ids.length > 10000 ||
        !client_ids.every((id: unknown) => typeof id === "string" && uuid.test(id))) {
      throw new HttpError(400, "Los datos del ejecutivo o sus clientes no son válidos.");
    }
    const { error } = await res.locals.auth.db.rpc("manage_portfolio_account", {
      target_user: req.params.id, display_name: full_name.trim(), enabled: active, assigned_clients: [...new Set(client_ids)],
      account_role: role, source_name: portfolio_name,
    });
    if (error?.code === "23505") throw new HttpError(400, "Ese nombre de cartera ya está vinculado a otra cuenta del mismo rol.");
    if (error?.code === "P0001") throw new HttpError(400, "Revisa que el ejecutivo y los clientes seleccionados existan.");
    databaseError(error);
    res.json({ status: "ok" });
  }));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: "Carga un único archivo Excel de hasta 10 MB." });
    if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Solicitud inválida." });
    if (error?.type === "entity.too.large") return res.status(413).json({ error: "La solicitud supera el tamaño permitido." });
    res.status(500).json({ error: "No se pudo completar la operación. Intenta nuevamente." });
  };
  app.use(handleError);
  return app;
}
