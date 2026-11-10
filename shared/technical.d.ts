import type { ExpenseBasis, QualityStatus } from './technicalReview';
export type ScopeQuery={premiumSnapshotId:string;expenseSnapshotId:string;periods:string;coverages:string};
export type QualityCell={coverage:string;qualityStatus:QualityStatus;expenseBasis:ExpenseBasis;completenessConfirmed:boolean;reconciliation:string;differenceUf:number|null};
export type MetricTotals={premiumUf:number|null;technicalSpendUf:number|null;lossRatio:number|null;reimbursementUf:number|null;differenceUf:number|null;excludedNetUf:number|null};
export type PolicyIndicators={reviewStorageAvailable:boolean;scope:{monthly:Array<{period:string;complete:boolean;coverages:QualityCell[]}>;
  quality:{issueCounts:Record<string,number>;issues:Array<{rowIndex:number;reason:string;unallocatedPercent:number}>}};
  monthly:Array<{period:string;referencePeriod:string;referenceOutsideSelection:boolean;status:string;current:MetricTotals;previous:MetricTotals;
    comparison:{lossRatioDeltaPp:number|null;spendEffectPp:number|null;premiumEffectPp:number|null;lossRatioVariationPercent:number|null};
    attribution:{available:boolean};warnings:string[];coverages:Array<{type:string;name:string;previousExpenseBasis?:ExpenseBasis;currentSpendUf:number|null;previousSpendUf:number|null;differenceUf:number|null;
      variationPercent:number|null;shareOfTechnicalSpendPercent:number|null;contributionTotalPp:number|null}>}>};
export type RenewalResults={reviewStorageAvailable:boolean;notice:string;blockedReasons:string[];scenarios:Array<{status:string;reasons:string[];result:null|{
  direction:'increase'|'maintenance'|'discount';adjustmentPercent:number;requiredPremiumUf:number;projectedSpendUf:number}}>};
