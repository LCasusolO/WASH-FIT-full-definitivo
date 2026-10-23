-- Retirar lector sin convertir permisos de lectura en permisos de edición.
update public.wash_participants set active=false where role='reader' and active;
delete from public.wash_country_members where role='reader';
delete from public.wash_team_members where role='reader';
alter table public.wash_country_members drop constraint wash_country_members_role_check;
alter table public.wash_country_members add constraint wash_country_members_role_check check(role='admin');
alter table public.wash_team_members drop constraint wash_team_members_role_check;
alter table public.wash_team_members add constraint wash_team_members_role_check check(role in ('coordinator','evaluator'));
alter table public.wash_participants add constraint wash_no_active_reader check(role<>'reader' or not active);

alter function wash_private.account_service(text,uuid,jsonb) rename to account_service_v2;
revoke all on function wash_private.account_service_v2(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function wash_private.account_service(p_action text,p_actor uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare base text; candidate text; label text; suffix integer:=2; prior_username text; existing_user uuid;
begin
 if p_action in ('reserve','set_role') then
  if coalesce(p_data->>'role','') not in ('admin','coordinator','evaluator','remove') or (p_action='reserve' and p_data->>'role'='remove') then raise exception 'INVALID_ROLE';end if;
 end if;
 if p_action='reserve' then
  -- Un reintento conserva exactamente el usuario reservado en la primera solicitud.
  select request->>'username' into prior_username from wash_private.account_jobs where id=(p_data->>'request_id')::uuid;
  if prior_username is not null then p_data:=p_data||jsonb_build_object('username',prior_username);
  else
   if p_data->>'role'='admin' then select name into label from public.wash_countries where id=(p_data->>'country_id')::uuid;
   else label:=p_data->>'name';end if;
   label:=trim(both '-' from regexp_replace(translate(lower(coalesce(label,'')),'áéíóúüñàèìòùâêîôûäëïöãõç','aeiouunaeiouaeiouaeioaoc'),'[^a-z0-9]+','-','g'));
   base:=(case p_data->>'role' when 'admin' then 'admin-' when 'coordinator' then 'coordinador-' else 'evaluador-' end)||coalesce(nullif(label,''),'usuario');
   base:=left(base,50);candidate:=base;
   perform pg_advisory_xact_lock(hashtextextended('wash-username:'||base,0));
   select id into existing_user from auth.users where lower(email)=lower(p_data->>'email');
   if existing_user is not null then select username into candidate from public.wash_accounts where user_id=existing_user;
   else
    while exists(select 1 from public.wash_accounts where username=candidate) or exists(select 1 from wash_private.account_jobs where not complete and request->>'username'=candidate) loop
     candidate:=base||'-'||suffix::text;suffix:=suffix+1;
    end loop;
   end if;
   p_data:=p_data||jsonb_build_object('username',candidate);
  end if;
 end if;
 if p_action='reserve' then return wash_private.account_service_v2(p_action,p_actor,p_data)||jsonb_build_object('username',p_data->>'username');end if;
 return wash_private.account_service_v2(p_action,p_actor,p_data);
end $$;
revoke all on function wash_private.account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function wash_private.account_service(text,uuid,jsonb) to service_role;
