export type NarrativeKind='monthly'|'conclusions';
export type NarrativeMetric={id:string;label:string;value:number|null;unit:string;reference:string};
export type NarrativeAction={id:string;evidenceId:string;title:string;measure:string;deadline:string};
export type CompanyNarrative={id:string;contextHash:string;kind:NarrativeKind;source:'deterministic'|'gemini';model:string|null;periods:string[];month:string;projection:{available:boolean;currentPremiumUf:number|null;projectedPremiumUf:number|null;variationPercent:number|null;variationUf?:number|null;coverageBudgetUf?:number|null;reason:string};metrics:NarrativeMetric[];conclusion:string[];actions:NarrativeAction[];limitations:string[];fallbackReason:string|null};
export type NarrativeBundle={analysis:CompanyNarrative;gemini:{available:boolean;reason:string;remaining:number}};
