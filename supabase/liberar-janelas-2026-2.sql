-- The James — libera as janelas de disponibilidade do 2º semestre de 2026.
-- Rodar no SQL Editor do Supabase (como admin do projeto), DEPOIS de
-- criar-agenda-disponibilidade.sql.
--
-- Insere direto na tabela (o SQL Editor não tem auth.uid(), então a função
-- add_availability_window barraria). A constraint windows_sem_sobreposicao
-- continua valendo; o "not exists" torna o script re-executável sem erro.

with admin as (
  select id from public.members where is_admin limit 1
),
janelas(start_date, end_date) as (
  values
    (date '2026-07-24', date '2026-07-26'),  --  1: 3 dias
    (date '2026-08-05', date '2026-08-09'),  --  2: 5 dias
    (date '2026-08-27', date '2026-08-30'),  --  3: 4 dias
    (date '2026-09-08', date '2026-09-13'),  --  4: 6 dias
    (date '2026-09-21', date '2026-09-23'),  --  5: 3 dias
    (date '2026-10-23', date '2026-10-24'),  --  6: 2 dias
    (date '2026-10-30', date '2026-11-04'),  --  7: 6 dias
    (date '2026-11-09', date '2026-11-11'),  --  8: 3 dias
    (date '2026-11-19', date '2026-11-22'),  --  9: 4 dias
    (date '2026-12-07', date '2026-12-20')   -- 10: 14 dias
)
insert into public.availability_windows (start_date, end_date, created_by)
select j.start_date, j.end_date, admin.id
from janelas j cross join admin
where not exists (
  select 1 from public.availability_windows w
  where daterange(w.start_date, w.end_date, '[]')
     && daterange(j.start_date, j.end_date, '[]')
);

-- Conferência: deve listar as 10 janelas com as durações da tabela original.
select start_date, end_date, (end_date - start_date + 1) as dias
from public.availability_windows
order by start_date;
