-- Exportar el monitoreo como sección independiente, sin alterar mediciones validadas.
alter function wash_private.command(text,jsonb,uuid) rename to command_before_original_steps;
revoke all on function wash_private.command_before_original_steps(text,jsonb,uuid) from public,anon,authenticated;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; replay boolean;
begin
 replay:=exists(select 1 from public.wash_operations where user_id=auth.uid() and operation_id=p_operation);
 result:=wash_private.command_before_original_steps(p_command,p_data,p_operation);
 if p_command='export' and not replay and nullif(p_data->>'evaluation_id','') is not null then
  update public.wash_snapshots s set data=s.data||jsonb_build_object('monitoring_cut_at',s.created_at,'monitoring',
   (select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at),'[]') from public.wash_records r where r.facility_id=s.facility_id and r.kind='monitor' and wash_private.read_record(r.id)))
  from public.wash_exports x where x.id=(result->>'id')::uuid and x.created_by=auth.uid() and s.id=x.snapshot_id and s.purpose='export' and not (s.data ? 'monitoring_cut_at');
 end if;
 return result;
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
