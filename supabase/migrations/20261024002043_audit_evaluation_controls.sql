-- Identidad compartida del reporte y corrección reservada a la administración.
alter function wash_private.command(text,jsonb,uuid) rename to command_before_evaluation_audit;
revoke all on function wash_private.command_before_evaluation_audit(text,jsonb,uuid) from public,anon,authenticated,service_role;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ev public.wash_evaluations; job public.wash_exports; facility public.wash_facilities; evaluation_id uuid; sequence_number bigint;
begin
 if not wash_private.account_ready() then raise exception 'ACCOUNT_SETUP_REQUIRED' using errcode='42501';end if;
 if p_command='evaluation_status' and p_data->>'status'='editing' then
  select * into ev from public.wash_evaluations where id=(p_data->>'evaluation_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(ev.facility_id::text,0));
  select * into ev from public.wash_evaluations where id=(p_data->>'evaluation_id')::uuid for update;
  if ev.status='validated' and not wash_private.admin((select country_id from public.wash_facilities where id=ev.facility_id)) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 end if;
 if p_command='export_identity' then
  select * into job from public.wash_exports where id=(p_data->>'export_id')::uuid and created_by=auth.uid();
  select * into facility from public.wash_facilities where id=job.facility_id;
  select s.evaluation_id into evaluation_id from public.wash_snapshots s where s.id=job.snapshot_id;
  if job.id is null or not wash_private.read_facility(job.facility_id) or (evaluation_id is not null and not wash_private.read_evaluation(evaluation_id)) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  select * into ev from public.wash_evaluations where id=evaluation_id;
  if ev.kind='reassessment' then
   if ev.name ~ '^(Reeval-|Reevaluación )[0-9]{1,12}$' then sequence_number:=substring(ev.name from '([0-9]+)$')::bigint;
   else select count(*) into sequence_number from public.wash_evaluations other where other.facility_id=ev.facility_id and other.kind='reassessment' and (other.created_at,other.id)<=(ev.created_at,ev.id);end if;
  end if;
  return jsonb_build_object('facility_id',facility.id,'facilityName',facility.name,'countryCode',(select code from public.wash_countries where id=facility.country_id),'evaluation',case when ev.id is not null then jsonb_build_object('id',ev.id,'kind',ev.kind,'name',ev.name,'sequence',sequence_number) else null end);
 end if;
 return wash_private.command_before_evaluation_audit(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
