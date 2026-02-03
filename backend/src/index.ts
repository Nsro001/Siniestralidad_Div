import cors from "cors";
import express from "express";
import multer from "multer";
import { parseExpenses, parsePremiums } from "./parser.js";
import { buildFilters, buildGastosReport, buildPrimasReport } from "./report.js";
import { dataStore } from "./storage.js";

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.post("/upload/primas", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Archivo de primas requerido." });
  }
  try {
    const rows = parsePremiums(file.buffer);
    dataStore.replacePremiums(rows);
    return res.json({ status: "ok", rows: rows.length });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/upload/gastos", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Archivo de gastos requerido." });
  }
  try {
    const rows = parseExpenses(file.buffer);
    dataStore.replaceExpenses(rows);
    return res.json({ status: "ok", rows: rows.length });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

app.get("/filters", (_req, res) => {
  const filters = buildFilters(dataStore.getPremiums(), dataStore.getExpenses());
  res.json(filters);
});

app.get("/report/primas", (req, res) => {
  const client = String(req.query.client ?? "");
  if (!client) {
    return res.status(400).json({ error: "client requerido." });
  }
  const coverages = String(req.query.coverages ?? "");
  const periods = String(req.query.periods ?? "");
  const report = buildPrimasReport(dataStore.getPremiums(), client, coverages, periods);
  res.json({ series: report });
});

app.get("/report/gastos", (req, res) => {
  const client = String(req.query.client ?? "");
  if (!client) {
    return res.status(400).json({ error: "client requerido." });
  }
  const coverages = String(req.query.coverages ?? "");
  const periods = String(req.query.periods ?? "");
  const report = buildGastosReport(dataStore.getExpenses(), client, coverages, periods);
  res.json(report);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
