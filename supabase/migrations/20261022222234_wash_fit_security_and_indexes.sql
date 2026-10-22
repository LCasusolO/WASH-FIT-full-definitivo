-- La API pública conserva el contrato, con privilegios del llamante.
-- La implementación privilegiada queda fuera de los esquemas expuestos.
alter function public.wash_command(text,jsonb,uuid) set schema wash_private;
alter function wash_private.wash_command(text,jsonb,uuid) rename to command;
revoke all on function wash_private.command(text,jsonb,uuid) from public, anon;
grant execute on function wash_private.command(text,jsonb,uuid) to authenticated;
create function public.wash_command(p_command text,p_data jsonb,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select wash_private.command(p_command,p_data,p_operation)
$$;
revoke all on function public.wash_command(text,jsonb,uuid) from public,anon;
grant execute on function public.wash_command(text,jsonb,uuid) to authenticated;
comment on function public.wash_command(text,jsonb,uuid) is 'API sin privilegios propios. La implementación privada valida identidad, alcance, estado, versión e idempotencia.';

-- Denegación explícita: los recibos de operaciones solo los consulta el servidor SQL.
create policy operation_deny_direct on public.wash_operations for all
to authenticated using(false) with check(false);
revoke all on public.wash_operations from anon,authenticated;
alter table wash_private.catalog_keys enable row level security;

-- Evaluar la identidad una vez por consulta, sin cambiar el alcance de las políticas.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname,qual from pg_policies
    where schemaname='public' and tablename like 'wash_%' and qual like '%auth.uid()%'
  loop
    execute format('alter policy %I on %I.%I using (%s)',p.policyname,p.schemaname,p.tablename,replace(p.qual,'auth.uid()','(select auth.uid())'));
  end loop;
end $$;

create index wash_events_facility_date on public.wash_events(facility_id,created_at desc);
create index wash_snapshots_evaluation_date on public.wash_snapshots(evaluation_id,purpose,created_at desc);
create index wash_exports_author_date on public.wash_exports(created_by,created_at desc);
create index wash_evaluations_facility_date on public.wash_evaluations(facility_id,updated_at desc);

-- Cubrir las claves foráneas aún no indexadas. Todas las FK de wash_* son de una columna.
do $$ declare fk record; begin
  for fk in
    select c.conname,n.nspname,t.relname,a.attname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
    where c.contype='f' and n.nspname='public' and t.relname like 'wash_%'
      and cardinality(c.conkey)=1
      and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indkey[0]=c.conkey[1])
  loop
    execute format('create index %I on %I.%I(%I)',fk.conname||'_idx',fk.nspname,fk.relname,fk.attname);
  end loop;
end $$;
