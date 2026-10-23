-- Retirar la identidad de acceso sin eliminar autores ni mediciones históricas.
create table wash_private.account_retirements(
 user_id uuid primary key references public.wash_accounts(user_id),
 actor uuid not null references auth.users(id),
 original_username text not null, original_email text not null,
 release_email text not null unique, was_admin boolean not null default false, country_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(), released_at timestamptz
);
create index account_retirements_actor on wash_private.account_retirements(actor);
alter table wash_private.account_retirements enable row level security;
create policy deny_retirements on wash_private.account_retirements to authenticated using(false) with check(false);
revoke all on wash_private.account_retirements from public,anon,authenticated,service_role;

create function wash_private.can_retire_account(p_actor uuid,p_target uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare scopes uuid[];
begin
 if p_actor is null or p_target is null or p_actor=p_target then return false;end if;
 if not exists(select 1 from public.wash_accounts a join auth.users u on u.id=a.user_id where a.user_id=p_actor and a.status='active' and not a.must_change_password and u.email_confirmed_at is not null) then return false;end if;
 if exists(select 1 from public.wash_owners where user_id=p_target) then return false;end if;
 if exists(select 1 from public.wash_owners where user_id=p_actor) then return true;end if;
 if exists(select 1 from wash_private.account_retirements where user_id=p_target and was_admin) or exists(select 1 from public.wash_country_members where user_id=p_target and role='admin') then return false;end if;
 select country_ids into scopes from wash_private.account_retirements where user_id=p_target;
 if not found then
  select array_agg(distinct country_id) into scopes from (
   select country_id from public.wash_country_members where user_id=p_target
   union select t.country_id from public.wash_team_members m join public.wash_teams t on t.id=m.team_id where m.user_id=p_target
  ) x;
 end if;
 return coalesce(cardinality(scopes),0)>0 and not exists(select 1 from unnest(scopes) c where not exists(select 1 from public.wash_country_members m where m.user_id=p_actor and m.country_id=c and m.role='admin'));
end $$;
revoke all on function wash_private.can_retire_account(uuid,uuid) from public,anon,authenticated,service_role;

alter function wash_private.account_service(text,uuid,jsonb) rename to account_service_before_reusable_delete;
revoke all on function wash_private.account_service_before_reusable_delete(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function wash_private.account_service(p_action text,p_actor uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; target public.wash_accounts; retired wash_private.account_retirements; result jsonb; entry jsonb; items jsonb:='[]'; scopes uuid[]; c uuid; alias text; suffix integer:=0; own boolean;
begin
 if p_action in ('delete','delete_complete') then
  uid:=nullif(p_data->>'user_id','')::uuid;
  if uid=p_actor then raise exception 'CANNOT_DELETE_SELF';end if;
  if exists(select 1 from public.wash_owners where user_id=uid) then raise exception 'OWNER_PROTECTED';end if;
  select * into target from public.wash_accounts where user_id=uid for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
  if not wash_private.can_retire_account(p_actor,uid) then raise exception 'FORBIDDEN';end if;
  select * into retired from wash_private.account_retirements where user_id=uid;
  if p_action='delete' then
   if not found then
    select array_agg(distinct country_id) into scopes from (
     select country_id from public.wash_country_members where user_id=uid
     union select t.country_id from public.wash_team_members m join public.wash_teams t on t.id=m.team_id where m.user_id=uid
    ) x;
    alias:='deleted-'||replace(uid::text,'-','')||'@accounts.washfit.invalid';
    while exists(select 1 from auth.users where lower(email)=alias and id<>uid) loop suffix:=suffix+1;alias:='deleted-'||replace(uid::text,'-','')||'-'||suffix||'@accounts.washfit.invalid';end loop;
    insert into wash_private.account_retirements(user_id,actor,original_username,original_email,release_email,was_admin,country_ids)
     select uid,p_actor,target.username,u.email,alias,exists(select 1 from public.wash_country_members where user_id=uid and role='admin'),coalesce(scopes,'{}') from auth.users u where u.id=uid returning * into retired;
    update public.wash_accounts set status='deleted',must_change_password=true,session_floor=clock_timestamp(),updated_at=now() where user_id=uid;
    delete from public.wash_country_members where user_id=uid;
    delete from public.wash_team_members where user_id=uid;
    update public.wash_participants set active=false where user_id=uid;
    if cardinality(retired.country_ids)=0 then
     insert into wash_private.account_audit(actor,target_id,operation,details) values(p_actor,uid,'delete',jsonb_build_object('username',retired.original_username,'identity_release_pending',true));
    else foreach c in array retired.country_ids loop
     insert into wash_private.account_audit(actor,target_id,country_id,operation,details) values(p_actor,uid,c,'delete',jsonb_build_object('username',retired.original_username,'identity_release_pending',true));
    end loop;end if;
   end if;
   return jsonb_build_object('release_email',retired.release_email,'complete',retired.released_at is not null);
  end if;
  if retired.user_id is null then raise exception 'DELETE_NOT_STARTED';end if;
  if retired.released_at is not null then return '{}';end if;
  -- Auth Admin debe haber confirmado primero el cambio de correo y bloqueo.
  if not exists(select 1 from auth.users where id=uid and lower(email)=retired.release_email) then raise exception 'DELETE_AUTH_PENDING';end if;
  alias:='deleted-'||replace(uid::text,'-','');suffix:=0;
  while exists(select 1 from public.wash_accounts where username=alias and user_id<>uid) loop suffix:=suffix+1;alias:='deleted-'||replace(uid::text,'-','')||'-'||suffix;end loop;
  update public.wash_accounts set username=alias,status='deleted',must_change_password=true,session_floor=clock_timestamp(),updated_at=now() where user_id=uid;
  delete from public.wash_country_members where user_id=uid;
  delete from public.wash_team_members where user_id=uid;
  update public.wash_participants set active=false where user_id=uid;
  update wash_private.account_retirements set released_at=now() where user_id=uid;
  insert into wash_private.account_audit(actor,target_id,country_id,operation,details)
   select p_actor,uid,country_scope.country_id,'delete_complete',jsonb_build_object('username',retired.original_username,'identity_released',true)
   from unnest(case when cardinality(retired.country_ids)=0 then array[null::uuid] else retired.country_ids end) as country_scope(country_id);
  return '{}';
 end if;
 if p_action='restore' and exists(select 1 from wash_private.account_retirements where user_id=nullif(p_data->>'user_id','')::uuid) then raise exception 'ACCOUNT_RETIRED';end if;
 result:=wash_private.account_service_before_reusable_delete(p_action,p_actor,p_data);
 if p_action='list' then
  own:=exists(select 1 from public.wash_owners where user_id=p_actor);
  -- Permitir reintentar una eliminación interrumpida aun después de retirar sus membresías.
  if not own then
   select result||coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'username',r.original_username,'full_name',a.full_name,'status',a.status,'must_change_password',false,'email',r.original_email,'email_confirmed',false,'is_owner',false,'countries','[]'::jsonb,'teams','[]'::jsonb)),'[]') into result
   from wash_private.account_retirements r join public.wash_accounts a on a.user_id=r.user_id
   where a.status='deleted' and wash_private.can_retire_account(p_actor,a.user_id) and not exists(select 1 from jsonb_array_elements(result) x where x->>'user_id'=a.user_id::text);
  end if;
  for entry in select * from jsonb_array_elements(result) loop
   uid:=(entry->>'user_id')::uuid;select * into retired from wash_private.account_retirements where user_id=uid;
   entry:=entry||jsonb_build_object('can_delete',wash_private.can_retire_account(p_actor,uid),'identity_released',retired.released_at is not null);
   if retired.user_id is not null then entry:=entry||jsonb_build_object('username',retired.original_username,'email',retired.original_email,'must_change_password',false);end if;
   items:=items||jsonb_build_array(entry);
  end loop;
  return items;
 end if;
 return result;
end $$;
revoke all on function wash_private.account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function wash_private.account_service(text,uuid,jsonb) to service_role;
