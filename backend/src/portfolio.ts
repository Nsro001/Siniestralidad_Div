import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows, databaseError } from "./supabase.js";
import type { PremiumRow } from "./types.js";
import type { PolicyVersion, PolicyContract } from "../../shared/portfolio.js";
import { effectivePolicies, policyState } from "./contracts.js";
import { portfolioError } from "./portfolioAdmin.js";

type PolicyOverview = Omit<PolicyVersion, "contract"> & {
  contract: Pick<
    PolicyContract,
    "number" | "insurer" | "startsOn" | "endsOn" | "status" | "cancellationDate"
  > & { coverages: Array<{ type: string }> };
};
export function summarizeClient(
  client: {
    id: string;
    name: string;
    legal_name?: string;
    portfolio_status?: string;
    kam_name?: string;
    manager_name?: string;
  },
  rows: PremiumRow[],
  today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Santiago",
  }),
  versions: PolicyOverview[] = [],
) {
  const latestPeriod = rows.reduce(
    (latest, row) => (row.period > latest ? row.period : latest),
    "",
  );
  const latest = rows.filter((row) => row.period === latestPeriod);
  const monthlyPremiumUf = latest.length
    ? latest.reduce((sum, row) => sum + row.premiumUf, 0)
    : null;
  // Titulares y cargas corresponden únicamente a Salud del último mes del cliente.
  const health = latest.filter(
    (row) => row.coverage.trim().toLocaleLowerCase() === "salud",
  );
  const insured = health.map((row) => ({
    policy: row.policy || "Sin póliza",
    coverage: row.coverage,
    holders: row.holders ?? null,
    dependents: row.dependents ?? null,
  }));
  const holders =
    health.length && health.every((row) => row.holders != null)
      ? health.reduce((sum, row) => sum + row.holders!, 0)
      : null;
  const dependents =
    health.length && health.every((row) => row.dependents != null)
      ? health.reduce((sum, row) => sum + row.dependents!, 0)
      : null;
  const firstPeriod = rows.reduce(
    (first, row) => (!first || row.period < first ? row.period : first),
    "",
  );
  const effective = effectivePolicies(versions, today);
  // Si todavía no hay versión efectiva, mostrar la próxima validada como futura.
  const next = new Map<string, PolicyOverview>();
  for (const v of versions)
    if (
      v.validation_status === "validated" &&
      v.effective_on > today &&
      !effective.some((e) => e.policy_id === v.policy_id)
    ) {
      const prior = next.get(v.policy_id);
      if (
        !prior ||
        v.effective_on < prior.effective_on ||
        (v.effective_on === prior.effective_on && v.revision > prior.revision)
      )
        next.set(v.policy_id, v);
    }
  const policies = [...effective, ...next.values()].map((v) => ({
    id: v.policy_id,
    versionId: v.id,
    number: v.contract.number,
    insurer: v.contract.insurer,
    startsOn: v.contract.startsOn,
    endsOn: v.contract.endsOn,
    coverages: v.contract.coverages.map((c) => c.type),
    state: policyState(v.contract, today),
  }));
  const active = policies.filter((p) => p.state === "active");
  const starts = active.map((p) => p.startsOn).sort();
  const renewals = [...new Set(active.map((p) => p.endsOn))].sort();
  return {
    id: client.id,
    name: client.legal_name || client.name,
    reportName: client.name,
    portfolioStatus: client.portfolio_status || "active",
    startsOn: starts.at(-1) || null,
    policies,
    policyDates: versions
      .filter((v) => v.validation_status === "validated")
      .map((v) => ({
        policyId: v.policy_id,
        revision: v.revision,
        number: v.contract.number,
        insurer: v.contract.insurer,
        startsOn: v.contract.startsOn,
        endsOn: v.contract.endsOn,
        changeType: v.change_type,
      })),
    kam: client.kam_name || "Sin KAM",
    manager: client.manager_name || "Sin jefe",
    latestPeriod: latestPeriod || null,
    monthlyPremiumUf,
    annualPremiumUf: monthlyPremiumUf === null ? null : monthlyPremiumUf * 12,
    insured,
    holders,
    dependents,
    firstPeriod: firstPeriod || null,
    renewals,
  };
}

export async function getPortfolio(db: SupabaseClient) {
  const clients = await allRows(
    db,
    "clients",
    "id,name,legal_name,portfolio_status,kam_name,manager_name",
    "id",
    portfolioError,
  );
  const datasets = new Map<string, PremiumRow[]>();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from("client_datasets")
      .select("client_id,rows")
      .eq("kind", "primas")
      .order("client_id")
      .range(offset, offset + 99);
    databaseError(error);
    for (const dataset of data ?? [])
      datasets.set(dataset.client_id, dataset.rows as PremiumRow[]);
    if (!data || data.length < 100) break;
  }
  const versions: PolicyOverview[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from("portfolio_policy_overview")
      .select("*")
      .order("id")
      .range(offset, offset + 99);
    portfolioError(error);
    versions.push(...(data ?? []));
    if (!data || data.length < 100) break;
  }
  return {
    clients: clients
      .map((client) =>
        summarizeClient(
          {
            id: client.id,
            name: client.name,
            legal_name: client.legal_name,
            portfolio_status: client.portfolio_status,
            kam_name: client.kam_name,
            manager_name: client.manager_name,
          },
          datasets.get(client.id) ?? [],
          undefined,
          versions.filter((v) => v.client_id === client.id),
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
