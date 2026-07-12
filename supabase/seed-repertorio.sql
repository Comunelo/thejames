-- =============================================================
-- The James — carga inicial do repertório
-- Fonte: media/setlists/2026_06_26_Encouracado_Setlist_rev02.pdf
-- Rode uma vez no SQL Editor do Supabase. Rodar de novo não duplica
-- (só insere títulos que ainda não existem).
-- =============================================================

insert into public.songs (title, artist)
select v.title, v.artist
from (values
  -- Bloco 1
  ('A Hard Day''s Night',              'The Beatles'),
  ('Listen to the Music',              'The Doobie Brothers'),
  ('Vou Deixar',                       'Skank'),
  ('Valerie',                          'Amy Winehouse'),
  ('The Logical Song',                 'Supertramp'),
  ('Don''t Let Me Down',               'The Beatles'),
  ('The Game of Love',                 'Santana'),
  ('Rocket Man',                       'Elton John'),
  ('Handle with Care',                 'Traveling Wilburys'),
  ('Hold the Line',                    'Toto'),
  ('Band on the Run',                  'Paul McCartney & Wings'),
  ('Superstition',                     'Stevie Wonder'),
  ('Hotel California',                 'Eagles'),
  -- Bloco 2
  ('Crazy Little Thing Called Love',   'Queen'),
  ('Jardins da Babilônia',             'Rita Lee'),
  ('I Shot the Sheriff',               'Bob Marley'),
  ('Crying',                           'Aerosmith'),
  ('Miss You',                         'The Rolling Stones'),
  ('Have You Ever Seen the Rain',      'Creedence'),
  ('Show Me the Way',                  'Peter Frampton'),
  ('Roxanne',                          'The Police'),
  ('Comfortably Numb',                 'Pink Floyd'),
  ('Johnny B. Goode',                  'Chuck Berry'),
  ('Man! I Feel Like a Woman!',        'Shania Twain'),
  ('Taj Mahal',                        'Jorge Ben Jor')
) as v(title, artist)
where not exists (
  select 1 from public.songs s
  where lower(s.title) = lower(v.title)
);

-- -------------------------------------------------------------
-- OPCIONAL: registra no banco os shows que já aconteceram
-- (os cartazes já aparecem no site; isto acrescenta o show do
-- 26/06 com a setlist completa, liberada ao público).
-- -------------------------------------------------------------

insert into public.shows (date, venue, city, is_public, setlist_public)
select v.date::date, v.venue, v.city, true, v.setlist
from (values
  ('2025-11-14', 'Gravador Pub',        'Porto Alegre', false),
  ('2025-12-19', 'Encouraçado Butikin', 'Porto Alegre', false),
  ('2026-04-30', 'Gravador Pub',        'Porto Alegre', false),
  ('2026-06-26', 'Encouraçado Butikin', 'Porto Alegre', true)
) as v(date, venue, city, setlist)
where not exists (
  select 1 from public.shows s where s.date = v.date::date
);

-- Setlist do show de 26/06/2026 (ordem do PDF; bloco 2 continua a numeração).
insert into public.show_songs (show_id, song_id, position)
select sh.id, so.id, v.pos
from (values
  ('A Hard Day''s Night', 1),  ('Listen to the Music', 2),
  ('Vou Deixar', 3),           ('Valerie', 4),
  ('The Logical Song', 5),     ('Don''t Let Me Down', 6),
  ('The Game of Love', 7),     ('Rocket Man', 8),
  ('Handle with Care', 9),     ('Hold the Line', 10),
  ('Band on the Run', 11),     ('Superstition', 12),
  ('Hotel California', 13),
  ('Crazy Little Thing Called Love', 14),
  ('Jardins da Babilônia', 15),('I Shot the Sheriff', 16),
  ('Crying', 17),              ('Miss You', 18),
  ('Have You Ever Seen the Rain', 19),
  ('Show Me the Way', 20),     ('Roxanne', 21),
  ('Comfortably Numb', 22),    ('Johnny B. Goode', 23),
  ('Man! I Feel Like a Woman!', 24),
  ('Taj Mahal', 25)
) as v(title, pos)
join public.shows sh on sh.date = '2026-06-26'
join public.songs so on lower(so.title) = lower(v.title)
on conflict (show_id, song_id) do nothing;
