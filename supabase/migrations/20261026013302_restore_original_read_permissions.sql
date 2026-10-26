-- El ensayo no aprueba la condición de publicación. Se restaura la ruta anterior.
-- Se conservan OID, permisos y los predicados originales de las políticas RLS.
create or replace function wash_private.read_evaluation(e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_evaluations v join public.wash_facilities f on f.id=v.facility_id where v.id=e and (wash_private.admin(f.country_id) or exists(select 1 from public.wash_country_members where country_id=f.country_id and user_id=auth.uid()) or exists(select 1 from public.wash_participants where evaluation_id=e and user_id=auth.uid() and active)))
$$;
create or replace function wash_private.read_facility(f uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_facilities x where x.id=f and (wash_private.admin(x.country_id) or exists(select 1 from public.wash_country_members where country_id=x.country_id and user_id=auth.uid()) or exists(select 1 from public.wash_assignments a where a.facility_id=f and wash_private.team_member(a.team_id)) or exists(select 1 from public.wash_evaluations e join public.wash_participants p on p.evaluation_id=e.id where e.facility_id=f and p.user_id=auth.uid() and p.active)))
$$;
notify pgrst,'reload schema';
