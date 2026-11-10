-- ETAPA 3. Aplicar después de las nueve migraciones existentes, solo con autorización.
-- No modifica el consolidado de cartera. Sin proveedor, claves, facturación ni jobs.
begin;

create function public.analysis_safe_result(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; ref jsonb;
begin
  if value is null or jsonb_typeof(value)<>'object' then return false; end if;
  if value->>'schemaVersion' is distinct from 'analysis-result-v1' or coalesce(value->>'kind','') not in ('monthly','conclusions')
    or exists(select 1 from jsonb_object_keys(value) k where k not in ('schemaVersion','kind','sections','recommendations')) then return false; end if;
  if jsonb_typeof(value->'sections') is distinct from 'array' or jsonb_typeof(value->'recommendations') is distinct from 'array' then return false; end if;
  if jsonb_array_length(value->'sections') not between 1 and 3 or jsonb_array_length(value->'recommendations')>3 then return false; end if;
  for item in select * from jsonb_array_elements(value->'sections') loop
    if jsonb_typeof(item)<>'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('code','metricRefs')) or coalesce(item->>'code','') not in ('monthly_result','technical_result','renewal_projection','action_plan')
      or jsonb_typeof(item->'metricRefs') is distinct from 'array' then return false; end if;
    if jsonb_array_length(item->'metricRefs')>12 then return false; end if;
    for ref in select * from jsonb_array_elements(item->'metricRefs') loop
      if jsonb_typeof(ref)<>'string' or ref#>>'{}' not in ('premiumUf','technicalSpendUf','lossRatio','lossRatioDeltaPp','spendEffectPp','premiumEffectPp','reimbursementUf','differenceUf','renewalAdjustmentPercent') then return false; end if;
    end loop;
  end loop;
  for item in select * from jsonb_array_elements(value->'recommendations') loop
    if jsonb_typeof(item)<>'string' or item#>>'{}' not in ('review_benefits','education','preferred_providers','pharmacy_agreements','bioequivalents') then return false; end if;
  end loop;
  return octet_length(value::text)<=8192;
end;
$$;

create table public.analysis_runtime_policy (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  tier text not null default 'free' check(tier='free'),
  api_budget_clp integer not null default 0 check(api_budget_clp=0),
  model text check(model ~ '^gemini-[a-z0-9.-]{1,100}$'),
  project_ref_sha256 text check(project_ref_sha256 ~ '^[0-9a-f]{64}$'),
  verified_project_sha256 text check(verified_project_sha256 ~ '^[0-9a-f]{64}$'),
  verified_model text,
  verified_free_rpm integer not null default 0 check(verified_free_rpm>=0),
  verified_free_rpd integer not null default 0 check(verified_free_rpd>=0),
  verified_free_tpm bigint not null default 0 check(verified_free_tpm>=0),
  project_verified boolean not null default false,
  free_quota_verified boolean not null default false,
  billing_disabled_verified boolean not null default false,
  privacy_approved boolean not null default false,
  verified_at timestamptz,
  verification_expires_at timestamptz,
  quota_evidence_sha256 text check(quota_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  billing_evidence_sha256 text check(billing_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  project_requests_minute integer not null default 0 check(project_requests_minute>=0),
  project_requests_day integer not null default 0 check(project_requests_day>=0),
  user_requests_minute integer not null default 0 check(user_requests_minute>=0),
  user_requests_day integer not null default 0 check(user_requests_day>=0),
  project_tokens_minute bigint not null default 0 check(project_tokens_minute>=0),
  project_tokens_day bigint not null default 0 check(project_tokens_day>=0),
  user_tokens_minute bigint not null default 0 check(user_tokens_minute>=0),
  user_tokens_day bigint not null default 0 check(user_tokens_day>=0),
  max_input_tokens integer not null default 0 check(max_input_tokens>=0),
  max_output_tokens integer not null default 0 check(max_output_tokens>=0),
  lease_seconds integer not null default 60 check(lease_seconds between 1 and 600),
  cache_ttl_seconds integer not null default 604800 check(cache_ttl_seconds between 1 and 2592000),
  failure_cooldown_seconds integer not null default 900 check(failure_cooldown_seconds between 60 and 86400),
  cooldown_until timestamptz,
  check(verification_expires_at is null or (verified_at is not null and verification_expires_at>verified_at and verification_expires_at<=verified_at+interval '24 hours'))
);
insert into public.analysis_runtime_policy(singleton) values(true);

create table public.analysis_cache (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  policy_id uuid not null,
  foreign key(policy_id,client_id) references public.portfolio_policies(id,client_id) on delete restrict,
  contract_versions uuid[] not null check(cardinality(contract_versions)>0),
  periods text[] not null check(cardinality(periods) between 1 and 120),
  coverages text[] not null check(cardinality(coverages) between 1 and 4),
  kind text not null check(kind in ('monthly','conclusions')),
  cache_key text not null check(cache_key ~ '^[0-9a-f]{64}$'),
  indicators_hash text not null check(indicators_hash ~ '^[0-9a-f]{64}$'),
  assumptions_hash text not null check(assumptions_hash ~ '^[0-9a-f]{64}$'),
  model text not null check(model ~ '^gemini-[a-z0-9.-]{1,100}$'),
  prompt_version text not null check(prompt_version ~ '^prompt-v[0-9]{1,8}$'),
  calculation_version text not null check(calculation_version ~ '^calculation-v[0-9]{1,8}$'),
  privacy_version text not null check(privacy_version ~ '^privacy-v[0-9]{1,8}$'),
  state text not null default 'pending' check(state in ('pending','ready','failed')),
  result jsonb check(result is null or public.analysis_safe_result(result)),
  lease_token uuid,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,client_id,policy_id,cache_key),
  check((state='ready' and result is not null and result->>'kind'=kind and expires_at is not null)
    or (state<>'ready' and result is null))
);
create table public.analysis_requests (
  id uuid primary key default gen_random_uuid(),
  cache_id uuid not null references public.analysis_cache(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  policy_id uuid not null,
  foreign key(policy_id,client_id) references public.portfolio_policies(id,client_id) on delete restrict,
  model text not null,
  lease_token uuid not null unique,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'reserved' check(status in ('reserved','succeeded','rate_limited','timeout','provider_error','abandoned','invalid_result','token_overrun')),
  reserved_input_tokens integer not null check(reserved_input_tokens>0),
  reserved_output_tokens integer not null check(reserved_output_tokens>0),
  actual_input_tokens bigint check(actual_input_tokens>=0),
  actual_output_tokens bigint check(actual_output_tokens>=0),
  actual_total_tokens bigint check(actual_total_tokens>=0),
  accounted_tokens bigint not null check(accounted_tokens>0),
  check(actual_total_tokens is null or (actual_input_tokens is not null and actual_output_tokens is not null and actual_total_tokens>=actual_input_tokens+actual_output_tokens))
);
create index analysis_requests_budget on public.analysis_requests(reserved_at,owner_id);
alter table public.analysis_runtime_policy enable row level security;
alter table public.analysis_cache enable row level security;
alter table public.analysis_requests enable row level security;
revoke all on public.analysis_runtime_policy,public.analysis_cache,public.analysis_requests from public,anon,authenticated,service_role;
grant select,update on public.analysis_runtime_policy to service_role;
grant select on public.analysis_cache,public.analysis_requests to authenticated;
create policy analysis_cache_read on public.analysis_cache for select to authenticated using (
  owner_id=(select auth.uid()) and public.can_access_client(client_id) and state='ready' and expires_at>now());
create policy analysis_requests_read on public.analysis_requests for select to authenticated using (
  owner_id=(select auth.uid()) and public.can_access_client(client_id));

-- Misma semántica de can_access_client sin cambiar el JWT del usuario en una RPC privilegiada.
create function public.analysis_actor_access(actor uuid, client uuid, policy uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.portfolio_policies x join public.clients c on c.id=x.client_id
    join public.profiles p on p.id=actor
    where x.id=policy and c.id=client and p.active and (p.role='admin'
      or (p.role='executive' and exists(select 1 from public.client_assignments a where a.user_id=p.id and a.client_id=c.id))
      or (nullif(trim(p.portfolio_name),'') is not null and ((p.role='executive' and lower(trim(c.kam_name))=lower(trim(p.portfolio_name)))
        or (p.role='manager' and lower(trim(c.manager_name))=lower(trim(p.portfolio_name)))))))
$$;

create function public.analysis_reserve(p_actor uuid,p_client uuid,p_policy uuid,p_versions uuid[],p_periods text[],p_coverages text[],
  p_kind text,p_key text,p_indicators_hash text,p_assumptions_hash text,p_model text,p_prompt_version text,p_calculation_version text,p_privacy_version text,
  p_input_tokens integer,p_output_tokens integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg public.analysis_runtime_policy; cached public.analysis_cache; rid uuid; token uuid; spent bigint; reqs bigint;
  who uuid; window_kind text; request_limit integer; token_limit bigint;
begin
  if not public.analysis_actor_access(p_actor,p_client,p_policy) then raise insufficient_privilege using message='analysis_access_denied'; end if;
  if p_versions is null or cardinality(p_versions)=0 or exists(select 1 from unnest(p_versions) v where v is null or not exists(
    select 1 from public.portfolio_policy_versions x where x.id=v and x.policy_id=p_policy and x.client_id=p_client and x.validation_status='validated'))
    or p_periods is null or cardinality(p_periods) not between 1 and 120 or exists(select 1 from unnest(p_periods) p where p is null or p !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$')
    or p_coverages is null or cardinality(p_coverages) not between 1 and 4 or exists(select 1 from unnest(p_coverages) c where c is null or c not in ('Vida','Salud','Dental','Catastrófico'))
    or p_input_tokens is null or p_output_tokens is null or p_input_tokens<=0 or p_output_tokens<=0 then raise exception 'analysis_invalid_identity_or_reservation'; end if;
  -- Un único cerrojo de proyecto: duplicados y límites comparten la misma transacción.
  perform pg_advisory_xact_lock(hashtext('noergon_analysis_budget_v1'));
  select * into cfg from public.analysis_runtime_policy where singleton for update;
  select * into cached from public.analysis_cache where owner_id=p_actor and client_id=p_client and policy_id=p_policy and cache_key=p_key for update;
  if found then
    if cached.contract_versions is distinct from p_versions or cached.periods is distinct from p_periods or cached.coverages is distinct from p_coverages
      or cached.kind is distinct from p_kind or cached.indicators_hash is distinct from p_indicators_hash or cached.assumptions_hash is distinct from p_assumptions_hash
      or cached.model is distinct from p_model or cached.prompt_version is distinct from p_prompt_version
      or cached.calculation_version is distinct from p_calculation_version or cached.privacy_version is distinct from p_privacy_version then raise exception 'analysis_identity_mismatch'; end if;
    if cached.state='ready' and cached.expires_at>now() then return jsonb_build_object('status','cached','analysisId',cached.id); end if;
    if cached.state='pending' and cached.lease_expires_at>now() then return jsonb_build_object('status','in_progress','analysisId',cached.id); end if;
    if cached.state='pending' then
      update public.analysis_requests set status='abandoned',completed_at=now() where cache_id=cached.id and lease_token=cached.lease_token and status='reserved';
      update public.analysis_cache set state='failed',lease_token=null,lease_expires_at=null,retry_after=now()+interval '24 hours',updated_at=now() where id=cached.id;
      return jsonb_build_object('status','blocked','reason','lease_expired_unknown');
    end if;
    if cached.retry_after>now() then return jsonb_build_object('status','blocked','reason','cooldown'); end if;
  end if;
  if not cfg.enabled or not cfg.project_verified or not cfg.free_quota_verified or not cfg.billing_disabled_verified or not cfg.privacy_approved
    or cfg.model is distinct from p_model or cfg.verified_at is null or cfg.verified_at>now() or cfg.verification_expires_at is null or cfg.verification_expires_at<=now()
    or cfg.quota_evidence_sha256 is null or cfg.billing_evidence_sha256 is null or cfg.project_ref_sha256 is null
    or cfg.project_ref_sha256 is distinct from cfg.verified_project_sha256 or cfg.model is distinct from cfg.verified_model
    or cfg.project_requests_minute>cfg.verified_free_rpm or cfg.project_requests_day>cfg.verified_free_rpd
    or cfg.project_tokens_minute>cfg.verified_free_tpm then return jsonb_build_object('status','blocked','reason','free_tier_not_verified_or_disabled'); end if;
  if cfg.cooldown_until>now() then return jsonb_build_object('status','blocked','reason','provider_cooldown'); end if;
  if p_input_tokens>cfg.max_input_tokens or p_output_tokens>cfg.max_output_tokens then return jsonb_build_object('status','blocked','reason','request_token_limit'); end if;
  foreach window_kind in array array['minute','provider_day','local_day','rolling_day'] loop
    foreach who in array array[null::uuid,p_actor] loop
      select count(*),coalesce(sum(accounted_tokens),0) into reqs,spent from public.analysis_requests r
        where (who is null or r.owner_id=who) and (
          (window_kind='minute' and r.reserved_at>now()-interval '60 seconds')
          or (window_kind='rolling_day' and r.reserved_at>now()-interval '24 hours')
          or (window_kind='provider_day' and (r.reserved_at at time zone 'America/Los_Angeles')::date=(now() at time zone 'America/Los_Angeles')::date)
          or (window_kind='local_day' and (r.reserved_at at time zone 'America/Santiago')::date=(now() at time zone 'America/Santiago')::date));
      request_limit:=case when who is null then case when window_kind='minute' then cfg.project_requests_minute else cfg.project_requests_day end
        else case when window_kind='minute' then cfg.user_requests_minute else cfg.user_requests_day end end;
      token_limit:=case when who is null then case when window_kind='minute' then cfg.project_tokens_minute else cfg.project_tokens_day end
        else case when window_kind='minute' then cfg.user_tokens_minute else cfg.user_tokens_day end end;
      if reqs+1>request_limit or spent+p_input_tokens::bigint+p_output_tokens::bigint>token_limit then return jsonb_build_object('status','blocked','reason','budget_exhausted'); end if;
    end loop;
  end loop;
  token:=gen_random_uuid();
  if cached.id is null then
    insert into public.analysis_cache(owner_id,client_id,policy_id,contract_versions,periods,coverages,kind,cache_key,indicators_hash,assumptions_hash,model,prompt_version,calculation_version,privacy_version,lease_token,lease_expires_at)
      values(p_actor,p_client,p_policy,p_versions,p_periods,p_coverages,p_kind,p_key,p_indicators_hash,p_assumptions_hash,p_model,p_prompt_version,p_calculation_version,p_privacy_version,token,now()+cfg.lease_seconds*interval '1 second') returning * into cached;
  else
    update public.analysis_cache set state='pending',result=null,expires_at=null,retry_after=null,lease_token=token,lease_expires_at=now()+cfg.lease_seconds*interval '1 second',updated_at=now() where id=cached.id;
  end if;
  insert into public.analysis_requests(cache_id,owner_id,client_id,policy_id,model,lease_token,reserved_input_tokens,reserved_output_tokens,accounted_tokens)
    values(cached.id,p_actor,p_client,p_policy,p_model,token,p_input_tokens,p_output_tokens,p_input_tokens::bigint+p_output_tokens::bigint) returning id into rid;
  return jsonb_build_object('status','reserved','analysisId',cached.id,'requestId',rid,'leaseToken',token);
end;
$$;

create function public.analysis_finish(p_actor uuid,p_request uuid,p_lease uuid,p_status text,p_result jsonb default null,
  p_actual_input bigint default null,p_actual_output bigint default null,p_actual_total bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.analysis_requests; c public.analysis_cache; cfg public.analysis_runtime_policy; outcome text:=p_status; charged bigint; until_time timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('noergon_analysis_budget_v1'));
  select * into r from public.analysis_requests where id=p_request and owner_id=p_actor and lease_token=p_lease for update;
  if not found then raise insufficient_privilege using message='analysis_request_unavailable'; end if;
  if not public.analysis_actor_access(p_actor,r.client_id,r.policy_id) then raise insufficient_privilege using message='analysis_access_denied'; end if;
  if r.status<>'reserved' then return jsonb_build_object('status','already_finalized'); end if;
  select * into c from public.analysis_cache where id=r.cache_id for update;
  select * into cfg from public.analysis_runtime_policy where singleton for update;
  if c.lease_token is distinct from p_lease or c.lease_expires_at<=now() then return jsonb_build_object('status','stale_lease'); end if;
  if p_status is null or p_status not in ('succeeded','rate_limited','timeout','provider_error','invalid_result') then raise exception 'analysis_invalid_outcome'; end if;
  if (p_actual_input is not null or p_actual_output is not null or p_actual_total is not null)
    and (p_actual_input is null or p_actual_output is null or p_actual_total is null or p_actual_input<0 or p_actual_output<0 or p_actual_total<p_actual_input+p_actual_output) then raise exception 'analysis_invalid_usage'; end if;
  charged:=greatest(r.accounted_tokens,coalesce(p_actual_total,r.accounted_tokens));
  if p_status='succeeded' then
    if not public.analysis_safe_result(p_result) or p_result->>'kind' is distinct from c.kind or p_actual_total is null then outcome:='invalid_result';
    else charged:=greatest(1,p_actual_total); end if;
  end if;
  if p_actual_total>r.reserved_input_tokens::bigint+r.reserved_output_tokens::bigint
    or p_actual_input>r.reserved_input_tokens or p_actual_output>r.reserved_output_tokens then
    outcome:='token_overrun'; charged:=greatest(r.accounted_tokens,coalesce(p_actual_total,r.accounted_tokens));
    update public.analysis_runtime_policy set enabled=false where singleton;
  end if;
  update public.analysis_requests set status=outcome,completed_at=now(),accounted_tokens=charged,
    actual_input_tokens=p_actual_input,actual_output_tokens=p_actual_output,actual_total_tokens=p_actual_total where id=r.id;
  if outcome='succeeded' then
    update public.analysis_cache set state='ready',result=p_result,expires_at=now()+cfg.cache_ttl_seconds*interval '1 second',lease_token=null,lease_expires_at=null,updated_at=now() where id=c.id;
  else
    until_time:=case when outcome='rate_limited' then ((date_trunc('day',now() at time zone 'America/Los_Angeles')+interval '1 day') at time zone 'America/Los_Angeles')
      else now()+cfg.failure_cooldown_seconds*interval '1 second' end;
    update public.analysis_cache set state='failed',result=null,lease_token=null,lease_expires_at=null,retry_after=until_time,updated_at=now() where id=c.id;
    update public.analysis_runtime_policy set cooldown_until=greatest(coalesce(cooldown_until,until_time),until_time) where singleton;
  end if;
  return jsonb_build_object('status',outcome);
end;
$$;

revoke all on function public.analysis_safe_result(jsonb),public.analysis_actor_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.analysis_reserve(uuid,uuid,uuid,uuid[],text[],text[],text,text,text,text,text,text,text,text,integer,integer),public.analysis_finish(uuid,uuid,uuid,text,jsonb,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.analysis_reserve(uuid,uuid,uuid,uuid[],text[],text[],text,text,text,text,text,text,text,text,integer,integer),public.analysis_finish(uuid,uuid,uuid,text,jsonb,bigint,bigint,bigint) to service_role;
select pg_notify('pgrst','reload schema');
commit;
