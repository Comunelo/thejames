-- =============================================================
-- The James — carga OPCIONAL de duração e energia do repertório
-- Estimativas (versão de estúdio / bom senso) para as 31 músicas,
-- só para a banda não partir do zero: ajuste à vontade no
-- backstage > Repertório (duração m:ss e energia 1=calma … 5=alta).
-- Seguro rodar de novo: só preenche músicas ainda sem duração.
-- Requer criar-setlists.sql (colunas duration_sec/energy).
-- =============================================================

update public.songs s
set duration_sec = v.dur, energy = v.energy
from (values
  ('A Hard Day''s Night',                         154, 4),
  ('Listen to the Music',                         228, 4),
  ('Vou Deixar',                                  234, 4),
  ('Valerie',                                     233, 3),
  ('The Logical Song',                            250, 3),
  ('Don''t Let Me Down',                          214, 2),
  ('The Game of Love',                            256, 3),
  ('Rocket Man',                                  281, 2),
  ('Handle with Care',                            200, 3),
  ('Hold the Line',                               236, 4),
  ('Band on the Run',                             313, 3),
  ('Superstition',                                266, 5),
  ('Hotel California',                            390, 3),
  ('Crazy Little Thing Called Love',              162, 4),
  ('Jardins da Babilônia',                        221, 3),
  ('I Shot the Sheriff',                          280, 2),
  ('Crying',                                      308, 3),
  ('Miss You',                                    288, 4),
  ('Have You Ever Seen the Rain',                 158, 3),
  ('Show Me the Way',                             280, 3),
  ('Roxanne',                                     192, 3),
  ('Comfortably Numb',                            383, 2),
  ('Johnny B. Goode',                             161, 5),
  ('Man! I Feel Like a Woman!',                   233, 4),
  ('Taj Mahal',                                   182, 5),
  ('Sweet Home Alabama',                          283, 4),
  ('You Shook Me All Night Long',                 210, 5),
  ('All My Love',                                 351, 2),
  ('Slow Dancing in a Burning Room',              241, 1),
  ('I Guess That''s Why They Call It the Blues',  281, 2),
  ('Assim Caminha a Humanidade',                  235, 2)
) as v(title, dur, energy)
where lower(s.title) = lower(v.title)
  and s.duration_sec is null;

-- Confere o que ficou sem estimativa (deve retornar 0 linhas).
select title, artist from public.songs
where duration_sec is null order by artist, title;
