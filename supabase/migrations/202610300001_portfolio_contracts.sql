-- Administración de Cartera. Aplicar después de las seis migraciones existentes.
-- Aditiva: conserva UUID, sábanas, asignaciones y reportes existentes.
begin;
alter table public.clients
  add column legal_name text,
  add column rut text,
  add column portfolio_status text not null default 'active' check (portfolio_status in ('active','inactive','prospect')),
  add column contact_name text,
  add column contact_email text,
  add column contact_phone text,
  add column revision integer not null default 1;
create unique index clients_rut_unique on public.clients(rut) where rut is not null;

create function public.normalized_rut(raw text) returns text
language plpgsql immutable set search_path = '' as $$
declare value text := upper(regexp_replace(coalesce(raw,''), '[.\s-]', '', 'g')); body text; total integer := 0; factor integer := 2; expected text; n integer;
begin
  if value = '' then return null; end if;
  if value !~ '^[0-9]{1,8}[0-9K]$' then raise exception 'RUT inválido'; end if;
  body := (left(value,length(value)-1)::bigint)::text;
  for n in reverse length(body)..1 loop
    total := total + substring(body,n,1)::integer * factor;
    factor := case when factor = 7 then 2 else factor + 1 end;
  end loop;
  n := 11 - (total % 11);
  expected := case when n = 11 then '0' when n = 10 then 'K' else n::text end;
  if right(value,1) <> expected or body::bigint = 0 then raise exception 'Dígito verificador de RUT inválido'; end if;
  return body || '-' || expected;
end;
$$;
alter table public.clients add constraint clients_rut_valid check (rut is null or rut = public.normalized_rut(rut));
create function public.portfolio_try_rut(raw text) returns text
language plpgsql immutable set search_path = '' as $$
begin return public.normalized_rut(raw); exception when others then return null; end;
$$;


