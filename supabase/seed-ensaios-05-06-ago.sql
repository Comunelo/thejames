-- The James — marca ensaio para TODOS os integrantes ativos nos dias
-- 05 e 06/08/2026 e materializa o match (band_events), como se cada um
-- tivesse marcado na Agenda.
-- Rodar no SQL Editor do Supabase, DEPOIS de liberar-janelas-2026-2.sql
-- (os dias precisam estar dentro de uma janela liberada).
--
-- Em vez de inserir direto em band_events, chama eval_band_event — a mesma
-- função que o match real usa — para o evento nascer com o estado exato
-- ('confirmado', sem show_id). O execute dela é revogado só de anon/
-- authenticated; o SQL Editor roda como postgres e pode chamá-la.
-- Re-executável: marcações duplicadas caem no "on conflict do nothing"
-- e eval_band_event é idempotente (retorna 'confirmado' na segunda vez).

do $$
declare
  v_day       date;
  v_window_id uuid;
  v_result    text;
begin
  foreach v_day in array array[date '2026-08-05', date '2026-08-06'] loop
    select id into v_window_id from public.availability_windows
    where v_day between start_date and end_date;
    if v_window_id is null then
      raise exception 'O dia % não está em nenhuma janela liberada — rode liberar-janelas-2026-2.sql antes.', v_day;
    end if;

    insert into public.availability_marks (member_id, window_id, day, kind)
    select m.id, v_window_id, v_day, 'ensaio'
    from public.members m
    where m.is_active
    on conflict do nothing;

    v_result := public.eval_band_event(v_day, 'ensaio');
    raise notice 'Ensaio %: %', v_day, v_result;  -- esperado: match (ou confirmado se re-rodado)
  end loop;
end $$;

-- Conferência 1: os dois eventos devem aparecer como ensaio confirmado.
select day, kind, status, show_id
from public.band_events
where day in (date '2026-08-05', date '2026-08-06')
order by day;

-- Conferência 2: nº de marcações por dia = nº de integrantes ativos.
select am.day, count(*) as marcaram,
       (select count(*) from public.members where is_active) as ativos
from public.availability_marks am
join public.members m on m.id = am.member_id and m.is_active
where am.day in (date '2026-08-05', date '2026-08-06') and am.kind = 'ensaio'
group by am.day
order by am.day;
