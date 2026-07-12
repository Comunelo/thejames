-- =============================================================
-- The James — candidatas para a próxima votação
-- Fonte: fixtures/The_James_Candidatas_2026_songs.xlsx (28 sugestões
-- do grupo de WhatsApp, mai–jul/2026). Links do Spotify vieram da
-- própria planilha e foram validados um a um via oEmbed.
-- Rode uma vez no SQL Editor (seguro rodar de novo — só insere o que
-- ainda não existe). Quem sugeriu é casado com members pelo usuário
-- (slugify do nome); se o integrante não existir, fica sem autor.
-- =============================================================

insert into public.candidates (title, artist, spotify_url, note, suggested_by, created_at)
select v.title, v.artist, v.url, v.note,
       (select m.id from public.members m where m.username = public.slugify(v.autor) limit 1),
       v.posted
from (values
  ('Candy', 'Iggy Pop',
   'https://open.spotify.com/track/6sFpmdsk4UDMcDWdy4T1Kc',
   'Post no grupo (Spotify) em 04/07/2026', 'Andre', '2026-07-04'::timestamptz),
  ('Every Little Thing She Does Is Magic', 'The Police',
   'https://open.spotify.com/track/44aTAUBF0g6sMkMNE8I5kd',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Owner of a Lonely Heart', 'Yes',
   'https://open.spotify.com/track/0GTK6TesV108Jj5D3MHsYb',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Don''t You (Forget About Me)', 'Simple Minds',
   'https://open.spotify.com/track/3fH4KjXFYMmljxrcGrbPj9',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Dancing in the Dark', 'Bruce Springsteen',
   'https://open.spotify.com/track/7FwBtcecmlpc1sLySPXeGE',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Modern Love', 'David Bowie',
   'https://open.spotify.com/track/3gxEZXUjrNbl3TlSrTGbR5',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Rosanna', 'Toto',
   'https://open.spotify.com/track/37BTh5g05cxBIRYMbw8g2T',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Lady Writer', 'Dire Straits',
   'https://open.spotify.com/track/3mwFncaI2HBczQ92GP9MQF',
   'Post no grupo (Spotify) em 05/07/2026', 'Cláudio', '2026-07-05'::timestamptz),
  ('Sledgehammer', 'Peter Gabriel',
   'https://open.spotify.com/track/4AUS8KNz7zX8XFu9L38GT0',
   'Post no grupo (Spotify) em 06/07/2026', 'Cláudio', '2026-07-06'::timestamptz),
  ('Harlem Shuffle', 'The Rolling Stones',
   'https://open.spotify.com/track/2StkuotzPgX5FpSjMpTvlw',
   'Post no grupo (Spotify) em 10/07/2026', 'Cláudio', '2026-07-10'::timestamptz),
  ('Everybody Wants to Rule the World', 'Tears for Fears',
   'https://open.spotify.com/track/4RvWPyQ5RL0ao9LPZeSouE',
   'Post no grupo (YouTube) em 31/05/2026', 'James', '2026-05-31'::timestamptz),
  ('All I Wanna Do', 'Sheryl Crow',
   'https://open.spotify.com/track/3ZpQiJ78LKINrW9SQTgbXd',
   'Post no grupo (YouTube) em 15/06/2026', 'James', '2026-06-15'::timestamptz),
  ('Virtual Insanity', 'Jamiroquai',
   'https://open.spotify.com/track/2Bxt2qamL6iu0XN0Td484J',
   'Post no grupo (YouTube) em 09/07/2026', 'James', '2026-07-09'::timestamptz),
  ('Stayin'' Alive', 'Bee Gees',
   'https://open.spotify.com/track/5ubvP9oKmxLUVq506fgLhk',
   'Post no grupo (YouTube) em 09/07/2026', 'James', '2026-07-09'::timestamptz),
  ('Ain''t No Mountain High Enough', 'Marvin Gaye & Tammi Terrell',
   'https://open.spotify.com/track/7tqhbajSfrz2F7E1Z75ASX',
   'Post no grupo (YouTube) em 10/07/2026', 'Andre', '2026-07-10'::timestamptz),
  ('My Girl', 'The Temptations',
   'https://open.spotify.com/track/745H5CctFr12Mo7cqa1BMH',
   'Post no grupo (YouTube) em 10/07/2026', 'Andre', '2026-07-10'::timestamptz),
  ('Boys Don''t Cry', 'The Cure',
   'https://open.spotify.com/track/1QFh8OH1e78dGd3VyJZCAC',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Here Comes the Sun', 'The Beatles',
   'https://open.spotify.com/track/45yEy5WJywhJ3sDI28ajTm',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Running on Empty', 'Jackson Browne',
   'https://open.spotify.com/track/2GOO9UKA3Z1tTBSF6KUcZb',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Here I Go Again', 'Whitesnake',
   'https://open.spotify.com/track/6Nd6ntkzr4t8o1FKPGOSMt',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('While My Guitar Gently Weeps', 'George Harrison',
   'https://open.spotify.com/track/1sW8AxMW4vuoV5LCDZj7r7',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('You''re So Vain', 'Carly Simon',
   'https://open.spotify.com/track/2DnJjbjNTV9Nd5NOa1KGba',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Old Man', 'The Woods',
   'https://open.spotify.com/track/2Q15KcCn0eRQ2nMCApiciK',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Guitar Man', 'Keith Urban, John Mayer',
   'https://open.spotify.com/track/75935bRXF7MDhygU4wmSpI',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Layla', 'Derek & The Dominos',
   'https://open.spotify.com/track/2kkvB3RNRzwjFdGhaUA0tz',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Jump', 'Van Halen',
   'https://open.spotify.com/track/7N3PAbqfTjSEU1edb2tY8j',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('The Power of Love', 'Huey Lewis & The News',
   'https://open.spotify.com/track/2olVm1lHicpveMAo4AUDRB',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz),
  ('Gypsy', 'Fleetwood Mac',
   'https://open.spotify.com/track/5J0aNEUTxJWKXnQmyY3vUp',
   'Playlist “Novas the James 2026” do Andre', 'Andre', '2026-07-10'::timestamptz)
) as v(title, artist, url, note, autor, posted)
where not exists (
  select 1 from public.candidates c where lower(c.title) = lower(v.title)
) and not exists (
  select 1 from public.songs s where lower(s.title) = lower(v.title)
);

-- Conferência: deve listar 28 candidatas 'sugerida', com autor preenchido.
select c.title, c.artist, m.name as sugerida_por, c.status,
       to_char(c.created_at, 'DD/MM/YYYY') as em
from public.candidates c
left join public.members m on m.id = c.suggested_by
order by c.created_at, c.title;
