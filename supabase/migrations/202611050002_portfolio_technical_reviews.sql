-- Cierre 2.5. Aditiva, después de cartera. Independiente de tablas/activación IA.
begin;
create table public.portfolio_technical_reviews (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  policy_id uuid not null,
  policy_version_id uuid not null,
  premium_snapshot_id uuid not null references public.portfolio_dataset_versions(id) on delete restrict,
  expense_snapshot_id uuid not null references public.portfolio_dataset_versions(id) on delete restrict,
  period text not null check(period ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
  coverage text not null check(coverage in ('Vida','Salud','Dental','Catastrófico')),
  review_kind text not null check(review_kind in ('expense_basis','completeness','partial_month','coverage_ambiguity','allocation')),
  decision text not null check(decision in ('pending','validated','rejected')),
  expense_basis text not null default 'undetermined' check(expense_basis in ('paid','incurred','undetermined')),
  data_complete boolean,
  evidence jsonb,
  note text not null check(length(trim(note)) between 3 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(policy_id,client_id) references public.portfolio_policies(id,client_id) on delete restrict,
  foreign key(policy_version_id,policy_id) references public.portfolio_policy_versions(id,policy_id) on delete restrict,
  check(decision<>'validated' or (evidence is not null and review_kind in ('expense_basis','completeness','allocation'))),
  check(review_kind<>'expense_basis' or decision<>'validated' or expense_basis<>'undetermined'),
  check(review_kind<>'completeness' or decision<>'validated' or data_complete is not null)
);
create index portfolio_review_scope on public.portfolio_technical_reviews(policy_id,premium_snapshot_id,expense_snapshot_id,period,coverage,id desc);
alter table public.portfolio_technical_reviews enable row level security;
revoke all on public.portfolio_technical_reviews from public,anon,authenticated;
grant select on public.portfolio_technical_reviews to authenticated;
create policy technical_reviews_read on public.portfolio_technical_reviews for select to authenticated using(public.can_access_client(client_id));
create trigger portfolio_technical_reviews_audit after insert on public.portfolio_technical_reviews for each row execute function public.portfolio_capture_audit();

create function public.portfolio_review_technical(target_policy uuid,version_id uuid,premium_snapshot uuid,expense_snapshot uuid,details jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare cid uuid; result bigint; kind text:=details->>'review_kind'; decision_value text:=details->>'decision';
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  select client_id into cid from public.portfolio_policies where id=target_policy;
  if not found then raise exception 'Póliza inexistente'; end if;
  if not exists(select 1 from public.portfolio_policy_versions where id=version_id and policy_id=target_policy and client_id=cid and validation_status='validated') then raise exception 'Versión contractual validada requerida'; end if;
  if not exists(select 1 from public.portfolio_dataset_versions d where d.id=premium_snapshot and d.client_id=cid and d.kind='primas')
    or not exists(select 1 from public.portfolio_dataset_versions d where d.id=expense_snapshot and d.client_id=cid and d.kind='gastos') then raise exception 'Snapshots de otra empresa o tipo incorrecto'; end if;
  if kind is null or kind not in ('expense_basis','completeness','partial_month','coverage_ambiguity','allocation')
    or decision_value is null or decision_value not in ('pending','validated','rejected') then raise exception 'Revisión inválida'; end if;
  if kind in ('partial_month','coverage_ambiguity') and decision_value='validated' then raise exception 'Falta criterio aprobado y datos desagregados; no se puede levantar este bloqueo'; end if;
  if decision_value='validated' then
    if (select count(*) from public.portfolio_policy_versions v cross join lateral jsonb_array_elements(v.contract->'coverages') c
      where v.id=version_id and c->>'type'=details->>'coverage')<>1 then raise exception 'Cobertura contractual inexistente o ambigua'; end if;
    perform 1 from public.portfolio_documents where id=(details->'evidence'->>'documentId')::uuid for update;
    perform public.portfolio_check_evidence(details->'evidence',cid);
  end if;
  if jsonb_typeof(details->'data_complete') not in ('boolean','null') then raise exception 'Completitud inválida'; end if;
  insert into public.portfolio_technical_reviews(client_id,policy_id,policy_version_id,premium_snapshot_id,expense_snapshot_id,period,coverage,review_kind,decision,expense_basis,data_complete,evidence,note,created_by)
    values(cid,target_policy,version_id,premium_snapshot,expense_snapshot,details->>'period',details->>'coverage',kind,decision_value,
      coalesce(details->>'expense_basis','undetermined'),(details->>'data_complete')::boolean,
      case when decision_value='validated' then details->'evidence' else null end,details->>'note',auth.uid()) returning id into result;
  return result;
end;
$$;
revoke all on function public.portfolio_review_technical(uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.portfolio_review_technical(uuid,uuid,uuid,uuid,jsonb) to authenticated;

-- Corregir un vínculo requiere retirarlo expresamente antes de registrar otro.
-- Nunca elimina filas de sábana, snapshots, documentos ni versiones.
create function public.portfolio_unlink_row(snapshot uuid,row_number integer,version_id uuid,coverage_name text,reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid; previous jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  if reason is null or length(trim(reason)) not between 3 and 2000 then raise exception 'Indica el motivo del retiro'; end if;
  select client_id into cid from public.portfolio_dataset_versions where id=snapshot for update;
  if not found then raise exception 'Snapshot inexistente'; end if;
  select to_jsonb(l) into previous from public.portfolio_row_links l where l.snapshot_id=snapshot and l.row_index=row_number and l.policy_version_id=version_id and l.coverage=coverage_name;
  if not found then raise exception 'Vínculo inexistente; actualiza antes de continuar'; end if;
  delete from public.portfolio_row_links l where l.snapshot_id=snapshot and l.row_index=row_number and l.policy_version_id=version_id and l.coverage=coverage_name;
  insert into public.portfolio_audit(client_id,entity,entity_id,action,before_value,after_value,actor_id)
    values(cid,'portfolio_row_links',snapshot::text,'UNLINK',previous,jsonb_build_object('reason',trim(reason)),auth.uid());
end;
$$;
revoke all on function public.portfolio_unlink_row(uuid,integer,uuid,text,text) from public,anon;
grant execute on function public.portfolio_unlink_row(uuid,integer,uuid,text,text) to authenticated;

-- Conservar la cita validada y su empresa. Comparte el bloqueo con la revisión
-- para impedir reatribuir/reprocesar el documento entre verificación y guardado.
alter function public.portfolio_update_document(uuid,uuid,text,jsonb,jsonb,text) rename to portfolio_before_technical_update_document;
revoke all on function public.portfolio_before_technical_update_document(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
create function public.portfolio_update_document(document_id uuid,target_client uuid,next_status text,page_data jsonb,field_data jsonb,failure text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  perform 1 from public.portfolio_documents where id=document_id for update;
  if exists(select 1 from public.portfolio_technical_reviews where decision='validated' and evidence->>'documentId'=document_id::text) then
    raise exception 'Documento utilizado por una revisión técnica validada';
  end if;
  perform public.portfolio_before_technical_update_document(document_id,target_client,next_status,page_data,field_data,failure);
end;
$$;
revoke all on function public.portfolio_update_document(uuid,uuid,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.portfolio_update_document(uuid,uuid,text,jsonb,jsonb,text) to authenticated;
select pg_notify('pgrst','reload schema');
commit;
