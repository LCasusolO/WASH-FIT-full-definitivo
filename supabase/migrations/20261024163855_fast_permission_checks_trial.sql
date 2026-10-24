-- Prueba aislada a las identidades ficticias firmadas de carga.
-- Las cuentas reales conservan los predicados anteriores hasta la promoción.
create function wash_private.read_evaluation_before_flat(e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_evaluations v join public.wash_facilities f on f.id=v.facility_id where v.id=e and (wash_private.admin(f.country_id) or exists(select 1 from public.wash_country_members where country_id=f.country_id and user_id=auth.uid()) or exists(select 1 from public.wash_participants where evaluation_id=e and user_id=auth.uid() and active)))
$$;
create function wash_private.read_facility_before_flat(f uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_facilities x where x.id=f and (wash_private.admin(x.country_id) or exists(select 1 from public.wash_country_members where country_id=x.country_id and user_id=auth.uid()) or exists(select 1 from public.wash_assignments a where a.facility_id=f and wash_private.team_member(a.team_id)) or exists(select 1 from public.wash_evaluations e join public.wash_participants p on p.evaluation_id=e.id where e.facility_id=f and p.user_id=auth.uid() and p.active)))
$$;
create function wash_private.read_evaluation_flat(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with me as materialized(select auth.uid() as uid)
 select exists(select 1 from public.wash_evaluations v join public.wash_facilities f on f.id=v.facility_id cross join me
 where v.id=p_id and (
 exists(select 1 from public.wash_owners o where o.user_id=me.uid)
 or exists(select 1 from public.wash_country_members m where m.country_id=f.country_id and m.user_id=me.uid)
 or exists(select 1 from public.wash_participants p where p.evaluation_id=v.id and p.user_id=me.uid and p.active)))
$$;
create function wash_private.read_facility_flat(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with me as materialized(select auth.uid() as uid)
 select exists(select 1 from public.wash_facilities f cross join me where f.id=p_id and (
 exists(select 1 from public.wash_owners o where o.user_id=me.uid)
 or exists(select 1 from public.wash_country_members m where m.country_id=f.country_id and m.user_id=me.uid)
 or exists(select 1 from public.wash_assignments a join public.wash_team_members m on m.team_id=a.team_id where a.facility_id=f.id and m.user_id=me.uid)
 or exists(select 1 from public.wash_evaluations e join public.wash_participants p on p.evaluation_id=e.id where e.facility_id=f.id and p.user_id=me.uid and p.active)))
$$;
revoke all on function wash_private.read_evaluation_before_flat(uuid),wash_private.read_facility_before_flat(uuid),wash_private.read_evaluation_flat(uuid),wash_private.read_facility_flat(uuid) from public,anon,authenticated,service_role;
-- CREATE OR REPLACE conserva los OID que referencian las políticas RLS.
create or replace function wash_private.read_evaluation(e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when auth.jwt()->'app_metadata'->>'capacity_run'='coord20261024d'
 then wash_private.read_evaluation_flat(e) else wash_private.read_evaluation_before_flat(e) end
$$;
create or replace function wash_private.read_facility(f uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when auth.jwt()->'app_metadata'->>'capacity_run'='coord20261024d'
 then wash_private.read_facility_flat(f) else wash_private.read_facility_before_flat(f) end
$$;
