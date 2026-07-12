-- =============================================================
-- The James — ajuste: só o administrador encerra/apura votações
-- Substitui a regra antiga (criador podia encerrar antes do prazo;
-- qualquer integrante depois do prazo). Rode uma vez no SQL Editor.
-- =============================================================

create or replace function public.close_poll(p_poll_id uuid, p_tiebreak uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_poll    public.polls;
  v_sure    uuid[];  -- acima da linha de corte
  v_tied    uuid[];  -- empatadas na linha de corte
  v_slots   int;     -- vagas restantes para as empatadas
  v_winners uuid[];
begin
  if not public.is_member() then raise exception 'Acesso negado.'; end if;

  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll is null then raise exception 'Votação não encontrada.'; end if;
  if v_poll.status <> 'aberta' then raise exception 'Esta votação já foi encerrada.'; end if;

  -- Só o administrador pode encerrar e apurar.
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador pode encerrar a votação.';
  end if;

  with tally as (
    select pc.candidate_id, count(v.*)::int as n
    from public.poll_candidates pc
    left join public.votes v
      on v.poll_id = pc.poll_id and v.candidate_id = pc.candidate_id
    where pc.poll_id = p_poll_id
    group by pc.candidate_id
  ),
  ranked as (
    select candidate_id, n,
           rank() over (order by n desc) as rnk,
           nth_value(n, v_poll.num_winners) over
             (order by n desc rows between unbounded preceding and unbounded following) as cut
    from tally
  )
  select
    coalesce(array_agg(candidate_id) filter (where n > cut), '{}'),
    coalesce(array_agg(candidate_id) filter (where n = cut), '{}')
  into v_sure, v_tied
  from ranked;

  v_slots := v_poll.num_winners - coalesce(array_length(v_sure, 1), 0);

  if coalesce(array_length(v_tied, 1), 0) <= v_slots then
    -- sem empate real: todas as da linha de corte entram
    v_winners := v_sure || v_tied;
  elsif p_tiebreak is not null then
    if not (p_tiebreak <@ v_tied) or array_length(p_tiebreak, 1) <> v_slots then
      raise exception 'Desempate inválido: escolha exatamente % entre as empatadas.', v_slots;
    end if;
    v_winners := v_sure || p_tiebreak;
  else
    raise exception 'EMPATE'
      using detail = (
        select json_agg(json_build_object('id', c.id, 'title', c.title, 'artist', c.artist))::text
        from public.candidates c where c.id = any(v_tied)
      ),
      hint = v_slots::text;
  end if;

  -- Promove vencedoras ao repertório.
  insert into public.songs (title, artist, spotify_url, from_poll_id)
  select title, artist, spotify_url, p_poll_id
  from public.candidates where id = any(v_winners);

  update public.candidates set status = 'aprovada' where id = any(v_winners);

  -- As demais voltam para a caixa de sugestões.
  update public.candidates set status = 'sugerida'
  where status = 'em_votacao'
    and id in (select candidate_id from public.poll_candidates where poll_id = p_poll_id)
    and not (id = any(v_winners));

  update public.polls set status = 'encerrada' where id = p_poll_id;
end $$;
