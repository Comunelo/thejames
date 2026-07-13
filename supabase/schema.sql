-- =============================================================
-- The James — esquema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- =============================================================

-- pgcrypto (crypt/gen_salt) — usado para gravar as senhas dos integrantes.
create extension if not exists pgcrypto with schema extensions;

-- ---------- TABELAS ----------

-- Integrantes da banda (1 linha por usuário do Supabase Auth).
-- O login é usuário + senha: o usuário é o nome "slugificado" e o e-mail
-- em auth.users é sintético (<usuario>@thejames.local) — nunca recebe nada.
create table public.members (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text unique not null,
  username   text unique not null,
  name       text not null,
  instrument text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Repertório da banda.
create table public.songs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  artist       text not null,
  spotify_url  text,
  status       text not null default 'ativa' check (status in ('ativa','aposentada')),
  from_poll_id uuid,
  added_at     timestamptz not null default now()
);

-- Shows.
create table public.shows (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  venue          text not null,
  city           text not null,
  notes          text,
  is_public      boolean not null default true,
  setlist_public boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Setlist de cada show (ordenada).
create table public.show_songs (
  show_id  uuid not null references public.shows(id) on delete cascade,
  song_id  uuid not null references public.songs(id) on delete cascade,
  position int  not null,
  primary key (show_id, song_id)
);

-- Músicas candidatas (caixa de sugestões).
create table public.candidates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  artist       text not null,
  spotify_url  text,
  note         text,
  suggested_by uuid references public.members(id) on delete set null,
  status       text not null default 'sugerida'
               check (status in ('sugerida','em_votacao','aprovada','arquivada')),
  created_at   timestamptz not null default now()
);

