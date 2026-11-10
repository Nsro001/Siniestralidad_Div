import type { PortfolioClient } from "../types";
export type PortfolioFilters = {
  kam: string;
  search: string;
  insurer: string;
  coverage: string;
  status: string;
  sort: string;
  ascending: boolean;
};
export function selectPortfolioClients(
  clients: PortfolioClient[],
  f: PortfolioFilters,
) {
  return clients
    .filter(
      (c) =>
        (!f.kam || c.kam === f.kam) &&
        c.name.toLocaleLowerCase().includes(f.search.toLocaleLowerCase()) &&
        ((!f.insurer && !f.coverage && !f.status) ||
          (f.status === "no_policy"
            ? !c.policies.length && !f.insurer && !f.coverage
            : c.policies.some(
                (p) =>
                  (!f.insurer || p.insurer === f.insurer) &&
                  (!f.coverage || p.coverages.includes(f.coverage)) &&
                  (!f.status || p.state === f.status),
              ))),
    )
    .sort((a, b) => {
      const av =
        f.sort === "date"
          ? a.startsOn
          : f.sort === "premium"
            ? a.monthlyPremiumUf
            : f.sort === "kam"
              ? a.kam
              : a.name;
      const bv =
        f.sort === "date"
          ? b.startsOn
          : f.sort === "premium"
            ? b.monthlyPremiumUf
            : f.sort === "kam"
              ? b.kam
              : b.name;
      if (av === null || bv === null)
        return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1;
      const result =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "es");
      return (f.ascending ? result : -result) || a.id.localeCompare(b.id);
    });
}
