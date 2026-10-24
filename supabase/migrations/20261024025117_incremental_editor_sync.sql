-- Comparar versiones por registro evita perder commits con timestamps iguales,
-- transacciones fuera de orden o notificaciones interrumpidas. No cambia escrituras.
create function wash_private.editor_sync(e uuid,known jsonb) returns jsonb
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
 'participants',coalesce((select jsonb_agg(to_jsonb(p)) from public.wash_participants p where p.evaluation_id=e),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.wash_assignments a where a.facility_id=ev.facility_id),'[]'),
 'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.wash_team_members m where m.user_id=auth.uid()),'[]'),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from visible r where known->>r.id::text is distinct from r.version::text),'[]'),
 'removed',coalesce((select jsonb_agg(k) from jsonb_object_keys(known) k where not exists(select 1 from visible r where r.id::text=k)),'[]')
 ) into result;
 return result;
end $$;
revoke all on function wash_private.editor_sync(uuid,jsonb) from public,anon,service_role;
grant execute on function wash_private.editor_sync(uuid,jsonb) to authenticated;
create function public.wash_editor_sync(p_evaluation uuid,p_known jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$select wash_private.editor_sync(p_evaluation,p_known)$$;
revoke all on function public.wash_editor_sync(uuid,jsonb) from public,anon,service_role;
grant execute on function public.wash_editor_sync(uuid,jsonb) to authenticated;

create function public.wash_facility_progress(p_facilities uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select wash_private.batch_progress(coalesce(array_agg(id),'{}'::uuid[])) from public.wash_evaluations
 where status<>'validated' and facility_id=any(p_facilities)
$$;
revoke all on function public.wash_facility_progress(uuid[]) from public,anon,service_role;
grant execute on function public.wash_facility_progress(uuid[]) to authenticated;

-- Huella de identidades/versiones: un respaldo descubre notificaciones perdidas
-- sin recalcular la comprobación de todo el país. Incluye borrados y participantes.
create function wash_private.progress_sync(requested uuid[],known jsonb,scope uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
with fac as materialized (
 select f.id from public.wash_facilities f where (select wash_private.account_ready()) and f.id=any(requested) and wash_private.read_facility(f.id)
), ev as materialized (
 select e.id,e.facility_id,e.version,e.team_id from public.wash_evaluations e join fac f on f.id=e.facility_id where e.status<>'validated' and wash_private.read_evaluation(e.id)
), revisions as materialized (
 select f.id,md5(
 coalesce((select string_agg(r.id::text||':'||r.version::text,',' order by r.id) from public.wash_records r where r.facility_id=f.id and (r.kind in ('action','monitor') or r.evaluation_id in(select id from ev where facility_id=f.id))),'')||'#'||
 coalesce((select string_agg(e.id::text||':'||e.version::text||':'||e.team_id::text,',' order by e.id) from ev e where e.facility_id=f.id),'')||'#'||
 coalesce((select string_agg(p.evaluation_id::text||':'||p.user_id::text||':'||p.role||':'||p.active::text,',' order by p.evaluation_id,p.user_id) from public.wash_participants p join ev e on e.id=p.evaluation_id where e.facility_id=f.id),'')
 ) as revision from fac f
), removed as materialized (
 select k from jsonb_object_keys(coalesce(known,'{}')) k where (scope is null or k=any(array(select s::text from unnest(scope) s))) and not exists(select 1 from fac where id::text=k)
), changed as materialized (
 select id::text as id from revisions where known->>id::text is distinct from revision union all select k from removed
)
select jsonb_build_object('revisions',coalesce((select jsonb_object_agg(id,revision) from revisions),'{}'),
 'changed',coalesce((select jsonb_agg(id) from changed),'[]'),
 'progress',wash_private.batch_progress(coalesce((select array_agg(id) from ev where facility_id::text in(select id from changed)),'{}'::uuid[])))
$$;
revoke all on function wash_private.progress_sync(uuid[],jsonb,uuid[]) from public,anon,service_role;
grant execute on function wash_private.progress_sync(uuid[],jsonb,uuid[]) to authenticated;
create function public.wash_progress_sync(p_known jsonb default '{}',p_facilities uuid[] default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select wash_private.progress_sync(coalesce(array_agg(id),'{}'::uuid[]),p_known,p_facilities) from public.wash_facilities where p_facilities is null or id=any(p_facilities)
$$;
revoke all on function public.wash_progress_sync(jsonb,uuid[]) from public,anon,service_role;
grant execute on function public.wash_progress_sync(jsonb,uuid[]) to authenticated;
