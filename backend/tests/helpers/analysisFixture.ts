import { verifiedReviews } from './technicalReviews.js';
import type { ScopeInput } from '../../src/policyScope.js';
import type { PolicyVersion, PolicyContract } from '../../../shared/portfolio.js';
import type { ExpenseRow, PremiumRow } from '../../src/types.js';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function rut(body: number) {
  let sum = 0, factor = 2;
  for (const digit of String(body).split('').reverse()) { sum += Number(digit)*factor; factor = factor === 7 ? 2 : factor+1; }
  const dv = 11-sum%11; return `${body}-${dv === 11 ? '0' : dv === 10 ? 'K' : dv}`;
}
export function fixture(count=10): ScopeInput {
  const client = { id: id(11), name: 'EMPRESA_PRIVADA' };
  const policy = { id: id(21), client_id: client.id, number_key: 'poliza-privada', insurer_key: 'aseguradora-privada' };
  const contract = { number: policy.number_key, insurer: policy.insurer_key, startsOn: '2026-01-01', endsOn: '2026-12-31', currency: 'UF', status: 'active', cancellationDate: '',
    coverages: [{ id: id(41), type: 'Salud', name: 'NOMBRE_PRIVADO', plans: [] }], evidence: { diagnostic: 'DOCUMENTO_PRIVADO' } } as unknown as PolicyContract;
  const p: PremiumRow[] = ['2026-01','2026-02'].map(period => ({ clientName: client.name, policy: policy.number_key, period, coverage: 'Salud', premiumUf: 100, spendUf: 100, clientRut: undefined }));
  const e: ExpenseRow[] = p.flatMap(row => Array.from({length:count}, (_,i) => ({ clientName:client.name,policy:row.policy,period:row.period,coverage:'Salud',descCober:'DIAGNOSTICO_PRIVADO',
    reembolsoUf:100/count,provider:'PRESTADOR_PRIVADO',insuredRut:rut(12000000+i),patientRut:rut(12000000+i),relation:'T',isapre:'PREVISION_PRIVADA',valPrest:0,valBonif:0,mtoReclam:0 })));
  const input:ScopeInput={ client, policy, policies:[policy], versions:[{ id:id(31),client_id:client.id,policy_id:policy.id,revision:1,effective_on:'2026-01-01',validation_status:'validated',contract } as PolicyVersion],
    snapshots:[{id:id(51),client_id:client.id,kind:'primas',rows:p},{id:id(52),client_id:client.id,kind:'gastos',rows:e}],links:[],periods:['2026-02'],coverages:['Salud'] };
  input.reviews=verifiedReviews(input);return input;
}
