import { sanitizeFunctionalContract, isExcludedContractCandidate } from "../../shared/contractPolicy.mjs";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows, databaseError, HttpError, requireAdmin } from "./supabase.js";
import {
  uuid,
  normalizeRut,
  validateContract,
  validDate,
  validateEvidence,
  assertContractReviewComplete,
} from "./contracts.js";
import { extractPdf, renderPolicyPage } from "./policyPdf.js";
const route =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
const admin: RequestHandler = (_req, res, next) => {
  try {
    requireAdmin(res.locals.auth.profile);
    next();
  } catch (e) {
    next(e);
  }
};
export function portfolioError(error: any) {
  if (!error) return;
  if (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code)
  )
    throw new HttpError(
      503,
      "Falta aplicar el SQL de Administración de Cartera (202610300001 y 202610300002). Los reportes anteriores se conservan.",
    );
  if (error.code === "23505")
    throw new HttpError(
      409,
      "Ya existe ese RUT, nombre, póliza o referencia de origen. Revisa el registro existente.",
    );
  if (error.code === "P0001") throw new HttpError(409, error.message);
  if (
    ["23514", "23502", "22P02", "22007", "22008", "22003"].includes(error.code)
  )
    throw new HttpError(
      400,
      "Datos inválidos. Revisa fechas, importes y relaciones.",
    );
  databaseError(error);
}
async function rows(
  db: SupabaseClient,
  table: string,
  clientId: string,
  columns = "*",
  order = "created_at",
) {
  const result: any[] = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq("client_id", clientId)
      .order(order)
      .range(offset, offset + 249);
    portfolioError(error);
    result.push(...(data ?? []));
    if (!data || data.length < 250) return result;
  }
}
export function portfolioRouter() {
  const router = Router();
  router.post('/links/remove',admin,route(async(req,res)=>{
    const b=req.body??{};
    if(!Number.isInteger(b.rowIndex)||b.rowIndex<0||!['Vida','Salud','Dental','Catastrófico'].includes(b.coverage)||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>2000)throw new HttpError(400,'Vínculo o motivo de retiro inválido.');
    const {error}=await res.locals.auth.db.rpc('portfolio_unlink_row',{snapshot:uuid(b.snapshotId),row_number:b.rowIndex,version_id:uuid(b.versionId),coverage_name:b.coverage,reason:b.reason.trim()});
    portfolioError(error);res.json({status:'ok'});
  }));
  const upload = multer({ limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  router.get(
    "/clients",
    route(async (_req, res) => {
      try {
        res.json({
          clients: await allRows(
            res.locals.auth.db,
            "clients",
            "id,name,legal_name,rut,portfolio_status,contact_name,contact_email,contact_phone,kam_name,manager_name,revision",
            "id",
            portfolioError,
          ),
        });
      } catch (error) {
        throw error;
      }
    }),
  );
  router.post(
    "/clients",
    admin,
    route(async (req, res) => {
      const input = req.body ?? {};
      if (
        typeof input.legal_name !== "string" ||
        !input.legal_name.trim() ||
        input.legal_name.length > 240 ||
        !["active", "inactive", "prospect"].includes(input.portfolio_status)
      )
        throw new HttpError(400, "Razón social y estado requeridos.");
      for (const key of [
        "rut",
        "contact_name",
        "contact_email",
        "contact_phone",
      ])
        if (
          input[key] != null &&
          (typeof input[key] !== "string" || input[key].length > 240)
        )
          throw new HttpError(400, "Datos del cliente inválidos.");
      if (
        input.contact_email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact_email)
      )
        throw new HttpError(400, "Correo de contacto inválido.");
      const { data, error } = await res.locals.auth.db.rpc(
        "portfolio_save_client",
        {
          target_id: input.id ? uuid(input.id) : null,
          expected_revision: input.revision ?? 0,
          details: { ...input, rut: normalizeRut(input.rut ?? "") },
        },
      );
      portfolioError(error);
      res.json({ id: data });
    }),
  );
  router.get(
    "/clients/:id",
    route(async (req, res) => {
      const id = uuid(req.params.id),
        db = res.locals.auth.db as SupabaseClient;
      const { data: client, error } = await db
        .from("clients")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      portfolioError(error);
      if (!client) throw new HttpError(404, "Cliente no disponible.");
      const [policies, versions, documents, snapshots, audit, movements] =
        await Promise.all([
          rows(db, "portfolio_policies", id),
          rows(db, "portfolio_policy_versions", id),
          rows(
            db,
            "portfolio_documents",
            id,
            "id,client_id,original_name,sha256,status,error,created_at",
          ),
          rows(
            db,
            "portfolio_dataset_versions",
            id,
            "id,client_id,kind,created_at,row_count",
          ),
          rows(
            db,
            "portfolio_audit",
            id,
            "id,entity,action,created_at,actor_id",
          ),
          rows(db, "portfolio_premium_movements", id),
        ]);
      res.json({
        client,
        policies: policies.map((p) => ({
          ...p,
          versions: versions
            .filter((v) => v.policy_id === p.id)
            .map(v=>({...v,contract:sanitizeFunctionalContract(v.contract)}))
            .sort((a, b) => b.revision - a.revision),
        })),
        documents,
        snapshots,
        audit: audit.reverse(),
        movements,
      });
    }),
  );
  router.post(
    "/clients/:id/policies",
    admin,
    route(async (req, res) => {
      const b = req.body ?? {},
        contract = validateContract(b.contract);
      if (
        !validDate(b.effectiveOn) ||
        !["initial", "renewal", "endorsement"].includes(b.changeType) ||
        !["draft", "validated"].includes(b.validationStatus) ||
        !Number.isInteger(b.expectedRevision) ||
        b.expectedRevision < 0 ||
        typeof b.note !== "string" ||
        b.note.length > 2000
      )
        throw new HttpError(
          400,
          "Revisión, tipo de cambio y fecha de efecto requeridos.",
        );
      if (b.validationStatus === "validated") assertContractReviewComplete(contract);
      const { data, error } = await res.locals.auth.db.rpc(
        "portfolio_save_policy",
        {
          target_client: uuid(req.params.id),
          target_policy: b.policyId ? uuid(b.policyId) : null,
          expected_revision: b.expectedRevision,
          change_kind: b.changeType,
          effective_date: b.effectiveOn,
          validation: b.validationStatus,
          payload: { ...contract, premium: "" }, // Placeholder obligatorio de la RPC histórica; nunca contiene un importe.
          change_note: b.note,
        },
      );
      portfolioError(error);
      res.json({ id: data });
    }),
  );
  router.get(
    "/documents",
    admin,
    route(async (_req, res) => {
      const { data, error } = await res.locals.auth.db
        .from("portfolio_documents")
        .select("id,client_id,original_name,sha256,status,error,created_at")
        .is("client_id", null)
        .order("created_at", { ascending: false })
        .limit(100);
      portfolioError(error);
      res.json({ documents: data ?? [] });
    }),
  );
  router.post(
    "/documents",
    admin,
    upload.single("file"),
    route(async (req, res) => {
      if (
        !req.file ||
        !req.file.buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))
      )
        throw new HttpError(400, "Selecciona un PDF válido de hasta 20 MB.");
      const db = res.locals.auth.db as SupabaseClient,
        clientId = req.body.clientId ? uuid(req.body.clientId) : null;
      const hash = createHash("sha256").update(req.file.buffer).digest("hex"),
        newId = randomUUID();
      const { data: id, error } = await db.rpc("portfolio_register_document", {
        document_id: newId,
        target_client: clientId,
        file_name: req.file.originalname.slice(0, 240),
        file_hash: hash,
      });
      portfolioError(error);
      const { data: doc, error: docError } = await db
        .from("portfolio_documents")
        .select("*")
        .eq("id", id)
        .single();
      portfolioError(docError);
      if (doc.client_id !== clientId)
        throw new HttpError(
          409,
          "Ese documento ya existe asociado a otro cliente o está pendiente de asociación. Usa el documento existente.",
        );
      const bucket = db.storage.from("portfolio-policies");
      const existing = await bucket.download(doc.object_path);
      if (!existing.data) {
        const uploaded = await bucket.upload(doc.object_path, req.file.buffer, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (uploaded.error)
          throw new HttpError(
            503,
            "No se pudo conservar el original privado. Revisa el bucket y las políticas Storage del SQL entregado; puedes reintentar el archivo.",
          );
      }
      res.json({ id, duplicate: id !== newId });
    }),
  );
  router.get(
    "/documents/:id",
    route(async (req, res) => {
      const { data, error } = await res.locals.auth.db
        .from("portfolio_documents")
        .select("*")
        .eq("id", uuid(req.params.id))
        .maybeSingle();
      portfolioError(error);
      if (!data) throw new HttpError(404, "Documento no disponible.");
      // object_path y owner no son necesarios para el editor.
      const { object_path, owner_id, ...document } = data;
      res.json({...document,fields:document.fields?.filter((f:unknown)=>!isExcludedContractCandidate(f)),pages:document.pages?.map((p:any)=>({...p,contractCandidates:p.contractCandidates?.filter((c:unknown)=>!isExcludedContractCandidate(c))}))});
    }),
  );
  router.get(
    "/documents/:id/original",
    route(async (req, res) => {
      const db = res.locals.auth.db as SupabaseClient;
      const { data, error } = await db
        .from("portfolio_documents")
        .select("object_path")
        .eq("id", uuid(req.params.id))
        .maybeSingle();
      portfolioError(error);
      if (!data) throw new HttpError(404, "Documento no disponible.");
      const signed = await db.storage
        .from("portfolio-policies")
        .createSignedUrl(data.object_path, 60);
      if (signed.error)
        throw new HttpError(503, "No se pudo abrir el original privado.");
      res.json({ url: signed.data.signedUrl });
    }),
  );
  router.post(
    "/documents/:id/pages/:page/preview",
    route(async (req,res) => {
      const page=Number(req.params.page);
      if(!Number.isInteger(page)||page<1||page>80)throw new HttpError(400,"Página inválida.");
      const db=res.locals.auth.db as SupabaseClient;
      const {data:doc,error}=await db.from("portfolio_documents").select("object_path,sha256").eq("id",uuid(req.params.id)).maybeSingle();
      portfolioError(error);
      if(!doc)throw new HttpError(404,"Documento no disponible.");
      const original=await db.storage.from("portfolio-policies").download(doc.object_path);
      if(original.error||!original.data)throw new HttpError(503,"Original privado no disponible.");
      const buffer=Buffer.from(await original.data.arrayBuffer());
      if(createHash("sha256").update(buffer).digest("hex")!==doc.sha256)throw new HttpError(409,"Huella del original inválida.");
      const image=await renderPolicyPage(buffer,page,req.body?.password);
      res.set("Cache-Control","no-store").type("image/png").send(image);
    }),
  );
  router.post(
    "/documents/:id/assign",
    admin,
    route(async (req, res) => {
      const db = res.locals.auth.db as SupabaseClient;
      const { data, error } = await db
        .from("portfolio_documents")
        .select("*")
        .eq("id", uuid(req.params.id))
        .single();
      portfolioError(error);
      const update = await db.rpc("portfolio_update_document", {
        document_id: data.id,
        target_client: uuid(req.body.clientId),
        next_status: data.status,
        page_data: null,
        field_data: null,
        failure: data.error,
      });
      portfolioError(update.error);
      res.json({ status: "ok" });
    }),
  );
  router.post(
    "/documents/:id/extract",
    admin,
    route(async (req, res) => {
      const db = res.locals.auth.db as SupabaseClient;
      const { data: doc, error } = await db
        .from("portfolio_documents")
        .select("*")
        .eq("id", uuid(req.params.id))
        .single();
      portfolioError(error);
      const update = async (
        status: string,
        pages: unknown = null,
        fields: unknown = null,
        failure: string | null = null,
      ) => {
        const result = await db.rpc("portfolio_update_document", {
          document_id: doc.id,
          target_client: doc.client_id,
          next_status: status,
          page_data: pages,
          field_data: fields,
          failure,
        });
        portfolioError(result.error);
      };
      // Guardar originales antes de procesar; permite reintentar tras caída del proceso.
      const original = await db.storage
        .from("portfolio-policies")
        .download(doc.object_path);
      if (original.error || !original.data)
        throw new HttpError(
          503,
          "Original privado no disponible. Reintenta la carga del mismo PDF.",
        );
      const originalBuffer = Buffer.from(await original.data.arrayBuffer());
      if (
        createHash("sha256").update(originalBuffer).digest("hex") !== doc.sha256
      )
        throw new HttpError(
          409,
          "El original almacenado no coincide con su huella. Requiere revisión de integridad antes de procesar.",
        );
      await update("processing");
      try {
        const result = await extractPdf(
          originalBuffer,
          undefined,
          req.body?.forceOcr === true,
          req.body?.password,
        );
        await update("review", result.pages, result.fields);
        res.json(result);
      } catch (error) {
        const message =
          error instanceof HttpError
            ? error.message
            : "Falló la extracción local. Puedes reintentar.";
        await update(
          doc.status === "review" ? "review" : "failed",
          null,
          null,
          message,
        );
        throw error;
      }
    }),
  );
  router.get(
    "/snapshots/:id",
    route(async (req, res) => {
      const db = res.locals.auth.db as SupabaseClient;
      const { data, error } = await db
        .from("portfolio_dataset_versions")
        .select("id,client_id,kind,rows")
        .eq("id", uuid(req.params.id))
        .maybeSingle();
      portfolioError(error);
      if (!data) throw new HttpError(404, "Versión de sábana no disponible.");
      const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
      const links = await db
        .from("portfolio_row_links")
        .select("*")
        .eq("snapshot_id", data.id)
        .gte("row_index", offset)
        .lt("row_index", offset + 50);
      portfolioError(links.error);
      res.json({
        ...data,
        rows: data.rows.slice(offset, offset + 50),
        total: data.rows.length,
        offset,
        links: links.data ?? [],
      });
    }),
  );
  router.post(
    "/links",
    admin,
    route(async (req, res) => {
      const b = req.body ?? {};
      if (
        !Number.isInteger(b.rowIndex) ||
        b.rowIndex < 0 ||
        typeof b.coverage !== "string" ||
        typeof b.allocation !== "number" ||
        !Number.isFinite(b.allocation)
      )
        throw new HttpError(400, "Vínculo inválido.");
      const { error } = await res.locals.auth.db.rpc("portfolio_link_row", {
        snapshot: uuid(b.snapshotId),
        row_number: b.rowIndex,
        policy: uuid(b.policyId),
        coverage_name: b.coverage,
        allocation: b.allocation,
        version_id: uuid(b.versionId),
      });
      portfolioError(error);
      res.json({ status: "ok" });
    }),
  );
  router.post(
    "/movements",
    admin,
    route(async (req, res) => {
      const b = req.body ?? {};
      if (
        !["invoiced", "collected", "adjustment"].includes(b.movement_type) ||
        !["UF", "CLP", "USD"].includes(b.currency) ||
        typeof b.amount !== "string" ||
        !/^-?\d+(\.\d+)?$/.test(b.amount) ||
        !Number.isFinite(Number(b.amount)) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.period) ||
        !validDate(b.occurred_on) ||
        typeof b.source_reference !== "string" ||
        !b.source_reference.trim() ||
        b.source_reference.length > 240 ||
        !validateEvidence(b.evidence)
      )
        throw new HttpError(400, "Movimiento o respaldo inválido.");
      const { data, error } = await res.locals.auth.db.rpc(
        "portfolio_add_movement",
        {
          movement_id: uuid(b.id),
          target_client: uuid(b.clientId),
          policy: uuid(b.policyId),
          details: b,
        },
      );
      portfolioError(error);
      res.json({ id: data });
    }),
  );
  return router;
}
