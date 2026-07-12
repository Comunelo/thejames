-- =============================================================
-- The James — músicas que aparecem nas setlists antigas mas
-- ainda não estavam no repertório do banco.
-- Fontes: media/setlists/ (2024_10_01, 2025_11_14, 2025_12_19,
-- 2026_04_30) comparadas com as 25 músicas já cadastradas.
-- Links do Spotify verificados um a um via oEmbed.
-- Rode uma vez no SQL Editor do Supabase (seguro rodar de novo —
-- só insere o que ainda não existe).
-- =============================================================

insert into public.songs (title, artist, spotify_url)
select v.title, v.artist, v.url
from (values
  ('Sweet Home Alabama',                        'Lynyrd Skynyrd',
   'https://open.spotify.com/track/7e89621JPkKaeDSTQ3avtg'),
  ('You Shook Me All Night Long',               'AC/DC',
   'https://open.spotify.com/track/2SiXAy7TuUkycRVbbWDEpo'),
  ('All My Love',                               'Led Zeppelin',
   'https://open.spotify.com/track/5hhVpGIBlqAU5yJEOmrk5o'),
  ('Slow Dancing in a Burning Room',            'John Mayer',
   'https://open.spotify.com/track/2jdAk8ATWIL3dwT47XpRfu'),
  ('I Guess That''s Why They Call It the Blues', 'Elton John',
   'https://open.spotify.com/track/23l1kVpqMVREiwU1YAlcr4'),
  ('Assim Caminha a Humanidade',                'Lulu Santos',
   'https://open.spotify.com/track/18Lb0yf7HlgETLgfaBG6eV')
) as v(title, artist, url)
where not exists (
  select 1 from public.songs s
  where lower(s.title) = lower(v.title)
);

-- Conferência: deve listar 31 músicas, todas com tem_link = true.
select title, artist, (spotify_url is not null) as tem_link
from public.songs order by artist, title;
