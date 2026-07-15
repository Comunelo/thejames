-- =============================================================
-- The James — ajuste: encerrar votação SEM promover ao repertório
-- O encerramento agora só publica o resultado: o ranking (votos
-- visíveis a todos os integrantes via RLS) fica disponível na aba
-- Encerradas, e TODAS as candidatas voltam para a caixa de
-- sugestões — nada entra no repertório automaticamente.
-- Sem promoção não há desempate: a antiga exceção 'EMPATE' e o
-- parâmetro p_tiebreak deixam de existir.
-- Rode uma vez no SQL Editor, ANTES do deploy do front que o usa.
-- =============================================================

drop function if exists public.close_poll(uuid, uuid[]);

create or replace function public.close_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_poll public.polls;
begin
  if not public.is_member() then raise exception 'Acesso negado.'; end if;

  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll is null then raise exception 'Votação não encontrada.'; end if;
  if v_poll.status <> 'aberta' then raise exception 'Esta votação já foi encerrada.'; end if;

  -- Só o administrador pode encerrar.
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador pode encerrar a votação.';
  end if;

  -- Todas as candidatas voltam para a caixa de sugestões.
  update public.candidates set status = 'sugerida'
  where status = 'em_votacao'
    and id in (select candidate_id from public.poll_candidates where poll_id = p_poll_id);

  -- Encerrar libera a leitura dos votos para todos (policy votes_select)
  -- e congela os votos (triggers before_vote_insert/before_vote_delete).
  update public.polls set status = 'encerrada' where id = p_poll_id;
end $$;
