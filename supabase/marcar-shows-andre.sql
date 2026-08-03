-- The James — marca disponibilidade de SHOW para o Andre nos dias
-- 11–12/09, 23–24/10, 30–31/10, 20–21/11, 11–12/12 e 18–19/12 de 2026,
-- como se ele tivesse marcado na Agenda.
-- Rodar no SQL Editor do Supabase, DEPOIS de liberar-janelas-2026-2.sql
-- (todos os dias acima já caem nas janelas liberadas).
--
-- Em vez de inserir direto em band_events, chama eval_band_event — a mesma
-- função que o match real usa. Se o Andre for o último ativo a marcar algum
-- dia, o possível show nasce na hora ('match'); senão o dia só fica marcado.
-- Re-executável: marcações duplicadas caem no "on conflict do nothing"
-- e eval_band_event é idempotente.

do $$
declare
  v_member_id uuid;
  v_day       date;
  v_window_id uuid;
  v_result    text;
begin
  select id into v_member_id
  from public.members
  where username = 'andre' and is_active;
  if v_member_id is null then
    raise exception 'Integrante "andre" não encontrado (ou afastado) — confira em public.members.';
  end if;

  foreach v_day in array array[
    date '2026-09-11', date '2026-09-12',
    date '2026-10-23', date '2026-10-24',
    date '2026-10-30', date '2026-10-31',
    date '2026-11-20', date '2026-11-21',
    date '2026-12-11', date '2026-12-12',
    date '2026-12-18', date '2026-12-19'
  ] loop
    select id into v_window_id from public.availability_windows
    where v_day between start_date and end_date;
    if v_window_id is null then
      raise exception 'O dia % não está em nenhuma janela liberada — rode liberar-janelas-2026-2.sql antes.', v_day;
    end if;

    insert into public.availability_marks (member_id, window_id, day, kind)
    values (v_member_id, v_window_id, v_day, 'show')
    on conflict do nothing;

    v_result := public.eval_band_event(v_day, 'show');
    raise notice 'Show %: %', v_day, v_result;  -- 'match' se o Andre fechou o dia; senão 'sem_evento'
  end loop;
end $$;

-- Conferência 1: as 12 marcações de show do Andre devem aparecer.
select am.day, am.kind, am.created_at
from public.availability_marks am
join public.members m on m.id = am.member_id
where m.username = 'andre' and am.kind = 'show'
order by am.day;

-- Conferência 2: quantos ativos já marcaram show em cada um desses dias
-- (quando "marcaram" = "ativos", o dia vira possível show em band_events).
select am.day, count(*) as marcaram,
       (select count(*) from public.members where is_active) as ativos
from public.availability_marks am
join public.members m on m.id = am.member_id and m.is_active
where am.kind = 'show'
  and am.day in (date '2026-09-11', date '2026-09-12',
                 date '2026-10-23', date '2026-10-24',
                 date '2026-10-30', date '2026-10-31',
                 date '2026-11-20', date '2026-11-21',
                 date '2026-12-11', date '2026-12-12',
                 date '2026-12-18', date '2026-12-19')
group by am.day
order by am.day;
