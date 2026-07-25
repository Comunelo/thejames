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
  is_active  boolean not null default true,  -- afastado não conta no match da agenda
  created_at timestamptz not null default now()
);

-- Repertório da banda.
create table public.songs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  artist       text not null,
  spotify_url  text,
  duration_sec int check (duration_sec > 0),      -- duração estimada (segundos)
  energy       int check (energy between 1 and 5), -- energia ao vivo (1=calma … 5=alta)
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

-- Setlist de cada show (ordenada). É a lista "tocável"/pública do show;
-- pode ser preenchida à mão ou aplicada a partir de uma set list (abaixo).
create table public.show_songs (
  show_id  uuid not null references public.shows(id) on delete cascade,
  song_id  uuid not null references public.songs(id) on delete cascade,
  position int  not null,
  primary key (show_id, song_id)
);

-- Set lists reutilizáveis (independentes dos shows).
create table public.setlists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Itens ordenados: música do repertório OU intervalo (com duração própria).
create table public.setlist_items (
  id           uuid primary key default gen_random_uuid(),
  setlist_id   uuid not null references public.setlists(id) on delete cascade,
  position     int  not null,
  kind         text not null default 'song' check (kind in ('song','interval')),
  song_id      uuid references public.songs(id) on delete cascade,
  duration_sec int check (duration_sec > 0),  -- só para intervalos
  label        text,                          -- ex.: "Intervalo"
  check ((kind = 'song' and song_id is not null)
      or (kind = 'interval' and song_id is null and duration_sec is not null))
);

-- Uma música só entra uma vez em cada set list.
create unique index setlist_items_musica_unica
  on public.setlist_items (setlist_id, song_id) where song_id is not null;

-- Show aponta para a set list de origem (associar copia as músicas
-- para show_songs; ver banda/setlists.html).
alter table public.shows
  add column setlist_id uuid references public.setlists(id) on delete set null;

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

