
import express from 'express';
import multer from 'multer';
import { store, resetStore } from './store/memoryStore';
import { parsePrimas, parseGastos } from './services/excelParser';
import { getFilters, generatePrimasReport, generateGastosReport } from './services/reportGenerator';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Reset endpoint for dev convenience or just use uploads to reset? 
// Requirement says "load 2 Excel... generate reports". 
// Usually loading new files replaces old ones? Or appends?
// "Los Excel solo sirven como FUENTE". Implies fresh load.
// We will replace data on upload.

router.post('/upload/primas', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).send("No file uploaded");
            return;
        }

        const records = parsePrimas(req.file.buffer);
        store.primas = records;

        // Update clients logic is inside getFilters() dynamically, but we could update store.clients here if we wanted cache
        // getFilters computes it on the fly, which is safer for sync.

        res.json({ message: "Primas uploaded", count: records.length });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing file");
    }
});

router.post('/upload/gastos', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).send("No file uploaded");
            return;
        }

        const records = parseGastos(req.file.buffer);
        store.gastos = records;

        res.json({ message: "Gastos uploaded", count: records.length });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error processing file");
    }
});

router.get('/filters', (req, res) => {
    try {
        const filters = getFilters();
        res.json(filters);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error getting filters");
    }
});

router.get('/report/primas', (req, res) => {
    try {
        const client = req.query.client as string;
        const coverages = (req.query.coverages as string || "").split(',');
        const periods = (req.query.periods as string || "").split(',');

        if (!client || !coverages.length || !periods.length) {
            res.status(400).send("Missing filters");
            return;
        }

        const report = generatePrimasReport(client, coverages, periods);
        res.json(report);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating report");
    }
});

router.get('/report/gastos', (req, res) => {
    try {
        const client = req.query.client as string;
        const coverages = (req.query.coverages as string || "").split(',');
        const periods = (req.query.periods as string || "").split(',');

        if (!client || !coverages.length || !periods.length) {
            res.status(400).send("Missing filters");
            return;
        }

        const report = generateGastosReport(client, coverages, periods);
        res.json(report);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating report");
    }
});

export default router;
