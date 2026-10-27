import type { ReactNode } from "react";

export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return <section className="ng-stat"><p className="ng-stat-label">{label}</p><strong className="ng-stat-value">{value}</strong><p className="ng-stat-detail">{detail}</p></section>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="ng-page-heading"><div><p className="account-eyebrow">{eyebrow}</p><h1 className="font-display">{title}</h1><p className="account-muted">{description}</p></div>{actions}</div>;
}
