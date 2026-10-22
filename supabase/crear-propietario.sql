-- Ejecutar manualmente en SQL Editor después de crear y verificar tu cuenta.
-- Reemplaza solamente el correo. No introduzcas aquí ninguna contraseña.
do $$
declare account_id uuid;
begin
  select id into account_id from auth.users
  where lower(email)=lower('REEMPLAZAR_POR_TU_CORREO') and email_confirmed_at is not null;
  if account_id is null then
    raise exception 'Primero crea y verifica la cuenta con ese correo en Authentication > Users.';
  end if;
  insert into public.wash_owners(user_id) values(account_id) on conflict do nothing;
end $$;
