export type ReportBranding = { broker_name: string; broker_logo: string | null; client_logo: string | null; kam_name: string };
export type ExecutiveConclusion = { month: number | null; validityStart: string | null; notes: string[]; sections: Array<{ title: string; text: string }> };
