-- Identificación asignada en servidor, serializada por establecimiento e idempotente.
-- Las mediciones existentes y sus snapshots conservan sus nombres.
alter function wash_private.command(text,jsonb,uuid) rename to command_before_evaluation_codes;
revoke all on function wash_private.command_before_evaluation_codes(text,jsonb,uuid) from public,anon,authenticated,service_role;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare facility uuid; generated_name text; sequence_number bigint;
begin
 if p_command='evaluation' then
  facility:=nullif(p_data->>'facility_id','')::uuid;
  if facility is not null then perform pg_advisory_xact_lock(hashtextextended(facility::text,0));end if;
  select request->'data'->>'name' into generated_name from public.wash_operations
   where user_id=auth.uid() and operation_id=p_operation and request->>'command'='evaluation';
  if generated_name is null then
   if p_data->>'kind'='reassessment' then
    select greatest(count(*),coalesce(max(case when name ~ '^Reeval-[0-9]{1,12}$' then substring(name from 8)::bigint end),0))+1
     into sequence_number from public.wash_evaluations where facility_id=facility and kind='reassessment';
    generated_name:='Reeval-'||lpad(sequence_number::text,greatest(3,length(sequence_number::text)),'0');
   else generated_name:='Evaluación inicial';end if;
  end if;
  p_data:=p_data||jsonb_build_object('name',generated_name);
 end if;
 return wash_private.command_before_evaluation_codes(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
