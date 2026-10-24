-- Ruta aditiva para parches: conserva el merge, lock, reintento y validación
-- del guardado actual. Evita capas que solo administran altas y exportaciones.
-- No cambia wash_command ni su protocolo de clientes antiguos.
create function wash_private.save_fields(p_data jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_command constant text:='save_record';r public.wash_records;f uuid;e uuid;k text;replay jsonb;change jsonb;path text[];merged jsonb;
begin
 if not wash_private.account_ready() then raise exception 'ACCOUNT_SETUP_REQUIRED' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_operation is null or octet_length(p_data::text)>12000000 then raise exception 'INVALID_REQUEST';end if;
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
    -- Un reintento usa la misma combinación original, nunca la vuelve a aplicar.
    if p_data ? 'field_changes' and not replay ? 'field_changes' and p_data->'data'=replay->'data' then
     p_data:=p_data-'field_changes';
    elsif p_data ? 'field_changes' and replay->'field_changes'=p_data->'field_changes' then
     p_data:=jsonb_set(p_data,'{data}',replay->'data');
    end if;
    if replay ? 'id' and (not p_data ? 'id' or p_data->>'id'=replay->>'id') then p_data:=p_data||jsonb_build_object('id',replay->'id','version',replay->'version');end if;
   else
    if k in ('general','indicator') then
     if not wash_private.edit_evaluation(e) then raise exception 'FORBIDDEN' using errcode='42501';end if;
    elsif not wash_private.edit_facility(f) then raise exception 'FORBIDDEN' using errcode='42501';end if;
    if r.id is not null then select * into r from public.wash_records where id=r.id for update;
    else
     select * into r from public.wash_records where facility_id=f and kind=k and record_key=p_data->>'record_key' and (k in ('action','monitor') or evaluation_id is not distinct from e) order by updated_at desc,id desc limit 1 for update;
    end if;
    if p_data ? 'field_changes' then
     if jsonb_typeof(p_data->'field_changes')<>'array' or jsonb_array_length(p_data->'field_changes')>512 then raise exception 'INVALID_FIELD_CHANGES';end if;
     merged:=coalesce(r.data,p_data->'data','{}'::jsonb);
     for change in select value from jsonb_array_elements(p_data->'field_changes') loop
      if jsonb_typeof(change->'path') is distinct from 'array' or jsonb_array_length(change->'path') not between 1 and 16 then raise exception 'INVALID_FIELD_PATH';end if;
      if exists(select 1 from jsonb_array_elements(change->'path') x where jsonb_typeof(x)<>'string' or x#>>'{}' in ('__proto__','prototype','constructor')) then raise exception 'INVALID_FIELD_PATH';end if;
      select array_agg(value order by ordinal) into path from jsonb_array_elements_text(change->'path') with ordinality as x(value,ordinal);
      if not (change ? 'value') and change->'remove' is distinct from 'true'::jsonb then raise exception 'INVALID_FIELD_CHANGE';end if;
      merged:=wash_private.set_record_field(merged,path,change->'value',coalesce(change->'remove'='true'::jsonb,false));
     end loop;
     p_data:=jsonb_set(p_data,'{data}',merged);
    end if;
    if r.id is not null then p_data:=p_data||jsonb_build_object('id',r.id,'version',r.version);end if;
   end if;
  end if;
 end if;
 return wash_private.legacy_command(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.save_fields(jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.save_fields(jsonb,uuid) to authenticated;
create function public.wash_command_fields(p_command text,p_data jsonb,p_operation uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select case when p_command='save_record' and p_data ? 'field_changes'
 then wash_private.save_fields(p_data,p_operation)
 else public.wash_command(p_command,p_data,p_operation) end
$$;
revoke all on function public.wash_command_fields(text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.wash_command_fields(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
