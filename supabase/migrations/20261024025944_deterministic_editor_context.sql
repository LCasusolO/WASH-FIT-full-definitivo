-- Conservar el orden de selección de equipos de las lecturas paginadas anteriores.
-- Comparar versiones por registro evita perder commits con timestamps iguales,
-- transacciones fuera de orden o notificaciones interrumpidas. No cambia escrituras.
create or replace function wash_private.editor_sync(e uuid,known jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ev public.wash_evaluations;f public.wash_facilities;result jsonb;
begin
 if not wash_private.account_ready() or not wash_private.read_evaluation(e) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if known is null then known:='{}';end if;
 if jsonb_typeof(known)<>'object' or octet_length(known::text)>2000000 then raise exception 'INVALID_VERSIONS';end if;
 select * into ev from public.wash_evaluations where id=e;
 select * into f from public.wash_facilities where id=ev.facility_id;
 with visible as materialized (
  select r.* from public.wash_records r where (r.evaluation_id=e and r.kind in ('general','indicator')) or (r.facility_id=ev.facility_id and r.kind in ('action','monitor'))
 ) select jsonb_build_object(
 'evaluation',to_jsonb(ev),'facility',to_jsonb(f),
 'country',(select to_jsonb(c) from public.wash_countries c where c.id=f.country_id),
 'participants',coalesce((select jsonb_agg(to_jsonb(p) order by p.evaluation_id,p.user_id) from public.wash_participants p where p.evaluation_id=e),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.team_id,a.facility_id) from public.wash_assignments a where a.facility_id=ev.facility_id),'[]'),
 'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.team_id,m.user_id) from public.wash_team_members m where m.user_id=auth.uid()),'[]'),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from visible r where known->>r.id::text is distinct from r.version::text),'[]'),
 'removed',coalesce((select jsonb_agg(k) from jsonb_object_keys(known) k where not exists(select 1 from visible r where r.id::text=k)),'[]')
 ) into result;
 return result;
end $$;