create table public.portfolio_documents (
  id uuid primary key,
  client_id uuid references public.clients(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  original_name text not null check (length(original_name) between 1 and 240),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path text not null unique,
  status text not null default 'uploaded' check (status in ('uploaded','processing','review','failed')),
  pages jsonb not null default '[]' check (jsonb_typeof(pages) = 'array'),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array'),
  error text,
  created_at timestamptz not null default now(),
  unique (sha256)
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_documents enable row level security;
revoke all on public.portfolio_documents from public,anon,authenticated;
grant select on public.portfolio_documents to authenticated;
create table public.portfolio_policies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  number_key text not null,
  insurer_key text not null,
  created_at timestamptz not null default now(),
  unique (client_id, insurer_key, number_key),
  unique (id, client_id)
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_policies enable row level security;
revoke all on public.portfolio_policies from public,anon,authenticated;
grant select on public.portfolio_policies to authenticated;
create table public.portfolio_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null,
  client_id uuid not null,
  revision integer not null check (revision > 0),
  change_type text not null check (change_type in ('initial','renewal','endorsement')),
  effective_on date not null,
  validation_status text not null check (validation_status in ('draft','validated')),
  contract jsonb not null check (jsonb_typeof(contract) = 'object'),
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (policy_id,client_id) references public.portfolio_policies(id,client_id) on delete restrict,
  unique (policy_id,revision),
  unique (id,policy_id)
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_policy_versions enable row level security;
revoke all on public.portfolio_policy_versions from public,anon,authenticated;
grant select on public.portfolio_policy_versions to authenticated;
create index portfolio_versions_client on public.portfolio_policy_versions(client_id,policy_id,revision desc);
create table public.portfolio_dataset_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  kind text not null check (kind in ('primas','gastos')),
  rows jsonb not null,
  row_count integer generated always as (jsonb_array_length(rows)) stored,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_dataset_versions enable row level security;
revoke all on public.portfolio_dataset_versions from public,anon,authenticated;
grant select on public.portfolio_dataset_versions to authenticated;
create index portfolio_dataset_client on public.portfolio_dataset_versions(client_id,kind,created_at desc);
create table public.portfolio_row_links (
  snapshot_id uuid not null references public.portfolio_dataset_versions(id) on delete restrict,
  row_index integer not null check (row_index >= 0),
  policy_id uuid not null references public.portfolio_policies(id) on delete restrict,
  policy_version_id uuid not null,
  coverage text not null,
  allocation_percent numeric not null check (allocation_percent > 0 and allocation_percent <= 100),
  foreign key (policy_version_id,policy_id) references public.portfolio_policy_versions(id,policy_id) on delete restrict,
  primary key (snapshot_id,row_index,policy_version_id,coverage)
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_row_links enable row level security;
revoke all on public.portfolio_row_links from public,anon,authenticated;
grant select on public.portfolio_row_links to authenticated;
create table public.portfolio_premium_movements (
  id uuid primary key,
  client_id uuid not null,
  policy_id uuid not null,
  movement_type text not null check (movement_type in ('invoiced','collected','adjustment')),
  amount numeric not null check (amount::text ~ '^-?[0-9]+([.][0-9]+)?$'),
  currency text not null check (currency in ('UF','CLP','USD')),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  occurred_on date not null,
  source_reference text not null check (length(trim(source_reference)) > 0),
  evidence jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (policy_id,client_id) references public.portfolio_policies(id,client_id) on delete restrict,
  unique (client_id,movement_type,source_reference)
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_premium_movements enable row level security;
revoke all on public.portfolio_premium_movements from public,anon,authenticated;
grant select on public.portfolio_premium_movements to authenticated;
create table public.portfolio_audit (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients(id) on delete restrict,
  entity text not null, entity_id text not null, action text not null,
  before_value jsonb, after_value jsonb,
  actor_id uuid, created_at timestamptz not null default now()
);
-- RLS explícita para que también la reconozca el analizador del SQL Editor.
alter table public.portfolio_audit enable row level security;
revoke all on public.portfolio_audit from public,anon,authenticated;
grant select on public.portfolio_audit to authenticated;
create index portfolio_audit_client on public.portfolio_audit(client_id,created_at desc);

create function public.portfolio_client_revision() returns trigger
language plpgsql set search_path = '' as $$
begin new.revision:=old.revision+1; return new; end;
$$;
create trigger portfolio_client_revision before update on public.clients for each row execute function public.portfolio_client_revision();

create function public.portfolio_capture_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_value jsonb; new_value jsonb; cid uuid; item jsonb;
begin
  if TG_OP <> 'INSERT' then old_value := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then new_value := to_jsonb(new); end if;
  item := coalesce(new_value,old_value);
  if TG_TABLE_NAME = 'clients' then cid := (item->>'id')::uuid;
  else cid := (item->>'client_id')::uuid; end if;
  -- Evitar copiar el texto completo de PDFs y datasets en cada evento.
  if TG_TABLE_NAME = 'client_datasets' then
    old_value := old_value - 'rows'; new_value := new_value - 'rows';
  end if;
  if TG_TABLE_NAME = 'portfolio_documents' then
    old_value := old_value - 'pages' - 'fields'; new_value := new_value - 'pages' - 'fields';
  end if;
  insert into public.portfolio_audit(client_id,entity,entity_id,action,before_value,after_value,actor_id)
    values (cid,TG_TABLE_NAME,coalesce(item->>'id',item->>'snapshot_id',(item->>'client_id')||':'||(item->>'kind')),TG_OP,old_value,new_value,auth.uid());
  return coalesce(new,old);
end;
$$;
create trigger portfolio_datasets_audit after insert or update or delete on public.client_datasets for each row execute function public.portfolio_capture_audit();
create trigger portfolio_clients_audit after insert or update on public.clients for each row execute function public.portfolio_capture_audit();
create trigger portfolio_versions_audit after insert on public.portfolio_policy_versions for each row execute function public.portfolio_capture_audit();
create trigger portfolio_documents_audit after insert or update on public.portfolio_documents for each row execute function public.portfolio_capture_audit();
create trigger portfolio_movements_audit after insert on public.portfolio_premium_movements for each row execute function public.portfolio_capture_audit();
-- Solo RUT válidos y sin ambigüedad, ya presentes en las sábanas del cliente.
-- Conflictos permanecen pendientes; no fusionar ni inventar identidades.
with pairs as (
  select distinct d.client_id,public.portfolio_try_rut(r->>'clientRut') rut
  from public.client_datasets d cross join lateral jsonb_array_elements(d.rows) r
  where d.kind='primas'
), valid as (select * from pairs where rut is not null),
unique_clients as (select client_id,min(rut) rut from valid group by client_id having count(*)=1),
unique_ruts as (select rut from valid group by rut having count(*)=1)
update public.clients c set rut=u.rut from unique_clients u join unique_ruts r on r.rut=u.rut
where c.id=u.client_id and c.rut is null;


create function public.portfolio_snapshot_dataset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and old.rows is distinct from new.rows) then
    insert into public.portfolio_dataset_versions(client_id,kind,rows,created_by)
      values (new.client_id,new.kind,new.rows,auth.uid());
  end if;
  return coalesce(new,old);
end;
$$;
-- Snapshot inicial: solo lo disponible hoy; no inventa cargas anteriores.
insert into public.portfolio_dataset_versions(client_id,kind,rows) select client_id,kind,rows from public.client_datasets;
create trigger portfolio_dataset_history after insert or update on public.client_datasets for each row execute function public.portfolio_snapshot_dataset();

create function public.portfolio_save_client(target_id uuid, expected_revision integer, details jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; canonical_rut text; title text; conflicting_name text;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  canonical_rut := public.normalized_rut(details->>'rut');
  title := trim(details->>'legal_name');
  if canonical_rut is not null then
    select c.name into conflicting_name from public.clients c join public.client_datasets d on d.client_id=c.id
      cross join lateral jsonb_array_elements(d.rows) r
      where c.id is distinct from target_id and c.rut is null and d.kind='primas' and public.portfolio_try_rut(r->>'clientRut')=canonical_rut limit 1;
    if found then raise exception 'RUT presente en una sábana histórica de %. Selecciona ese cliente y resuelve su identidad antes de continuar',conflicting_name; end if;
  end if;
  if title is null or length(title) not between 1 and 240 or coalesce(details->>'portfolio_status','') not in ('active','inactive','prospect') then raise exception 'Datos de cliente inválidos'; end if;
  if target_id is null then
    insert into public.clients(name,legal_name,rut,portfolio_status,contact_name,contact_email,contact_phone)
      values(title,title,canonical_rut,details->>'portfolio_status',details->>'contact_name',details->>'contact_email',details->>'contact_phone') returning id into result;
  else
    update public.clients set legal_name=title,rut=canonical_rut,portfolio_status=details->>'portfolio_status',
      contact_name=details->>'contact_name',contact_email=details->>'contact_email',contact_phone=details->>'contact_phone',revision=revision+1
      where id=target_id and revision=expected_revision returning id into result;
    if not found then raise exception 'El cliente cambió. Actualiza antes de guardar'; end if;
  end if;
  -- name, kam_name y manager_name históricos se conservan para reportes/RLS.
  return result;
end;
$$;

create function public.portfolio_check_evidence(evidence jsonb, target_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare doc public.portfolio_documents; page_number integer; quote text; page_text text;
begin
  if evidence is null or jsonb_typeof(evidence) <> 'object' then raise exception 'Falta respaldo documental'; end if;
  select * into doc from public.portfolio_documents where id=(evidence->>'documentId')::uuid;
  if not found or doc.client_id is distinct from target_client or doc.status <> 'review' then raise exception 'Documento no disponible para el cliente'; end if;
  page_number := (evidence->>'page')::integer; quote := trim(evidence->>'quote');
  select p->>'text' into page_text from jsonb_array_elements(doc.pages) p where (p->>'page')::integer=page_number;
  if page_text is null or quote is null or length(quote) < 3 or position(quote in page_text)=0 then raise exception 'Página o cita documental inválida'; end if;
end;
$$;

create function public.portfolio_save_policy(target_client uuid,target_policy uuid,expected_revision integer,change_kind text,effective_date date,validation text,payload jsonb,change_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid; current_revision integer; item jsonb; plan jsonb; term jsonb; key text; number_value text; insurer_value text; identities text[] := array[]::text[];
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  perform 1 from public.clients where id=target_client for update;
  if not found then raise exception 'Cliente no encontrado'; end if;
  number_value := lower(trim(payload->>'number')); insurer_value := lower(trim(payload->>'insurer'));
  if length(coalesce(number_value,'')) not between 1 and 120 or length(coalesce(insurer_value,'')) not between 1 and 200
    or change_kind is null or change_kind not in ('initial','renewal','endorsement') or validation is null or validation not in ('draft','validated')
    or effective_date is null or coalesce(payload->>'currency','') not in ('UF','CLP','USD')
    or coalesce(payload->>'periodicity','') not in ('monthly','quarterly','semiannual','annual','single')
    or coalesce(payload->>'status','') not in ('active','cancelled','suspended')
    or coalesce(jsonb_typeof(payload->'coverages'),'') <> 'array' then raise exception 'Póliza inválida'; end if;
  if not isfinite(effective_date) then raise exception 'Fecha de efecto inválida'; end if;
  foreach key in array array['startsOn','endsOn','cancellationDate'] loop
    if nullif(payload->>key,'') is not null and ((payload->>key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not isfinite((payload->>key)::date)) then raise exception 'Fecha inválida'; end if;
  end loop;
  foreach key in array array['premium','commission'] loop
    if nullif(payload->>key,'') is not null and ((payload->>key) !~ '^[0-9]+([.][0-9]+)?$') then raise exception 'Importe contractual inválido'; end if;
  end loop;
  if jsonb_typeof(payload->'evidence') is distinct from 'object' or jsonb_array_length(payload->'coverages')>40 or octet_length(payload::text)>5242880 then raise exception 'Estructura contractual inválida'; end if;
  foreach key in array array['number','insurer','startsOn','endsOn','currency','premium','periodicity','commission','commissionBasis','broker','kam','status','cancellationDate'] loop
    if jsonb_typeof(payload->key) is distinct from 'string' then raise exception 'Campo contractual inválido'; end if;
  end loop;
  if nullif(payload->>'startsOn','') is not null and nullif(payload->>'endsOn','') is not null
    and (payload->>'startsOn')::date > (payload->>'endsOn')::date then raise exception 'Vigencia inválida'; end if;
  if nullif(payload->>'premium','') is not null and (payload->>'premium')::numeric < 0 then raise exception 'Prima inválida'; end if;
  if nullif(payload->>'commission','') is not null and (payload->>'commission')::numeric not between 0 and 100 then raise exception 'Comisión inválida'; end if;
  if payload->>'status'='cancelled' and nullif(payload->>'cancellationDate','') is null then raise exception 'Indica fecha de cancelación'; end if;
  if target_policy is null then
    if change_kind <> 'initial' then raise exception 'La primera versión debe ser inicial'; end if;
    insert into public.portfolio_policies(client_id,number_key,insurer_key) values(target_client,number_value,insurer_value) returning id into pid;
  else
    select id into pid from public.portfolio_policies where id=target_policy and client_id=target_client for update;
    if not found then raise exception 'Póliza ajena o inexistente'; end if;
    -- La identidad no cambia por un endoso; crear otra póliza si cambia aseguradora/número.
    if exists(select 1 from public.portfolio_policies where id=pid and (number_key<>number_value or insurer_key<>insurer_value)) then raise exception 'Número y aseguradora identifican la póliza y no pueden cambiar'; end if;
  end if;
  select coalesce(max(revision),0) into current_revision from public.portfolio_policy_versions where policy_id=pid;
  if expected_revision is distinct from current_revision then raise exception 'La póliza cambió. Actualiza antes de guardar'; end if;
  if current_revision>0 and change_kind='initial' and exists(select 1 from public.portfolio_policy_versions where policy_id=pid and validation_status='validated') then raise exception 'Registra una renovación o un endoso de la versión validada'; end if;
  if validation='validated' then
    if nullif(payload->>'startsOn','') is null or nullif(payload->>'endsOn','') is null or jsonb_array_length(payload->'coverages')=0 then raise exception 'Faltan vigencia o coberturas verificadas'; end if;
    if change_kind in ('initial','renewal') and effective_date<>(payload->>'startsOn')::date then raise exception 'La versión inicial o renovación debe tener efecto desde el inicio de vigencia'; end if;
    if change_kind='endorsement' then
      if effective_date<(payload->>'startsOn')::date or effective_date>(payload->>'endsOn')::date then raise exception 'El efecto del endoso debe pertenecer a su vigencia'; end if;
      perform public.portfolio_check_evidence(payload->'evidence'->'effectiveOn',target_client);
    end if;
    foreach key in array array['number','insurer','startsOn','endsOn','currency','periodicity'] loop
      perform public.portfolio_check_evidence(payload->'evidence'->key,target_client);
    end loop;
    foreach key in array array['premium','commission','commissionBasis','broker','cancellationDate'] loop
      if nullif(payload->>key,'') is not null then perform public.portfolio_check_evidence(payload->'evidence'->key,target_client); end if;
    end loop;
  end if;
  for item in select * from jsonb_array_elements(payload->'coverages') loop
    if coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or (item->>'id')=any(identities) then raise exception 'Identificador contractual inválido o duplicado'; end if;
    identities:=array_append(identities,item->>'id');

    if coalesce(item->>'type','') not in ('Vida','Salud','Dental','Catastrófico') or coalesce(jsonb_typeof(item->'plans'),'') <> 'array' or nullif(trim(item->>'name'),'') is null then raise exception 'Cobertura inválida'; end if;
    if validation='validated' then perform public.portfolio_check_evidence(payload->'evidence'->(item->>'id'),target_client); end if;
    if jsonb_array_length(item->'plans')>100 then raise exception 'Demasiados planes'; end if;
    for plan in select * from jsonb_array_elements(item->'plans') loop
      if coalesce(plan->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or (plan->>'id')=any(identities) then raise exception 'Identificador contractual inválido o duplicado'; end if;
      identities:=array_append(identities,plan->>'id');
      if nullif(trim(plan->>'name'),'') is null or coalesce(jsonb_typeof(plan->'groups'),'')<>'array' or coalesce(jsonb_typeof(plan->'terms'),'')<>'array' then raise exception 'Plan inválido'; end if;
      if jsonb_array_length(plan->'groups')>100 or jsonb_array_length(plan->'terms')>500
        or exists(select 1 from jsonb_array_elements(plan->'groups') g where jsonb_typeof(g)<>'string' or length(trim(g#>>'{}')) not between 1 and 240) then raise exception 'Grupos inválidos'; end if;
      if validation='validated' then perform public.portfolio_check_evidence(payload->'evidence'->(plan->>'id'),target_client); end if;
      for term in select * from jsonb_array_elements(plan->'terms') loop
        if coalesce(term->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or (term->>'id')=any(identities) then raise exception 'Identificador contractual inválido o duplicado'; end if;
        identities:=array_append(identities,term->>'id');
        foreach key in array array['label','value','unit','scope','period'] loop
          if jsonb_typeof(term->key) is distinct from 'string' or length(term->>key)>12000 then raise exception 'Campo de condición inválido'; end if;
        end loop;
        if nullif(trim(term->>'label'),'') is null or nullif(trim(term->>'value'),'') is null then raise exception 'Condición vacía'; end if;
        if validation='validated' then perform public.portfolio_check_evidence(term->'evidence',target_client); end if;
      end loop;
    end loop;
  end loop;
  insert into public.portfolio_policy_versions(policy_id,client_id,revision,change_type,effective_on,validation_status,contract,note,created_by)
    values(pid,target_client,current_revision+1,change_kind,effective_date,validation,payload,left(coalesce(change_note,''),2000),auth.uid());
  return pid;
end;
$$;

create function public.portfolio_register_document(document_id uuid,target_client uuid,file_name text,file_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare existing uuid;
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  select id into existing from public.portfolio_documents where sha256=file_hash;
  if found then return existing; end if;
  insert into public.portfolio_documents(id,client_id,owner_id,original_name,sha256,object_path)
    values(document_id,target_client,auth.uid(),file_name,file_hash,auth.uid()::text||'/'||document_id::text||'.pdf');
  return document_id;
end;
$$;
create function public.portfolio_update_document(document_id uuid,target_client uuid,next_status text,page_data jsonb,field_data jsonb,failure text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise insufficient_privilege using message = 'Administrador requerido'; end if;
  -- Un documento usado como evidencia no se reasigna ni se reprocesa destructivamente.
  if exists(select 1 from public.portfolio_policy_versions v where v.validation_status='validated' and v.contract::text like '%'||document_id::text||'%')
    or exists(select 1 from public.portfolio_premium_movements m where m.evidence->>'documentId'=document_id::text) then
    raise exception 'Documento utilizado por una versión validada';
  end if;
  update public.portfolio_documents set client_id=target_client,status=next_status,pages=coalesce(page_data,pages),fields=coalesce(field_data,fields),error=left(failure,1000) where id=document_id;
  if not found then raise exception 'Documento no encontrado'; end if;
end;
$$;

create function public.portfolio_link_row(snapshot uuid,row_number integer,policy uuid,coverage_name text,allocation numeric,version_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare ds public.portfolio_dataset_versions; total numeric; previous jsonb;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  select * into ds from public.portfolio_dataset_versions where id=snapshot for update;
  if not found or row_number is null or row_number<0 or row_number>=jsonb_array_length(ds.rows) then raise exception 'Fila no encontrada'; end if;
  if not exists(select 1 from public.portfolio_policies where id=policy and client_id=ds.client_id) then raise exception 'Póliza de otro cliente'; end if;
  if not exists(select 1 from public.portfolio_policy_versions v cross join lateral jsonb_array_elements(v.contract->'coverages') c where v.id=version_id and v.policy_id=policy and v.validation_status='validated' and c->>'type'=coverage_name) then raise exception 'Selecciona una versión validada y una cobertura registrada'; end if;
  select coalesce(sum(allocation_percent),0) into total from public.portfolio_row_links where snapshot_id=snapshot and row_index=row_number and (policy_version_id<>version_id or coverage<>coverage_name);
  if allocation is null or allocation<=0 or total+allocation>100 then raise exception 'La asignación supera 100%% o es inválida'; end if;
  select to_jsonb(l) into previous from public.portfolio_row_links l where l.snapshot_id=snapshot and l.row_index=row_number and l.policy_version_id=version_id and l.coverage=coverage_name;
  insert into public.portfolio_row_links(snapshot_id,row_index,policy_id,policy_version_id,coverage,allocation_percent) values(snapshot,row_number,policy,version_id,coverage_name,allocation)
    on conflict(snapshot_id,row_index,policy_version_id,coverage) do update set allocation_percent=excluded.allocation_percent;
  insert into public.portfolio_audit(client_id,entity,entity_id,action,before_value,after_value,actor_id) values(ds.client_id,'portfolio_row_links',snapshot::text,'LINK',previous,jsonb_build_object('row',row_number,'policy',policy,'version',version_id,'coverage',coverage_name,'percent',allocation),auth.uid());
end;
$$;

create function public.portfolio_add_movement(movement_id uuid,target_client uuid,policy uuid,details jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare previous public.portfolio_premium_movements;
begin
  if not public.is_admin() then raise insufficient_privilege using message='Administrador requerido'; end if;
  perform public.portfolio_check_evidence(details->'evidence',target_client);
  select * into previous from public.portfolio_premium_movements where id=movement_id;
  if found then
    if previous.client_id<>target_client or previous.policy_id<>policy or previous.movement_type<>details->>'movement_type' or previous.amount<>(details->>'amount')::numeric or previous.currency<>details->>'currency' or previous.period<>details->>'period' or previous.occurred_on<>(details->>'occurred_on')::date or previous.source_reference<>details->>'source_reference' or previous.evidence<>details->'evidence' then raise exception 'Identificador reutilizado con otros datos'; end if;
    return movement_id;
  end if;
  insert into public.portfolio_premium_movements(id,client_id,policy_id,movement_type,amount,currency,period,occurred_on,source_reference,evidence,created_by)
    values(movement_id,target_client,policy,details->>'movement_type',(details->>'amount')::numeric,details->>'currency',details->>'period',(details->>'occurred_on')::date,details->>'source_reference',details->'evidence',auth.uid());
  return movement_id;
end;
$$;

-- Lectura heredada por cliente; ninguna escritura directa para usuarios funcionales.

create policy portfolio_documents_read on public.portfolio_documents for select to authenticated using (public.is_admin() or (client_id is not null and public.can_access_client(client_id)));
create policy portfolio_policies_read on public.portfolio_policies for select to authenticated using (public.can_access_client(client_id));
create policy portfolio_versions_read on public.portfolio_policy_versions for select to authenticated using (public.can_access_client(client_id));
create policy portfolio_datasets_read on public.portfolio_dataset_versions for select to authenticated using (public.can_access_client(client_id));
create policy portfolio_links_read on public.portfolio_row_links for select to authenticated using (exists(select 1 from public.portfolio_policies p where p.id=policy_id and public.can_access_client(p.client_id)));
create policy portfolio_movements_read on public.portfolio_premium_movements for select to authenticated using (public.can_access_client(client_id));
create policy portfolio_audit_read on public.portfolio_audit for select to authenticated using (public.is_admin());

-- Proyección ligera para cartera: no cargar condiciones/citas de todas las versiones.
create view public.portfolio_policy_overview with (security_invoker=true) as
select id,policy_id,client_id,revision,change_type,effective_on,validation_status,created_at,created_by,note,
  jsonb_build_object('number',contract->'number','insurer',contract->'insurer','startsOn',contract->'startsOn','endsOn',contract->'endsOn','status',contract->'status','cancellationDate',contract->'cancellationDate',
    'coverages',(select coalesce(jsonb_agg(jsonb_build_object('type',c->'type')),'[]'::jsonb) from jsonb_array_elements(contract->'coverages') c)) contract
from public.portfolio_policy_versions;
revoke all on public.portfolio_policy_overview from public,anon,authenticated;
grant select on public.portfolio_policy_overview to authenticated;

-- Les funciones auxiliares no son endpoints RPC públicos.
revoke all on function public.portfolio_try_rut(text),public.portfolio_client_revision(),public.portfolio_capture_audit(),public.portfolio_snapshot_dataset(),public.portfolio_check_evidence(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.normalized_rut(text) from public,anon;
grant execute on function public.normalized_rut(text) to authenticated;
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('portfolio_save_client','portfolio_save_policy','portfolio_register_document','portfolio_update_document','portfolio_link_row','portfolio_add_movement') loop
    execute format('revoke all on function %s from public,anon',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
end $$;
commit;
