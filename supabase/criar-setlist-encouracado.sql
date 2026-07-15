-- =============================================================
-- The James — cria a Set List do show de 26/06/2026 (Encouraçado
-- Butikin) a partir da setlist já tocada (show_songs) e associa
-- ao show (shows.setlist_id). Rode uma vez no SQL Editor.
-- Seguro rodar de novo: se o show já tiver set list, não faz nada.
-- Requer criar-setlists.sql.
-- =============================================================

do $$
declare
  v_show    public.shows;
  v_setlist uuid;
begin
  select * into v_show
  from public.shows
  where date = '2026-06-26' and venue ilike '%Encouraçado%'
  limit 1;
  if v_show is null then
    raise exception 'Show de 26/06/2026 no Encouraçado não encontrado.';
  end if;
  if v_show.setlist_id is not null then
    raise notice 'O show já tem uma set list associada — nada a fazer.';
    return;
  end if;

  insert into public.setlists (name, notes)
  values ('Encouraçado Butikin — 26/06/2026',
          'Criada a partir da setlist tocada no show')
  returning id into v_setlist;

  -- Copia as músicas na ordem tocada (posições normalizadas 1..n).
  insert into public.setlist_items (setlist_id, position, kind, song_id)
  select v_setlist, row_number() over (order by ss.position), 'song', ss.song_id
  from public.show_songs ss
  where ss.show_id = v_show.id;

  update public.shows set setlist_id = v_setlist where id = v_show.id;
end $$;

-- Conferência: deve listar a set list com 25 músicas e o show vinculado.
select sl.name,
       (select count(*) from public.setlist_items i where i.setlist_id = sl.id) as musicas,
       s.date, s.venue
from public.setlists sl
join public.shows s on s.setlist_id = sl.id
where s.date = '2026-06-26';