-- Votações.
create table public.polls (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  num_winners int  not null check (num_winners > 0),
  deadline    timestamptz not null,
  status      text not null default 'aberta' check (status in ('aberta','encerrada')),
  created_by  uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Candidatas em cada votação.
-- added_at: null = presente desde a abertura; preenchido = adicionada
-- depois via add_poll_candidates (o front avisa no card da votação).
create table public.poll_candidates (
  poll_id      uuid not null references public.polls(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  added_at     timestamptz,
  primary key (poll_id, candidate_id)
);

-- Votos: 1 linha por (votação, candidata, integrante).
create table public.votes (
  poll_id      uuid not null,
  candidate_id uuid not null,
  member_id    uuid not null references public.members(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (poll_id, candidate_id, member_id),
  foreign key (poll_id, candidate_id)
    references public.poll_candidates(poll_id, candidate_id) on delete cascade
);

-- ---------- FUNÇÕES AUXILIARES ----------

-- "João Márcio" -> "joaomarcio" (minúsculas, sem acentos, só letras/dígitos).
-- Mesma regra aplicada no front (js/banda-home.js) ao montar o e-mail de login.
create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select regexp_replace(
    lower(translate(p,
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]', '', 'g')
$$;

-- Cria a linha em members quando um usuário é criado no Auth
-- (os usuários são criados pelo admin via admin_create_member; não há cadastro aberto).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (id, email, username, name)
  values (new.id, new.email, split_part(new.email, '@', 1),
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- ADMINISTRAÇÃO DE ACESSOS (rodar no SQL Editor, nunca via site) ----------

-- Cria um integrante: usuário = nome slugificado, senha inicial = telefone.
-- Ex.: select public.admin_create_member('Cláudio', '999999999');  -- usuário "claudio"
-- Nomes repetidos na banda? Passe o usuário explícito no 4º parâmetro.
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

-- Redefine a senha de um integrante (quem esqueceu pede ao admin).
-- Ex.: select public.admin_set_password('claudio', 'novasenha');
create or replace function public.admin_set_password(p_username text, p_new_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where email = p_username || '@thejames.local';
  if not found then raise exception 'Usuário "%" não encontrado.', p_username; end if;
end $$;

-- Só o SQL Editor (role postgres) pode rodar as funções de administração.
revoke execute on function public.admin_create_member(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.admin_set_password(text, text)
  from public, anon, authenticated;

-- Verdadeiro se quem chama é um integrante logado.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where id = auth.uid()) $$;

-- ---------- REGRAS DE VOTO ----------

-- Antes de inserir um voto: votação aberta, dentro do prazo lógico,
-- e no máximo num_winners votos por integrante.
create or replace function public.check_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poll public.polls;
begin
  select * into v_poll from public.polls where id = new.poll_id;
  if v_poll.status <> 'aberta' then
    raise exception 'Esta votação já foi encerrada.';
  end if;
  if new.member_id <> auth.uid() then
    raise exception 'Você só pode registrar os seus próprios votos.';
  end if;
  if (select count(*) from public.votes
      where poll_id = new.poll_id and member_id = new.member_id) >= v_poll.num_winners then
    raise exception 'Você já usou todos os seus % votos nesta votação.', v_poll.num_winners;
  end if;
  return new;
end $$;

create trigger before_vote_insert
  before insert on public.votes
  for each row execute function public.check_vote();

-- Impede alterar/remover votos de votação encerrada.
create or replace function public.check_vote_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select status from public.polls where id = old.poll_id) <> 'aberta' then
    raise exception 'Esta votação já foi encerrada.';
  end if;
  return old;
end $$;

create trigger before_vote_delete
  before delete on public.votes
  for each row execute function public.check_vote_delete();

-- ---------- CRIAR VOTAÇÃO (atômico) ----------

create or replace function public.create_poll(
  p_title text, p_num_winners int, p_deadline timestamptz, p_candidate_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_poll_id uuid;
begin
  if not public.is_member() then raise exception 'Acesso negado.'; end if;
  if array_length(p_candidate_ids, 1) is null
     or array_length(p_candidate_ids, 1) <= p_num_winners then
    raise exception 'A votação precisa ter mais candidatas do que vagas.';
  end if;

  insert into public.polls (title, num_winners, deadline, created_by)
  values (p_title, p_num_winners, p_deadline, auth.uid())
  returning id into v_poll_id;

  insert into public.poll_candidates (poll_id, candidate_id)
  select v_poll_id, unnest(p_candidate_ids);

  update public.candidates set status = 'em_votacao'
  where id = any(p_candidate_ids);

  return v_poll_id;
end $$;

-- ---------- ADICIONAR CANDIDATAS A UMA VOTAÇÃO ABERTA ----------

-- Adiciona candidatas 'sugerida' a uma votação aberta (só admin).
create or replace function public.add_poll_candidates(
  p_poll_id uuid, p_candidate_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare v_poll public.polls;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador pode adicionar candidatas a uma votação.';
  end if;
  if coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    raise exception 'Nenhuma candidata selecionada.';
  end if;

  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll is null then raise exception 'Votação não encontrada.'; end if;
  if v_poll.status <> 'aberta' then raise exception 'Esta votação já foi encerrada.'; end if;

  -- Só entram candidatas na caixa de sugestões (isso também barra
  -- repetidas: quem já está numa votação aberta tem status 'em_votacao').
  if exists (
    select 1 from unnest(p_candidate_ids) as x(id)
    left join public.candidates c on c.id = x.id
    where c.id is null or c.status <> 'sugerida'
  ) then
    raise exception 'Só candidatas com status "sugerida" podem entrar na votação.';
  end if;

  insert into public.poll_candidates (poll_id, candidate_id, added_at)
  select p_poll_id, unnest(p_candidate_ids), now();

  update public.candidates set status = 'em_votacao'
  where id = any(p_candidate_ids);
end $$;

-- ---------- PROGRESSO DA VOTAÇÃO (quem já votou, sem revelar votos) ----------

create or replace function public.poll_progress(p_poll_id uuid)
returns table (member_id uuid, name text, votes_used int)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, count(v.*)::int
  from public.members m
  left join public.votes v on v.member_id = m.id and v.poll_id = p_poll_id
  where public.is_member()
  group by m.id, m.name
  order by m.name;
$$;

-- ---------- ENCERRAR VOTAÇÃO ----------
-- Promove as top X ao repertório; as demais voltam para 'sugerida'.
-- Empate na última vaga: chama de novo passando p_tiebreak com as escolhidas
-- (a exceção 'EMPATE' devolve as empatadas no campo detail, em JSON).

create or replace function public.close_poll(p_poll_id uuid, p_tiebreak uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_poll    public.polls;
  v_sure    uuid[];  -- acima da linha de corte
  v_tied    uuid[];  -- empatadas na linha de corte
  v_slots   int;     -- vagas restantes para as empatadas
  v_winners uuid[];
begin
  if not public.is_member() then raise exception 'Acesso negado.'; end if;

  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll is null then raise exception 'Votação não encontrada.'; end if;
  if v_poll.status <> 'aberta' then raise exception 'Esta votação já foi encerrada.'; end if;

  -- Só o administrador pode encerrar e apurar.
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador pode encerrar a votação.';
  end if;

  with tally as (
    select pc.candidate_id, count(v.*)::int as n
    from public.poll_candidates pc
    left join public.votes v
      on v.poll_id = pc.poll_id and v.candidate_id = pc.candidate_id
    where pc.poll_id = p_poll_id
    group by pc.candidate_id
  ),
  ranked as (
    select candidate_id, n,
           rank() over (order by n desc) as rnk,
           nth_value(n, v_poll.num_winners) over
             (order by n desc rows between unbounded preceding and unbounded following) as cut
    from tally
  )
  select
    coalesce(array_agg(candidate_id) filter (where n > cut), '{}'),
    coalesce(array_agg(candidate_id) filter (where n = cut), '{}')
  into v_sure, v_tied
  from ranked;

  v_slots := v_poll.num_winners - coalesce(array_length(v_sure, 1), 0);

  if coalesce(array_length(v_tied, 1), 0) <= v_slots then
    -- sem empate real: todas as da linha de corte entram
    v_winners := v_sure || v_tied;
  elsif p_tiebreak is not null then
    if not (p_tiebreak <@ v_tied) or array_length(p_tiebreak, 1) <> v_slots then
      raise exception 'Desempate inválido: escolha exatamente % entre as empatadas.', v_slots;
    end if;
    v_winners := v_sure || p_tiebreak;
  else
    raise exception 'EMPATE'
      using detail = (
        select json_agg(json_build_object('id', c.id, 'title', c.title, 'artist', c.artist))::text
        from public.candidates c where c.id = any(v_tied)
      ),
      hint = v_slots::text;
  end if;

  -- Promove vencedoras ao repertório.
  insert into public.songs (title, artist, spotify_url, from_poll_id)
  select title, artist, spotify_url, p_poll_id
  from public.candidates where id = any(v_winners);

  update public.candidates set status = 'aprovada' where id = any(v_winners);

  -- As demais voltam para a caixa de sugestões.
  update public.candidates set status = 'sugerida'
  where status = 'em_votacao'
    and id in (select candidate_id from public.poll_candidates where poll_id = p_poll_id)
    and not (id = any(v_winners));

  update public.polls set status = 'encerrada' where id = p_poll_id;
end $$;

-- ---------- SEGURANÇA (Row Level Security) ----------

alter table public.members         enable row level security;
alter table public.songs           enable row level security;
alter table public.shows           enable row level security;
alter table public.show_songs      enable row level security;
alter table public.candidates      enable row level security;
alter table public.polls           enable row level security;
alter table public.poll_candidates enable row level security;
alter table public.votes           enable row level security;

-- members: integrantes se veem entre si; cada um edita o próprio perfil.
create policy members_select on public.members
  for select using (public.is_member());
create policy members_update_own on public.members
  for update using (id = auth.uid());

-- songs: público lê as ativas; integrantes leem e gerenciam tudo.
create policy songs_public_read on public.songs
  for select using (status = 'ativa' or public.is_member());
create policy songs_member_write on public.songs
  for insert with check (public.is_member());
create policy songs_member_update on public.songs
  for update using (public.is_member());
create policy songs_member_delete on public.songs
  for delete using (public.is_member());

-- shows: público lê os divulgados; integrantes gerenciam tudo.
create policy shows_public_read on public.shows
  for select using (is_public or public.is_member());
create policy shows_member_write on public.shows
  for insert with check (public.is_member());
create policy shows_member_update on public.shows
  for update using (public.is_member());
create policy shows_member_delete on public.shows
  for delete using (public.is_member());

-- setlists: públicas só quando o show libera; integrantes gerenciam.
create policy show_songs_public_read on public.show_songs
  for select using (
    public.is_member() or exists (
      select 1 from public.shows s
      where s.id = show_id and s.is_public and s.setlist_public
    )
  );
create policy show_songs_member_write on public.show_songs
  for insert with check (public.is_member());
create policy show_songs_member_update on public.show_songs
  for update using (public.is_member());
create policy show_songs_member_delete on public.show_songs
  for delete using (public.is_member());

-- candidatas e votações: só integrantes.
create policy candidates_member_all on public.candidates
  for all using (public.is_member()) with check (public.is_member());
create policy polls_member_read on public.polls
  for select using (public.is_member());
create policy poll_candidates_member_read on public.poll_candidates
  for select using (public.is_member());

-- votos: cada um insere/remove os próprios enquanto aberta;
-- vê os próprios sempre, e os de todos depois de encerrada.
create policy votes_insert_own on public.votes
  for insert with check (member_id = auth.uid());
create policy votes_delete_own on public.votes
  for delete using (member_id = auth.uid());
create policy votes_select on public.votes
  for select using (
    member_id = auth.uid()
    or exists (select 1 from public.polls p
               where p.id = poll_id and p.status = 'encerrada' and public.is_member())
  );

-- Observação: polls e poll_candidates não têm policy de escrita — toda escrita
-- passa pelas funções create_poll/add_poll_candidates/close_poll (security definer).
