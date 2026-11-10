-- ETAPA 5. Solo procedencia; cuotas y GEMINI permanecen deshabilitados.
-- analysis_finish solo recibe simulaciones: no existe transporte real en la aplicación.
begin;
alter table public.analysis_cache add column origin text not null default 'unverified' check(origin in ('unverified','simulated'));
create or replace function public.analysis_finish(p_actor uuid,p_request uuid,p_lease uuid,p_status text,p_result jsonb default null,
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
    update public.analysis_cache set state='ready',origin='simulated',result=p_result,expires_at=now()+cfg.cache_ttl_seconds*interval '1 second',lease_token=null,lease_expires_at=null,updated_at=now() where id=c.id;
  else
    until_time:=case when outcome='rate_limited' then ((date_trunc('day',now() at time zone 'America/Los_Angeles')+interval '1 day') at time zone 'America/Los_Angeles')
      else now()+cfg.failure_cooldown_seconds*interval '1 second' end;
    update public.analysis_cache set state='failed',result=null,lease_token=null,lease_expires_at=null,retry_after=until_time,updated_at=now() where id=c.id;
    update public.analysis_runtime_policy set cooldown_until=greatest(coalesce(cooldown_until,until_time),until_time) where singleton;
  end if;
  return jsonb_build_object('status',outcome);
end;
$$;

select pg_notify('pgrst','reload schema');
commit;
