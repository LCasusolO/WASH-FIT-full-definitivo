-- Una sola subida activa por establecimiento, compartida por todas las cuentas.
-- No se mantienen transacciones abiertas mientras Google recibe los archivos.
create table wash_private.archive_leases (
 facility_id uuid primary key references public.wash_facilities(id) on delete cascade,
 export_id uuid not null references public.wash_exports(id) on delete cascade,
 batch uuid not null,
 expires_at timestamptz not null
);
create index archive_leases_export on wash_private.archive_leases(export_id);
alter table wash_private.archive_leases enable row level security;
revoke all on wash_private.archive_leases from public,anon,authenticated,service_role;
alter function wash_private.command(text,jsonb,uuid) rename to command_before_shared_archive;
revoke all on function wash_private.command_before_shared_archive(text,jsonb,uuid) from public,anon,authenticated,service_role;
create function wash_private.command(p_command text,p_data jsonb,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.wash_exports; lease wash_private.archive_leases; t timestamptz:=clock_timestamp();
begin
 if p_command in ('archive_acquire','archive_renew','archive_release') then
  if not wash_private.account_ready() then raise exception 'ACCOUNT_SETUP_REQUIRED' using errcode='42501';end if;
  select * into job from public.wash_exports where id=(p_data->>'export_id')::uuid and created_by=auth.uid();
  if job.id is null or not wash_private.read_facility(job.facility_id) or not exists(
   select 1 from public.wash_snapshots s where s.id=job.snapshot_id and
   case when s.evaluation_id is not null then wash_private.read_evaluation(s.evaluation_id) else wash_private.read_facility(s.facility_id) end
  ) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if p_operation is null then raise exception 'INVALID_OPERATION';end if;
  perform pg_advisory_xact_lock(hashtextextended('archive:'||job.facility_id::text,0));
  select * into lease from wash_private.archive_leases where facility_id=job.facility_id;
  if p_command='archive_acquire' then
   if lease.expires_at>t and (lease.batch<>p_operation or lease.export_id<>job.id) then return jsonb_build_object('busy',true);end if;
   insert into wash_private.archive_leases values(job.facility_id,job.id,p_operation,t+interval '2 minutes')
   on conflict(facility_id) do update set export_id=excluded.export_id,batch=excluded.batch,expires_at=excluded.expires_at;
  elsif lease.batch is distinct from p_operation or lease.export_id is distinct from job.id or lease.expires_at<=t then
   return jsonb_build_object('expired',true);
  elsif p_command='archive_release' then
   delete from wash_private.archive_leases where facility_id=job.facility_id;
  else
   update wash_private.archive_leases set expires_at=t+interval '2 minutes' where facility_id=job.facility_id;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return wash_private.command_before_shared_archive(p_command,p_data,p_operation);
end $$;
revoke all on function wash_private.command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
