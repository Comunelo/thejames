-- =============================================================
-- The James — Set Lists reutilizáveis
-- Listas montadas a partir do repertório, com ordem própria,
-- intervalos, mapa de energia e duração estimada; podem ser
-- associadas a shows (a associação copia as músicas para
-- show_songs, então impressão e setlist pública seguem iguais).
-- Rode uma vez no SQL Editor, ANTES do deploy do front que o usa.
-- =============================================================

-- Duração estimada (segundos) e energia ao vivo (1=calma … 5=alta)
-- de cada música do repertório. Editáveis no backstage > Repertório.
alter table public.songs
  add column if not exists duration_sec int check (duration_sec > 0);
alter table public.songs
  add column if not exists energy int check (energy between 1 and 5);

-- Set lists (independentes dos shows; um show aponta para no máximo uma).
create table if not exists public.setlists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Itens ordenados: música do repertório OU intervalo (com duração própria).
create table if not exists public.setlist_items (
  id           uuid primary key default gen_random_uuid(),
  setlist_id   uuid not null references public.setlists(id) on delete cascade,
  position     int  not null,
  kind         text not null default 'song' check (kind in ('song','interval')),
  song_id      uuid references public.songs(id) on delete cascade,
  duration_sec int check (duration_sec > 0),  -- só para intervalos
  label        text,                          -- ex.: "Intervalo", "Troca de figurino"
  check ((kind = 'song' and song_id is not null)
      or (kind = 'interval' and song_id is null and duration_sec is not null))
);

-- Uma música só entra uma vez em cada set list.
create unique index if not exists setlist_items_musica_unica
  on public.setlist_items (setlist_id, song_id) where song_id is not null;

-- Show aponta para a set list de origem (a lista tocável fica em show_songs).
alter table public.shows
  add column if not exists setlist_id uuid references public.setlists(id) on delete set null;

-- Segurança: set lists são internas — só integrantes.
alter table public.setlists      enable row level security;
alter table public.setlist_items enable row level security;
create policy setlists_member_all on public.setlists
  for all using (public.is_member()) with check (public.is_member());
create policy setlist_items_member_all on public.setlist_items
  for all using (public.is_member()) with check (public.is_member());