-- Agenda de disponibilidade: janelas de datas liberadas pelo admin
-- (vários intervalos num mês = várias linhas; sem sobreposição).
create table public.availability_windows (
  id         uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date   date not null check (end_date >= start_date),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint windows_sem_sobreposicao
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

-- Marcações de disponibilidade. A PK inclui kind: dá para marcar
-- ensaio E show no mesmo dia ("qualquer um me serve").
create table public.availability_marks (
  member_id  uuid not null references public.members(id) on delete cascade,
  window_id  uuid not null references public.availability_windows(id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('ensaio','show')),
  created_at timestamptz not null default now(),
  primary key (member_id, day, kind)
);

-- Eventos nascidos de match (um por dia e tipo). Para kind='show',
-- o match é só POSSÍVEL show (status='confirmado' + show_id NULL);
-- o show é confirmado pelo admin via promote_event_to_show (grava
-- show_id). Excluir o show devolve o dia a possível show (FK set null).
create table public.band_events (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  kind       text not null check (kind in ('ensaio','show')),
  status     text not null default 'confirmado'
             check (status in ('confirmado','em_risco','cancelado')),
  show_id    uuid references public.shows(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (day, kind)
);

comment on table public.band_events is
  'Eventos nascidos do consenso da agenda. Para kind=''show'', status=''confirmado'' + show_id NULL = POSSÍVEL show (banda toda topou, casa não fechada); show_id preenchido = show confirmado (promote_event_to_show). Para kind=''ensaio'', confirmado = confirmado mesmo.';

comment on column public.band_events.show_id is
  'NULL em evento de show = ainda é só possibilidade; preenchido = show confirmado pelo admin. FK on delete set null: excluir o show devolve o dia a possível show.';

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

-- Candidata repetida (mesma música + artista, ignorando maiúsculas,
-- acentos e pontuação) é barrada no banco; o front avisa antes.
create unique index candidates_unicas
  on public.candidates (public.slugify(title), public.slugify(artist));

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
-- Só publica o resultado: nada entra no repertório automaticamente.
-- O ranking fica visível a todos (policy votes_select libera os votos de
-- votação encerrada) e TODAS as candidatas voltam para 'sugerida'.
-- Sem promoção não há desempate — empates aparecem lado a lado no ranking.

create or replace function public.close_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_poll public.polls;
begin
  if not public.is_member() then raise exception 'Acesso negado.'; end if;

  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll is null then raise exception 'Votação não encontrada.'; end if;
  if v_poll.status <> 'aberta' then raise exception 'Esta votação já foi encerrada.'; end if;

  -- Só o administrador pode encerrar.
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador pode encerrar a votação.';
  end if;

  -- Todas as candidatas voltam para a caixa de sugestões.
  update public.candidates set status = 'sugerida'
  where status = 'em_votacao'
    and id in (select candidate_id from public.poll_candidates where poll_id = p_poll_id);

  -- Encerrar libera a leitura dos votos para todos (policy votes_select)
  -- e congela os votos (triggers before_vote_insert/before_vote_delete).
  update public.polls set status = 'encerrada' where id = p_poll_id;
end $$;

-- ---------- AGENDA DE DISPONIBILIDADE ----------
-- O admin libera janelas; cada integrante marca os dias em que topa
-- ensaiar/tocar; quando TODOS os ativos marcam o mesmo (dia, tipo),
-- nasce um evento confirmado. Detalhes e feedbacks: ver
-- criar-agenda-disponibilidade.sql (mesmo conteúdo, comentado).

-- "Hoje" no fuso da banda (o Postgres do Supabase roda em UTC).
create or replace function public.hoje_sp()
returns date language sql stable as
$$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Reavalia um par (dia, tipo) e materializa o estado do evento.
-- Uso interno (chamada com advisory lock já pego; execute revogado).
create or replace function public.eval_band_event(p_day date, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_event  public.band_events;
  v_total  int;
  v_marked int;
begin
  select * into v_event from public.band_events
  where day = p_day and kind = p_kind for update;

  if v_event.id is not null and v_event.status = 'cancelado' then
    return 'cancelado';
  end if;

  select count(*) into v_total from public.members where is_active;
  select count(*) into v_marked
  from public.availability_marks am
  join public.members m on m.id = am.member_id and m.is_active
  where am.day = p_day and am.kind = p_kind;

  if v_total > 0 and v_marked = v_total then
    if v_event.id is null then
      insert into public.band_events (day, kind) values (p_day, p_kind);
      return 'match';
    elsif v_event.status = 'em_risco' then
      update public.band_events set status = 'confirmado' where id = v_event.id;
      return 'match';
    end if;
    return 'confirmado';
  end if;

  if v_event.id is not null and v_event.status = 'confirmado'
     and v_event.show_id is null then
    update public.band_events set status = 'em_risco' where id = v_event.id;
    return 'em_risco';
  end if;
  return coalesce(v_event.status, 'sem_evento');
end $$;

revoke execute on function public.eval_band_event(date, text)
  from public, anon, authenticated;

-- Marcar/desmarcar disponibilidade (retorna 'match', 'marcada',
-- 'desmarcada' ou 'em_risco' — o front usa para o feedback).
create or replace function public.set_availability(
  p_day date, p_kind text, p_available boolean
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_member    public.members;
  v_window_id uuid;
  v_event     public.band_events;
  v_result    text;
begin
  select * into v_member from public.members where id = auth.uid();
  if v_member.id is null then raise exception 'Acesso negado.'; end if;
  if not v_member.is_active then
    raise exception 'Integrantes afastados não marcam disponibilidade — fale com o administrador.';
  end if;
  if p_kind not in ('ensaio','show') then raise exception 'Tipo inválido.'; end if;

  select id into v_window_id from public.availability_windows
  where p_day between start_date and end_date;
  if v_window_id is null then
    raise exception 'Esta data não está liberada pelo administrador.';
  end if;
  if p_day < public.hoje_sp() then
    raise exception 'Esta data já passou.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agenda:' || p_day || ':' || p_kind, 0));

  if p_available then
    insert into public.availability_marks (member_id, window_id, day, kind)
    values (auth.uid(), v_window_id, p_day, p_kind)
    on conflict do nothing;
    v_result := public.eval_band_event(p_day, p_kind);
    return case when v_result = 'match' then 'match' else 'marcada' end;
  else
    select * into v_event from public.band_events
    where day = p_day and kind = p_kind;
    if v_event.show_id is not null then
      raise exception 'Esta data já virou show — fale com o administrador para desmarcar.';
    end if;
    delete from public.availability_marks
    where member_id = auth.uid() and day = p_day and kind = p_kind;
    v_result := public.eval_band_event(p_day, p_kind);
    return case when v_result = 'em_risco' then 'em_risco' else 'desmarcada' end;
  end if;
end $$;

-- Janelas (admin).
create or replace function public.add_availability_window(p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador libera datas na agenda.';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Intervalo inválido — confira as datas.';
  end if;
  if p_end < public.hoje_sp() then
    raise exception 'Este intervalo já passou.';
  end if;
  begin
    insert into public.availability_windows (start_date, end_date, created_by)
    values (p_start, p_end, auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Este intervalo sobrepõe uma janela já liberada.';
  end;
  return v_id;
end $$;

create or replace function public.remove_availability_window(p_window_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_window public.availability_windows;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador remove janelas da agenda.';
  end if;
  select * into v_window from public.availability_windows
  where id = p_window_id for update;
  if v_window.id is null then raise exception 'Janela não encontrada.'; end if;
  if exists (select 1 from public.band_events
             where day between v_window.start_date and v_window.end_date
               and show_id is not null) then
    raise exception 'Há um show confirmado neste intervalo — exclua o show primeiro.';
  end if;
  delete from public.band_events
  where day between v_window.start_date and v_window.end_date;
  delete from public.availability_windows where id = p_window_id;
end $$;

-- Eventos (admin): confirmar show (promover), cancelar, reabrir.
create or replace function public.promote_event_to_show(
  p_event_id uuid, p_venue text, p_city text, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event   public.band_events;
  v_show_id uuid;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador confirma shows.';
  end if;
  select * into v_event from public.band_events where id = p_event_id for update;
  if v_event.id is null then raise exception 'Evento não encontrado.'; end if;
  if v_event.kind <> 'show' then
    raise exception 'Só possibilidades de show são confirmadas — ensaios ficam na agenda.';
  end if;
  if v_event.show_id is not null then raise exception 'Este show já foi confirmado.'; end if;
  if v_event.status <> 'confirmado' then
    raise exception 'Só possibilidades fechadas por toda a banda viram show confirmado.';
  end if;
  if coalesce(trim(p_venue), '') = '' or coalesce(trim(p_city), '') = '' then
    raise exception 'Informe local e cidade do show.';
  end if;

  insert into public.shows (date, venue, city, notes, is_public)
  values (v_event.day, trim(p_venue), trim(p_city), nullif(trim(p_notes), ''), false)
  returning id into v_show_id;
  update public.band_events set show_id = v_show_id where id = p_event_id;
  return v_show_id;
end $$;

create or replace function public.cancel_band_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_event public.band_events;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador cancela eventos.';
  end if;
  select * into v_event from public.band_events where id = p_event_id for update;
  if v_event.id is null then raise exception 'Evento não encontrado.'; end if;
  if v_event.show_id is not null then
    raise exception 'Este evento já virou show — exclua o show na página Shows primeiro.';
  end if;
  if v_event.status = 'cancelado' then raise exception 'Este evento já está cancelado.'; end if;
  update public.band_events set status = 'cancelado' where id = p_event_id;
end $$;

create or replace function public.reopen_band_event(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_event  public.band_events;
  v_result text;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador reabre eventos.';
  end if;
  select * into v_event from public.band_events where id = p_event_id for update;
  if v_event.id is null then raise exception 'Evento não encontrado.'; end if;
  if v_event.status <> 'cancelado' then
    raise exception 'Só eventos cancelados podem ser reabertos.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agenda:' || v_event.day || ':' || v_event.kind, 0));
  delete from public.band_events where id = p_event_id;
  v_result := public.eval_band_event(v_event.day, v_event.kind);
  return case when v_result = 'match' then 'match' else 'reaberto' end;
end $$;

-- Afastar/reativar integrante muda o denominador do "todos":
-- reavalia todos os pares futuros.
create or replace function public.set_member_active(p_member_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador afasta ou reativa integrantes.';
  end if;
  update public.members set is_active = p_active where id = p_member_id;
  if not found then raise exception 'Integrante não encontrado.'; end if;

  for r in
    select distinct day, kind from public.availability_marks
    where day >= public.hoje_sp()
    union
    select day, kind from public.band_events
    where day >= public.hoje_sp() and status in ('confirmado', 'em_risco')
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('agenda:' || r.day || ':' || r.kind, 0));
    perform public.eval_band_event(r.day, r.kind);
  end loop;
end $$;

-- ---------- SEGURANÇA (Row Level Security) ----------

alter table public.members         enable row level security;
alter table public.songs           enable row level security;
alter table public.shows           enable row level security;
alter table public.show_songs      enable row level security;
alter table public.setlists       enable row level security;
alter table public.setlist_items  enable row level security;
alter table public.candidates      enable row level security;
alter table public.polls           enable row level security;
alter table public.poll_candidates enable row level security;
alter table public.votes           enable row level security;
alter table public.availability_windows enable row level security;
alter table public.availability_marks   enable row level security;
alter table public.band_events          enable row level security;

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

-- set lists: internas — só integrantes.
create policy setlists_member_all on public.setlists
  for all using (public.is_member()) with check (public.is_member());
create policy setlist_items_member_all on public.setlist_items
  for all using (public.is_member()) with check (public.is_member());

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

-- agenda: leitura para integrantes (todos veem as marcações de todos —
-- é assim que o calendário mostra "faltam 2"); nenhuma policy de escrita.
create policy availability_windows_member_read on public.availability_windows
  for select using (public.is_member());
create policy availability_marks_member_read on public.availability_marks
  for select using (public.is_member());
create policy band_events_member_read on public.band_events
  for select using (public.is_member());

-- Observação: polls, poll_candidates e as tabelas da agenda não têm policy
-- de escrita — toda escrita passa pelas funções security definer
-- (create_poll/add_poll_candidates/close_poll; set_availability e demais
-- funções da agenda).
