-- =============================================================
-- The James — migração: login por e-mail (magic link) -> usuário + senha
-- Para bancos que já rodaram o schema.sql antigo. Instalações novas não
-- precisam deste arquivo (o schema.sql atual já cria tudo).
--
-- COMO USAR:
-- 1. No painel do Supabase, em Authentication -> Users, APAGUE os usuários
--    antigos criados na época do magic link (o e-mail deles não serve mais
--    para o novo login e o site ainda não tem dados a preservar).
-- 2. Rode este arquivo inteiro no SQL Editor.
-- 3. Crie os integrantes (usuário = nome em minúsculas sem acentos,
--    senha inicial = telefone com 9 dígitos), um por linha:
--
--      select public.admin_create_member('Cláudio', '999999999');
--      -- retorna o usuário criado, ex.: "claudio"
--      -- opcional: 3º parâmetro = instrumento, 4º = usuário explícito
--      -- select public.admin_create_member('João Silva', '988887777', 'baixo', 'joao');
--
-- 4. Table Editor -> members: marque is_admin = true na sua linha.
-- 5. Authentication -> Sign In / Up: "Allow new users to sign up" continua
--    DESATIVADO; o provedor Email continua ATIVADO (é ele que valida a senha).
--    A configuração de SMTP/Resend e os templates de e-mail não são mais usados.
-- =============================================================

-- pgcrypto (crypt/gen_salt) — usado para gravar as senhas.
create extension if not exists pgcrypto with schema extensions;

-- ---------- coluna username em members ----------

create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select regexp_replace(
    lower(translate(p,
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]', '', 'g')
$$;

alter table public.members add column if not exists username text;
update public.members set username = public.slugify(name) where username is null;
alter table public.members alter column username set not null;
alter table public.members add constraint members_username_key unique (username);

-- ---------- trigger de novo usuário (agora preenche username e nome) ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (id, email, username, name)
  values (new.id, new.email, split_part(new.email, '@', 1),
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- funções de administração (só via SQL Editor) ----------

create or replace function public.admin_create_member(
  p_name text, p_phone text, p_instrument text default null, p_username text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid := gen_random_uuid();
  v_username text := coalesce(p_username, public.slugify(p_name));
  v_email    text := v_username || '@thejames.local';
begin
  if v_username = '' then raise exception 'Nome/usuário inválido.'; end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'O usuário "%" já existe.', v_username;
  end if;

  -- Campos de token com '' (e não null) evitam erros conhecidos do GoTrue.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_phone, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name), now(), now(), '', '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());

  -- O trigger on_auth_user_created já criou a linha em members.
  update public.members
  set name = p_name, instrument = coalesce(p_instrument, instrument)
  where id = v_id;

  return v_username;
end $$;

create or replace function public.admin_set_password(p_username text, p_new_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where email = p_username || '@thejames.local';
  if not found then raise exception 'Usuário "%" não encontrado.', p_username; end if;
end $$;

revoke execute on function public.admin_create_member(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.admin_set_password(text, text)
  from public, anon, authenticated;
