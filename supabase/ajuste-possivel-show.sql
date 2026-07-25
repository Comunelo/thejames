-- =============================================================
-- The James — nomeia a convenção "possível show" na agenda.
-- Quando toda a banda marca "show" num dia, isso NÃO é um show
-- confirmado: é só a POSSIBILIDADE de show naquela data (falta o
-- processo externo de fechar com a casa). O show só é confirmado
-- quando o admin roda promote_event_to_show (grava show_id).
-- Convenção nos dados (inalterada): para kind='show',
--   status='confirmado' + show_id NULL  = possível show
--   show_id preenchido                  = show confirmado
-- Este script NÃO muda lógica nenhuma: documenta a convenção no
-- catálogo e alinha as mensagens de erro à nova nomenclatura.
-- Rode uma vez no SQL Editor, ANTES do deploy do front que o usa
-- (o front antigo segue 100% compatível — sem janela de risco).
-- =============================================================

comment on table public.band_events is
  'Eventos nascidos do consenso da agenda. Para kind=''show'', status=''confirmado'' + show_id NULL = POSSÍVEL show (banda toda topou, casa não fechada); show_id preenchido = show confirmado (promote_event_to_show). Para kind=''ensaio'', confirmado = confirmado mesmo.';

comment on column public.band_events.show_id is
  'NULL em evento de show = ainda é só possibilidade; preenchido = show confirmado pelo admin. FK on delete set null: excluir o show devolve o dia a possível show.';

-- Mesma função de criar-agenda-disponibilidade.sql, lógica idêntica —
-- só as mensagens mudam para a nomenclatura "possível show".
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

-- Fase 2 (NÃO fazer agora; só se um dia a semântica precisar ser
-- explícita no banco): status 'possivel' em band_events com migração
-- do CHECK, ajuste de eval_band_event/set_member_active e trigger que
-- rebaixa 'confirmado'->'possivel' quando o show é excluído (o FK
-- on delete set null já produz esse rebaixamento de graça no modelo
-- derivado atual — outro motivo para não materializar o status).
