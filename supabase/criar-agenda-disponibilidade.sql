-- =============================================================
-- The James — Agenda de disponibilidade (ensaios e shows)
-- O admin libera janelas de datas; cada integrante marca em quais
-- dias toparia ensaiar e/ou tocar. Quando TODOS os integrantes
-- ativos marcam o mesmo dia para o mesmo tipo, nasce um evento
-- confirmado (band_events). O evento só vira show de verdade na
-- promoção pelo admin (promote_event_to_show) — nada de show
-- "a definir" na página pública.
-- Rode uma vez no SQL Editor, ANTES do deploy do front que o usa.
-- =============================================================

-- Integrante ativo conta no "todos" do match; afastados não travam a agenda.
alter table public.members
  add column if not exists is_active boolean not null default true;

-- "Hoje" no fuso da banda (o Postgres do Supabase roda em UTC;
-- current_date puro viraria "amanhã" às 21h de Brasília).
create or replace function public.hoje_sp()
returns date language sql stable as
$$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Janelas de datas liberadas pelo admin (vários intervalos num mês = várias linhas).
create table if not exists public.availability_windows (
  id         uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date   date not null check (end_date >= start_date),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  -- sem sobreposição: remover uma janela limpa as marcações sem ambiguidade
  constraint windows_sem_sobreposicao
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

-- Marcações de disponibilidade. A PK inclui kind: dá para marcar
-- ensaio E show no mesmo dia ("qualquer um me serve").
create table if not exists public.availability_marks (
  member_id  uuid not null references public.members(id) on delete cascade,
  window_id  uuid not null references public.availability_windows(id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('ensaio','show')),
  created_at timestamptz not null default now(),
  primary key (member_id, day, kind)
);

-- Eventos nascidos de match (um por dia e tipo).
create table if not exists public.band_events (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  kind       text not null check (kind in ('ensaio','show')),
  status     text not null default 'confirmado'
             check (status in ('confirmado','em_risco','cancelado')),
  show_id    uuid references public.shows(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (day, kind)
);

-- ---------- MATCH ----------

-- Reavalia um par (dia, tipo) e materializa o estado do evento.
-- Uso interno: as funções abaixo chamam com advisory lock já pego
-- (por isso o execute é revogado dos clientes).
create or replace function public.eval_band_event(p_day date, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_event  public.band_events;
  v_total  int;
  v_marked int;
begin
  select * into v_event from public.band_events
  where day = p_day and kind = p_kind for update;

  -- cancelado só volta ao jogo via reopen_band_event
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

  -- incompleto: confirmado degrada para em risco — exceto se já virou show
  -- (nesse caso a desmarcação é barrada antes, em set_availability)
  if v_event.id is not null and v_event.status = 'confirmado'
     and v_event.show_id is null then
    update public.band_events set status = 'em_risco' where id = v_event.id;
    return 'em_risco';
  end if;
  return coalesce(v_event.status, 'sem_evento');
end $$;

revoke execute on function public.eval_band_event(date, text)
  from public, anon, authenticated;

-- ---------- MARCAR / DESMARCAR (integrante) ----------

-- Retorna 'match', 'marcada', 'desmarcada' ou 'em_risco' — o front usa
-- o retorno para o feedback (inclusive a celebração do match).
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

  -- serializa marcações concorrentes do mesmo par (dia, tipo):
  -- dois integrantes fechando o match ao mesmo tempo não se perdem
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

-- ---------- JANELAS (admin) ----------

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

-- Remover janela apaga as marcações (cascade) e os eventos do intervalo;
-- se algum evento já virou show, a remoção é barrada.
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

-- ---------- EVENTOS (admin) ----------

-- Promove um evento de show confirmado a show de verdade (is_public=false;
-- o admin revisa e publica depois na página Shows).
create or replace function public.promote_event_to_show(
  p_event_id uuid, p_venue text, p_city text, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event   public.band_events;
  v_show_id uuid;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador promove eventos a show.';
  end if;
  select * into v_event from public.band_events where id = p_event_id for update;
  if v_event.id is null then raise exception 'Evento não encontrado.'; end if;
  if v_event.kind <> 'show' then
    raise exception 'Só eventos do tipo show viram show — ensaios ficam na agenda.';
  end if;
  if v_event.show_id is not null then raise exception 'Este evento já virou show.'; end if;
  if v_event.status <> 'confirmado' then
    raise exception 'Só eventos confirmados viram show.';
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

-- Cancelado mantém a linha (histórico) e trava o par (dia, tipo)
-- até o admin reabrir.
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

-- Reabrir apaga a linha cancelada e reavalia: se todos seguem marcados,
-- o match renasce na hora.
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
-- reavalia todos os pares futuros (datas a um voto podem fechar match;
-- reativar põe em risco eventos futuros em que o integrante não marcou).
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

-- ---------- SEGURANÇA ----------

alter table public.availability_windows enable row level security;
alter table public.availability_marks   enable row level security;
alter table public.band_events          enable row level security;

-- Leitura para integrantes (todos veem as marcações de todos — é assim
-- que o calendário mostra "faltam 2"). Nenhuma policy de escrita:
-- toda mutação passa pelas funções acima (security definer).
create policy availability_windows_member_read on public.availability_windows
  for select using (public.is_member());
create policy availability_marks_member_read on public.availability_marks
  for select using (public.is_member());
create policy band_events_member_read on public.band_events
  for select using (public.is_member());
