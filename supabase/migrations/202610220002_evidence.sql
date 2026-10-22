begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wash-evidence','wash-evidence',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create function wash_private.evidence_access(path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare f uuid; e uuid;
begin
 if path !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}\.(jpeg|png|webp)$' then return false; end if;
 f:=split_part(path,'/',1)::uuid; e:=split_part(path,'/',2)::uuid;
 if exists(select 1 from public.wash_evaluations where id=e and facility_id=f) then
   return case when writing then wash_private.edit_evaluation(e) else wash_private.read_evaluation(e) end;
 end if;
 if exists(select 1 from public.wash_records where id=e and facility_id=f and kind='monitor') then
   return case when writing then wash_private.edit_facility(f) and exists(select 1 from public.wash_records where id=e and status='draft') else wash_private.read_facility(f) end;
 end if;
 return false;
exception when invalid_text_representation then return false;
end $$;
revoke all on function wash_private.evidence_access(text,boolean) from public,anon;
grant execute on function wash_private.evidence_access(text,boolean) to authenticated;
create policy wash_evidence_read on storage.objects for select to authenticated using(bucket_id='wash-evidence' and wash_private.evidence_access(name,false));
create policy wash_evidence_upload on storage.objects for insert to authenticated with check(bucket_id='wash-evidence' and wash_private.evidence_access(name,true));
-- Sin UPDATE/DELETE desde el navegador: las versiones validadas conservan sus evidencias.
commit;
