-- Todos los borradores editables usan el último guardado aceptado por el servidor.
-- Los permisos, bloqueos de estados y snapshots se comprueban en la cadena existente.
alter function wash_private.command(text,jsonb,uuid) rename to command_before_auto_sync;
revoke all on function wash_private.command_before_auto_sync(text,jsonb,uuid) from public,anon,authenticated,service_role;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wash_records;f uuid;e uuid;k text;replay jsonb;
begin
 if not wash_private.account_ready() then raise exception 'ACCOUNT_SETUP_REQUIRED' using errcode='42501';end if;
 if p_command='save_record' then
  if nullif(p_data->>'id','') is not null then select * into r from public.wash_records where id=(p_data->>'id')::uuid;end if;
  k:=coalesce(r.kind,p_data->>'kind');
  if k in ('general','indicator','action','monitor') then
   e:=coalesce(r.evaluation_id,nullif(p_data->>'evaluation_id','')::uuid);
   f:=coalesce(r.facility_id,nullif(p_data->>'facility_id','')::uuid,(select facility_id from public.wash_evaluations where id=e));
   if k in ('general','indicator') and not exists(select 1 from public.wash_evaluations where id=e and facility_id=f) then raise exception 'INVALID_SOURCE';end if;
   if not wash_private.read_facility(f) or (k in ('general','indicator') and not wash_private.read_evaluation(e)) then raise exception 'FORBIDDEN' using errcode='42501';end if;
   perform pg_advisory_xact_lock(hashtextextended(f::text,0));
   select request->'data' into replay from public.wash_operations where user_id=auth.uid() and operation_id=p_operation and request->>'command'=p_command;
   if found then
    if replay ? 'id' and (not p_data ? 'id' or p_data->>'id'=replay->>'id') then p_data:=p_data||jsonb_build_object('id',replay->'id','version',replay->'version');end if;
   else
    if k in ('general','indicator') then
     if not wash_private.edit_evaluation(e) then raise exception 'FORBIDDEN' using errcode='42501';end if;
    elsif not wash_private.edit_facility(f) then raise exception 'FORBIDDEN' using errcode='42501';end if;
    if r.id is not null then select * into r from public.wash_records where id=r.id for update;
    else
     select * into r from public.wash_records where facility_id=f and kind=k and record_key=p_data->>'record_key' and (k in ('action','monitor') or evaluation_id is not distinct from e) order by updated_at desc,id desc limit 1 for update;
    end if;
    if r.id is not null then p_data:=p_data||jsonb_build_object('id',r.id,'version',r.version);end if;
   end if;
  end if;
 end if;
 return wash_private.command_before_auto_sync(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
