-- =============================================================
-- The James — links do Spotify das músicas do repertório
-- Links canônicos verificados um a um via oEmbed do Spotify.
-- Rode uma vez no SQL Editor do Supabase (seguro rodar de novo).
-- =============================================================

-- limpeza: a coluna de capas foi descartada (miniaturas saíram do site)
alter table public.songs drop column if exists cover_url;

update public.songs as s
set spotify_url = v.url
from (values
  ('A Hard Day''s Night', 'https://open.spotify.com/track/5J2CHimS7dWYMImCHkEFaJ'),
  ('Listen to the Music', 'https://open.spotify.com/track/7Ar4G7Ci11gpt6sfH9Cgz5'),
  ('Vou Deixar', 'https://open.spotify.com/track/0aJzrpwqEdGZQsSHLvbbpz'),
  ('Valerie', 'https://open.spotify.com/track/27Cc4ANeVnrtvJ17SEamIJ'),
  ('The Logical Song', 'https://open.spotify.com/track/4ovN8JcQzTJfCD9ptUXovU'),
  ('Don''t Let Me Down', 'https://open.spotify.com/track/6eexkuQmvCxCJmtf9dQSHZ'),
  ('The Game of Love', 'https://open.spotify.com/track/7013hAyMJjl1dd79QzbPk0'),
  ('Rocket Man', 'https://open.spotify.com/track/3gdewACMIVMEWVbyb8O9sY'),
  ('Handle with Care', 'https://open.spotify.com/track/1vQxicuNSODoBECPMFjHMG'),
  ('Hold the Line', 'https://open.spotify.com/track/4aVuWgvD0X63hcOCnZtNFA'),
  ('Band on the Run', 'https://open.spotify.com/track/1H4idkmruFoJBg1DvUv2tY'),
  ('Superstition', 'https://open.spotify.com/track/4N0TP4Rmj6QQezWV88ARNJ'),
  ('Crazy Little Thing Called Love', 'https://open.spotify.com/track/35ItUJlMtjOQW3SSiTCrrw'),
  ('Jardins da Babilônia', 'https://open.spotify.com/track/1voq70uyXy4i3S1oJP48Hs'),
  ('I Shot the Sheriff', 'https://open.spotify.com/track/5uBKhKWTJ4E47rcLQqu3YH'),
  ('Crying', 'https://open.spotify.com/track/0NJC0FDCODpPUntRTTQq97'),
  ('Miss You', 'https://open.spotify.com/track/3hJLKtTpgct9Y9wKww0BiR'),
  ('Have You Ever Seen the Rain', 'https://open.spotify.com/track/2LawezPeJhN4AWuSB0GtAU'),
  ('Show Me the Way', 'https://open.spotify.com/track/6BD1X1PeV5UzYUdiVaD2yL'),
  ('Roxanne', 'https://open.spotify.com/track/3EYOJ48Et32uATr9ZmLnAo'),
  ('Comfortably Numb', 'https://open.spotify.com/track/5HNCy40Ni5BZJFw1TKzRsC'),
  ('Johnny B. Goode', 'https://open.spotify.com/track/0wkN7jKuSw65kiqOyu35n9'),
  ('Man! I Feel Like a Woman!', 'https://open.spotify.com/track/6sxptembJVty4sNtcPMAVz'),
  ('Taj Mahal', 'https://open.spotify.com/track/7pdCDKs0i05N8ag4tAC5u5'),
  ('Hotel California', 'https://open.spotify.com/track/4GkOfUKUqDDgoeiov8Uqyi')
) as v(title, url)
where lower(s.title) = lower(v.title);

-- Conferência: deve listar 25 linhas, todas com tem_link = true.
select title, artist, (spotify_url is not null) as tem_link
from public.songs order by artist, title;
