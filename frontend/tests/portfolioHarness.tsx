// Harness exclusivo de desarrollo. No forma parte del build de index.html.
import React from "react";
import { createRoot } from "react-dom/client";
import PortfolioAdministration from "../src/components/PortfolioAdministration";
import PortfolioDashboard from "../src/components/PortfolioDashboard";
import "../src/noergon-tokens.css";
import "../src/styles.css";
const cid = "00000000-0000-4000-8000-000000000010",
  pid = "00000000-0000-4000-8000-000000000020",
  did = "00000000-0000-4000-8000-000000000030";
const clients: any[] = [
  {
    id: cid,
    name: "Cliente histórico",
    legal_name: "Empresa Sintética SpA",
    rut: "12345678-5",
    portfolio_status: "active",
    kam_name: "Ana",
    manager_name: "Jefe",
    revision: 1,
    contact_name: "",
    contact_email: "",
    contact_phone: "",
  },
];
const evidence = { documentId: did, page: 1, quote: "Póliza: 000123" };
let contract: any = {
  number: "000123",
  insurer: "Aseguradora de prueba",
  startsOn: "2026-01-01",
  endsOn: "2026-12-31",
  currency: "UF",
  premium: "100",
  periodicity: "monthly",
  commission: "",
  commissionBasis: "",
  broker: "",
  kam: "Ana",
  status: "active",
  cancellationDate: "",
  coverages: [
    {
      id: "00000000-0000-4000-8000-000000000040",
      type: "Salud",
      name: "Salud",
      plans: [
        {
          id: "00000000-0000-4000-8000-000000000041",
          name: "Plan A",
          groups: ["Grupo 1"],
          terms: [],
        },
      ],
    },
  ],
  evidence: { number: evidence },
};
const doc = {
  id: did,
  client_id: cid,
  original_name: "poliza-sintetica.pdf",
  sha256: "a".repeat(64),
  status: "review",
  error: null,
  created_at: "2026-10-30T12:00:00Z",
  pages: [
    {
      page: 1,
      text: "Póliza: 000123\nInicio de vigencia: 01/01/2026\nPrestación   Porcentaje   Tope\nConsulta   80%   2 UF\nConsulta de prueba   88%   4 UF\nPrima titular de prueba: 0,45 UF mensual",
      method: "text",
      contractCandidates: [{id:"synthetic-term",coverage:"Salud",plan:"Plan de prueba",groups:["Grupo de prueba"],benefit:"Consulta de prueba",kind:"reimbursement",value:"88%",unit:"%",scope:"beneficiario",period:"",page:1,quote:"Consulta de prueba   88%   4 UF\nPrima titular de prueba: 0,45 UF mensual",region:{x:.1,y:.2,width:.5,height:.1},tableId:"synthetic-table",cellId:"synthetic-cell",notes:["(*) Tope compartido del grupo de prueba."],warnings:["Celda compartida: revisar alcance."],alternatives:[],eligibility:"benefit"},{id:"synthetic-tariff",coverage:"Salud",plan:"Plan tarifa",groups:[],benefit:"Titular de prueba",kind:"tariff",value:"0,45",unit:"UF",scope:"persona",period:"mensual",page:1,quote:"Prima titular de prueba: 0,45 UF mensual",notes:[],warnings:[],alternatives:[],eligibility:"benefit",tariff:{concept:"person_premium",component:"gross",componentLabel:"Prima Bruta",category:"Titular",currency:"UF",rateUnit:"",calculationBasis:"por persona",periodicity:"mensual",ageBand:"",incomeBand:"",capitalBasis:"",subtotal:false}}],
      benefitTables: [{id:"synthetic-table",page:1,headers:["Prestación","Reembolso"],notes:["(*) Tope compartido del grupo de prueba."],warnings:[],method:"grid",region:{x:.1,y:.1,width:.8,height:.4},cells:[{id:"synthetic-cell",text:"88%",row:0,column:0,rowSpan:1,columnSpan:1,quote:"Consulta de prueba   88%   4 UF\nPrima titular de prueba: 0,45 UF mensual",region:{x:.1,y:.2,width:.5,height:.1}}]}],
      tables: [
        ["Prestación", "Porcentaje", "Tope"],
        ["Consulta", "80%", "2 UF"],
      ],
    },
  ],
  fields: [
    {
      key: "number",
      value: "000123",
      page: 1,
      quote: "Póliza: 000123",
      confidence: "candidate",
    },
  ],
};
// Simula datos históricos: el editor debe excluir el total, no reescribir el origen.
doc.pages[0].contractCandidates.push({...doc.pages[0].contractCandidates[1],id:"legacy-total",benefit:"Prima Total",value:"9999",tariff:{...doc.pages[0].contractCandidates[1].tariff,subtotal:true}} as any);
const profile: any = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "admin",
  full_name: "Administrador de prueba",
  email: "admin@example.invalid",
  active: true,
};
const windowTest = window as any;
windowTest.__savedPolicies = [];
window.fetch = async (input: any, init?: RequestInit) => {
  const path = new URL(
    typeof input === "string" ? input : input.url,
    location.href,
  ).pathname.replace(/^\/api/, "");
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if(path.endsWith("/pages/1/preview"))return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="612" height="792"><rect width="612" height="792" fill="white"/><text x="60" y="100" font-size="20">PDF sintético · Sin datos reales</text><text x="65" y="185">Consulta de prueba   88%   4 UF</text></svg>',{headers:{"Content-Type":"image/svg+xml"}});
  let data: unknown;
  if (path === "/portfolio/manage/clients" && init?.method === "POST") {
    const id = body.id || "00000000-0000-4000-8000-000000000011";
    const old = clients.find((c) => c.id === id);
    if (old) Object.assign(old, body, { revision: old.revision + 1 });
    else clients.push({ ...body, id, name: body.legal_name, revision: 1 });
    data = { id };
  } else if (path === "/portfolio/manage/clients") data = { clients };
  else if (path === "/portfolio/manage/documents") data = { documents: [] };
  else if (path.endsWith("/policies")) {
    windowTest.__savedPolicies.push(body);
    contract = body.contract;
    data = { id: pid };
  } else if (path === `/portfolio/manage/documents/${did}/extract`)
    data = { pages: doc.pages, fields: doc.fields };
  else if (path === `/portfolio/manage/documents/${did}/original`)
    data = { url: "about:blank" };
  else if (path === `/portfolio/manage/documents/${did}`) data = doc;
  else if (path.startsWith("/portfolio/manage/clients/")) {
    const c = clients.find((c) => c.id === path.split("/").at(-1));
    data = {
      client: c,
      policies:
        c.id === cid
          ? [
              {
                id: pid,
                versions: [
                  {
                    id: "v1",
                    policy_id: pid,
                    client_id: cid,
                    revision: 1 + windowTest.__savedPolicies.length,
                    change_type: "initial",
                    effective_on: "2026-01-01",
                    validation_status: "draft",
                    contract,
                    created_at: "2026-10-30T12:00:00Z",
                    created_by: profile.id,
                    note: "",
                  },
                ],
              },
            ]
          : [],
      documents: c.id === cid ? [doc] : [],
      snapshots: [],
      audit: [],
      movements: [],
    };
  } else if (path === "/portfolio")
    data = {
      clients: clients.map((c, i) => ({
        id: c.id,
        name: c.legal_name,
        reportName: c.name,
        kam: c.kam_name || "Sin KAM",
        manager: "Jefe",
        startsOn: i ? null : "2026-01-01",
        latestPeriod: i ? null : "2026-10",
        monthlyPremiumUf: i ? null : 100,
        annualPremiumUf: i ? null : 1200,
        holders: i ? null : 10,
        dependents: i ? null : 20,
        insured: [],
        renewals: [],
        policies: i
          ? []
          : [
              {
                id: pid,
                versionId: "v1",
                number: contract.number,
                insurer: contract.insurer,
                startsOn: contract.startsOn,
                endsOn: contract.endsOn,
                coverages: ["Salud"],
                state: "active",
              },
            ],
        policyDates: [],
      })),
    };
  else throw new Error(`La prueba bloqueó una solicitud no simulada: ${path}`);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get("view") === "dashboard" ? (
      <PortfolioDashboard
        profile={profile}
        onOpenClient={(name) => {
          windowTest.__openedReport = name;
        }}
      />
    ) : (
      <PortfolioAdministration profile={profile} />
    )}
  </React.StrictMode>,
);
