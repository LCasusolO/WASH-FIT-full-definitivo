-- Asignación y transferencia juntas: ningún acceso parcial si falla la operación.
alter function wash_private.command(text,jsonb,uuid) rename to command_before_country_transfer;
revoke all on function wash_private.command_before_country_transfer(text,jsonb,uuid) from public,anon,authenticated,service_role;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.wash_evaluations; facility uuid; country uuid; target_team uuid;
begin
 if p_command='transfer_evaluation' then
  if not wash_private.account_ready() then raise exception 'ACCOUNT_SETUP_REQUIRED' using errcode='42501';end if;
  -- La implementación anterior comprueba la identidad de la petición en reintentos.
  if exists(select 1 from public.wash_operations where user_id=auth.uid() and operation_id=p_operation) then
   return wash_private.command_before_country_transfer(p_command,p_data,p_operation);
  end if;
  select facility_id into facility from public.wash_evaluations where id=(p_data->>'evaluation_id')::uuid;
  if facility is null then raise exception 'NOT_FOUND';end if;
  perform pg_advisory_xact_lock(hashtextextended(facility::text,0));
  if exists(select 1 from public.wash_operations where user_id=auth.uid() and operation_id=p_operation) then
   return wash_private.command_before_country_transfer(p_command,p_data,p_operation);
  end if;
  select * into v from public.wash_evaluations where id=(p_data->>'evaluation_id')::uuid for update;
  select country_id into country from public.wash_facilities where id=facility;
  target_team:=nullif(p_data->>'team_id','')::uuid;
  if not wash_private.admin(country) or not exists(select 1 from public.wash_teams where id=target_team and country_id=country and active)
    or not exists(select 1 from public.wash_team_members where team_id=target_team and role='coordinator') then
   raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if v.version is distinct from (p_data->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
  if v.team_id=target_team then raise exception 'TEAM_ALREADY_RESPONSIBLE';end if;
  insert into public.wash_assignments(team_id,facility_id) values(target_team,facility) on conflict do nothing;
 end if;
 return wash_private.command_before_country_transfer(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
