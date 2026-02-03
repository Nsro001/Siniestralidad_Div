
import { store, PrimasRecord, GastosRecord } from '../store/memoryStore';

export const getFilters = () => {
    // Clients = Intersection of Primas and Gastos clients
    const primasClients = new Set(store.primas.map(r => r.clientName));
    const gastosClients = new Set(store.gastos.map(r => r.clientName));

    console.log("[Filters] Unique Primas Clients:", Array.from(primasClients));
    console.log("[Filters] Unique Gastos Clients:", Array.from(gastosClients));

    // Intersection
    const clients = Array.from(primasClients).filter(c => gastosClients.has(c)).sort();
    console.log("[Filters] Intersected Clients:", clients);

    const coveragesByClient: Record<string, string[]> = {};
    const periodsByClient: Record<string, string[]> = {};

    clients.forEach(client => {
        const pRecs = store.primas.filter(r => r.clientName === client);
        const gRecs = store.gastos.filter(r => r.clientName === client);

        const covSet = new Set<string>();
        const perSet = new Set<string>();

        pRecs.forEach(r => { covSet.add(r.coverage); perSet.add(r.period); });
        gRecs.forEach(r => { covSet.add(r.coverageName); perSet.add(r.period); });

        coveragesByClient[client] = Array.from(covSet).sort();
        periodsByClient[client] = Array.from(perSet).sort().reverse(); // Newest first
    });

    return {
        clients,
        coveragesByClient,
        periodsByClient
    };
};

export const generatePrimasReport = (client: string, coverages: string[], periods: string[]) => {
    const isConsolidado = coverages.includes("Consolidado S+D+C");
    const targetCoverages = isConsolidado
        ? ["Salud", "Dental", "Catastrófico"]
        : coverages;

    const result: any[] = [];

    const aggregate = (name: string, covsToSum: string[]) => {
        const pRecs = store.primas.filter(r =>
            r.clientName === client &&
            periods.includes(r.period) &&
            covsToSum.includes(r.coverage)
        );

        const gRecs = store.gastos.filter(r =>
            r.clientName === client &&
            periods.includes(r.period) &&
            covsToSum.includes(r.coverageName)
        );

        const uniqueMonths = periods.sort();

        const data = uniqueMonths.map(m => {
            const pMonth = pRecs.filter(r => r.period === m);
            const gMonth = gRecs.filter(r => r.period === m);

            const totalPrima = pMonth.reduce((sum, r) => sum + r.primaUF, 0);
            const totalGasto = gMonth.reduce((sum, r) => sum + r.reembolsoUF, 0);

            return {
                month: m,
                prima: parseFloat(totalPrima.toFixed(2)),
                gasto: parseFloat(totalGasto.toFixed(2))
            };
        });

        return {
            title: name,
            data
        };
    };

    if (isConsolidado) {
        result.push(aggregate("Consolidado S+D+C", ["Salud", "Dental", "Catastrófico"]));
    }

    const standardCovs = coverages.filter(c => c !== "Consolidado S+D+C");
    standardCovs.forEach(c => {
        result.push(aggregate(c, [c]));
    });

    return result;
};

export const generateGastosReport = (client: string, coverages: string[], periods: string[]) => {
    let targetCoverages = [...coverages];
    if (targetCoverages.includes("Consolidado S+D+C")) {
        targetCoverages = targetCoverages.filter(c => c !== "Consolidado S+D+C");
        targetCoverages.push("Salud", "Dental", "Catastrófico");
    }
    targetCoverages = Array.from(new Set(targetCoverages));

    const gRecs = store.gastos.filter(r =>
        r.clientName === client &&
        periods.includes(r.period) &&
        targetCoverages.includes(r.coverageName)
    );

    const grouped: Record<string, number> = {};
    let totalTotal = 0;

    gRecs.forEach(r => {
        const desc = r.description;
        if (!grouped[desc]) grouped[desc] = 0;
        grouped[desc] += r.reembolsoUF;
        totalTotal += r.reembolsoUF;
    });

    const rows = Object.entries(grouped).map(([desc, total]) => ({
        descCober: desc,
        totalUF: parseFloat(total.toFixed(2)),
        pct: totalTotal > 0 ? parseFloat(((total / totalTotal) * 100).toFixed(2)) : 0
    })).sort((a, b) => b.totalUF - a.totalUF);

    const pieData = rows.map(r => ({
        name: `${r.descCober} (${r.pct}%)`,
        value: r.totalUF,
        valuePct: r.pct
    }));

    return {
        tableRows: rows,
        pieData
    };
};
