-- =============================================================
-- The James — remove a "Rosanna" (Toto) duplicada (a do Miguel)
-- e cria a trava definitiva contra candidatas repetidas.
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- =============================================================

-- Parte 1: merge da duplicada na mantida.
-- A duplicada pode estar em votação aberta com votos: antes de excluir,
-- a mantida entra nas mesmas votações e herda os votos (sem duplicar o
-- voto de um mesmo integrante). Só então a duplicada é excluída — o
-- cascade limpa poll_candidates e eventuais votos que sobraram.
do $$
declare
  v_dup   uuid;  -- a Rosanna do Miguel (sai)
  v_kept  uuid;  -- a Rosanna que fica
  v_total int;
begin
  select count(*) into v_total from public.candidates
  where public.slugify(title) = 'rosanna' and public.slugify(artist) = 'toto';
  if v_total <> 2 then
    raise exception 'Esperava exatamente 2 "Rosanna" (Toto), encontrei %.', v_total;
  end if;

  select c.id into v_dup
  from public.candidates c
  join public.members m on m.id = c.suggested_by
  where public.slugify(c.title) = 'rosanna' and public.slugify(c.artist) = 'toto'
    and m.username = 'miguel';
  if v_dup is null then
    raise exception 'Não encontrei a Rosanna sugerida pelo miguel.';
  end if;

  select id into v_kept from public.candidates
  where public.slugify(title) = 'rosanna' and public.slugify(artist) = 'toto'
    and id <> v_dup;

  -- 1) a mantida entra em toda votação onde só a duplicada estava
  --    (herdando o added_at, para o aviso do card continuar correto)
  insert into public.poll_candidates (poll_id, candidate_id, added_at)
  select pc.poll_id, v_kept, pc.added_at
  from public.poll_candidates pc
  where pc.candidate_id = v_dup
    and not exists (select 1 from public.poll_candidates k
                    where k.poll_id = pc.poll_id and k.candidate_id = v_kept);

  -- 2) votos da duplicada passam para a mantida; quem votou nas duas
  --    fica com um só (o voto repetido some no delete do passo 3)
  update public.votes v set candidate_id = v_kept
  where v.candidate_id = v_dup
    and not exists (select 1 from public.votes k
                    where k.poll_id = v.poll_id and k.candidate_id = v_kept
                      and k.member_id = v.member_id);

  -- 3) exclui a duplicada
  delete from public.candidates where id = v_dup;

  -- 4) se a mantida herdou uma votação aberta, o status acompanha
  update public.candidates set status = 'em_votacao'
  where id = v_kept and status in ('sugerida', 'arquivada')
    and exists (select 1 from public.poll_candidates pc
                join public.polls p on p.id = pc.poll_id
                where pc.candidate_id = v_kept and p.status = 'aberta');

  raise notice 'Rosanna duplicada (%) removida; mantida a %.', v_dup, v_kept;
end $$;

-- Parte 2: trava contra duplicatas — mesma música + artista (ignorando
-- maiúsculas, acentos e pontuação, via slugify) só pode existir uma vez
-- em candidates, qualquer que seja o status. O front avisa antes; este
-- índice é a garantia no banco.
create unique index if not exists candidates_unicas
  on public.candidates (public.slugify(title), public.slugify(artist));

-- Conferência: deve sobrar exatamente 1 Rosanna.
select c.id, c.title, c.artist, c.status, m.name as sugerida_por
from public.candidates c
left join public.members m on m.id = c.suggested_by
where public.slugify(c.title) = 'rosanna';
