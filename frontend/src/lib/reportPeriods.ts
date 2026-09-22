const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const formatReportMonth = (period: string) => {
  const [year, month] = period.split("-");
  return `${monthNames[Number(month) - 1] ?? month} ${year}`;
};
export const formatReportPeriods = (periods: string[]) => {
  const sorted = [...new Set(periods)].sort();
  if (!sorted.length) return "Sin períodos";
  const monthIndex = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7));
  const continuous = sorted.every((period, i) => i === 0 || monthIndex(period) === monthIndex(sorted[i - 1]) + 1);
  return continuous && sorted.length > 1
    ? `${formatReportMonth(sorted[0])} – ${formatReportMonth(sorted[sorted.length - 1])}`
    : sorted.map(formatReportMonth).join(", ");
};
