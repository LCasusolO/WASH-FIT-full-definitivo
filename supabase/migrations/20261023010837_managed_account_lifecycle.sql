-- Auth Admin inserta el usuario y después actualiza app_metadata dentro de la misma transacción.
-- Evaluar al COMMIT y leer la fila actual evita rechazar altas autorizadas.
drop trigger wash_require_managed_account on auth.users;
create or replace function wash_private.managed_user_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users u where u.id=new.id and u.raw_app_meta_data->>'wash_managed'='true') then
  raise exception 'REGISTRATION_CLOSED';
 end if;
 return new;
end $$;
create constraint trigger wash_require_managed_account after insert on auth.users
 deferrable initially deferred for each row execute function wash_private.managed_user_insert();

-- Eliminación recuperable: la identidad se conserva para las referencias históricas.
alter table public.wash_accounts drop constraint wash_accounts_status_check;
alter table public.wash_accounts add constraint wash_accounts_status_check check(status in ('pending','active','suspended','deleted'));
alter function wash_private.account_service(text,uuid,jsonb) rename to account_service_v1;
revoke all on function wash_private.account_service_v1(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function wash_private.account_service(p_action text,p_actor uuid,p_data jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare target public.wash_accounts; uid uuid; previous_access jsonb;
begin
 if p_action='reserve' and exists(select 1 from public.wash_accounts a join auth.users u on u.id=a.user_id where lower(u.email)=lower(p_data->>'email') and a.status='deleted') then
  raise exception 'ACCOUNT_DELETED';
 end if;
 if p_action in ('delete','restore') then
  if not exists(select 1 from public.wash_owners o join public.wash_accounts a on a.user_id=o.user_id join auth.users u on u.id=a.user_id where o.user_id=p_actor and a.status='active' and not a.must_change_password and u.email_confirmed_at is not null) then raise exception 'FORBIDDEN';end if;
  uid:=(p_data->>'user_id')::uuid;
  if uid=p_actor then raise exception 'CANNOT_DELETE_SELF';end if;
  if exists(select 1 from public.wash_owners where user_id=uid) then raise exception 'OWNER_PROTECTED';end if;
  select * into target from public.wash_accounts where user_id=uid for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
  if p_action='delete' then
   if target.status='deleted' then return '{}';end if;
   previous_access:=jsonb_build_object('username',target.username,'countries',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.wash_country_members m where user_id=uid),'teams',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.wash_team_members m where user_id=uid));
   update public.wash_accounts set status='deleted',session_floor=clock_timestamp(),updated_at=now() where user_id=uid;
   delete from public.wash_country_members where user_id=uid;
   delete from public.wash_team_members where user_id=uid;
   update public.wash_participants set active=false where user_id=uid;
   -- El propietario conserva la administración aun si se elimina al último administrador/coordinador.
   insert into wash_private.account_audit(actor,target_id,operation,details) values(p_actor,uid,'delete',previous_access);
  else
   if target.status<>'deleted' then raise exception 'ACCOUNT_NOT_DELETED';end if;
   update public.wash_accounts set status='active',must_change_password=true,session_floor=clock_timestamp(),updated_at=now() where user_id=uid;
   insert into wash_private.account_audit(actor,target_id,operation) values(p_actor,uid,'restore');
  end if;
  return '{}';
 end if;
 if p_action in ('set_role','provision','reset_begin','suspend','reactivate','rename') and exists(select 1 from public.wash_accounts where user_id=nullif(p_data->>'user_id','')::uuid and status='deleted') then raise exception 'ACCOUNT_DELETED';end if;
 return wash_private.account_service_v1(p_action,p_actor,p_data);
end $$;
revoke all on function wash_private.account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function wash_private.account_service(text,uuid,jsonb) to service_role;
revoke all on function wash_private.managed_user_insert() from public,anon,authenticated;
