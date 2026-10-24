-- Las mediciones históricas en revisión siguen siendo En curso. No se reabren
-- versiones validadas ni se alteran los bloqueos de registros de monitoreo.
create or replace function wash_private.edit_evaluation(e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wash_evaluations v join public.wash_participants p on p.evaluation_id=v.id
 where v.id=e and v.status in ('draft','editing','review') and p.user_id=auth.uid() and p.active and p.role in ('coordinator','evaluator'))
$$;
