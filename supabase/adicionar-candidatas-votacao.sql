-- =============================================================
-- The James — adicionar candidatas a uma votação já aberta
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- IMPORTANTE: rodar ANTES do deploy do front que usa added_at.
-- =============================================================

-- Quando a candidata entrou na votação: null = presente desde a
-- abertura; preenchido = adicionada depois (o front avisa no card).
alter table public.poll_candidates
  add column if not exists added_at timestamptz;

-- Adiciona candidatas 'sugerida' a uma votação aberta (só admin).
-- Mesmo estilo de create_poll/close_poll: security definer, pois
-- poll_candidates não tem policy de escrita via RLS.
create or replace function public.add_poll_candidates(
  p_poll_id uuid, p_candidate_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare v_poll public.polls;
begin
  if not exists (select 1 from public.members where id = auth.uid() and is_admin) then
    raise exception 'Só o administrador pode adicionar candidatas a uma votação.';
  end if;
  if coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    raise exception 'Nenhuma candidata selecionada.';
  end if;

  select * into v_poll from public.polls where id = p_poll_id for update;
  if v_poll is null then raise exception 'Votação não encontrada.'; end if;
  if v_poll.status <> 'aberta' then raise exception 'Esta votação já foi encerrada.'; end if;

  -- Só entram candidatas na caixa de sugestões (isso também barra
  -- repetidas: quem já está numa votação aberta tem status 'em_votacao').
  if exists (
    select 1 from unnest(p_candidate_ids) as x(id)
    left join public.candidates c on c.id = x.id
    where c.id is null or c.status <> 'sugerida'
  ) then
    raise exception 'Só candidatas com status "sugerida" podem entrar na votação.';
  end if;

  insert into public.poll_candidates (poll_id, candidate_id, added_at)
  select p_poll_id, unnest(p_candidate_ids), now();

  update public.candidates set status = 'em_votacao'
  where id = any(p_candidate_ids);
end $$;
