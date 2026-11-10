export type PolicyAnalysis = {
  status:'available'|'blocked'; kind:'monthly'|'conclusions'; source:'deterministic'|'simulated'|'real'; persisted:boolean;
  reason:string|null; checkedAt:string; expiresAt:string|null;
  scope:{clientId:string;clientName:string;policyId:string;number:string;insurer:string;periods:string[];coverages:string[];versions:string[];premiumSnapshotId:string;expenseSnapshotId:string};
  contextHash:string|null;
  sections:Array<{title:string;text:string;references:string[]}>;
  quality:Array<{period:string;coverage:string;status:string;expenseBasis:string;reconciliation:string}>;
};
