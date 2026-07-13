# The James — contexto para o Claude

Site da banda (covers de classic rock e pop), live em https://www.thejames.com.br via GitHub Pages.
Setup completo e passos pendentes: ver README.md.

## Convenções
- HTML/CSS/JS puro, sem build. Deploy = push na `main` (~1 min).
- Um módulo JS por página em `js/`; cliente e helpers compartilhados em `js/db.js`.
- Toda a segurança está no Postgres (RLS + funções em `supabase/schema.sql`), nunca no front.
- UI em português; a banda é sempre "**a** The James" (artigo feminino).
- Identidade visual em `css/style.css` (tokens no `:root`): público = carmim
  #AF072A (do cartaz de show), backstage = âmbar de camarim #F0B43C
  (`body.banda`, com fundo fotográfico e fileira de lâmpadas de marquise).
- Cartazes de shows ficam em `media/banners_shows/` e são listados no manifesto
  `js/shows-data.js` (cartaz novo = salvar arquivo + acrescentar linha lá).
  Fotos profissionais em `media/photos/`; hero e faixas p&b derivados delas
  em `media/*.jpg`. Foto de cada integrante em `media/avatars/<usuario>.jpg`
  (usuário = slug do login); o backstage a mostra no dashboard e no perfil
  via `avatarEl` (`js/db.js`), com a inicial do nome como fallback.
- Scripts SQL que o admin roda no SQL Editor: `schema.sql` (instalação),
  `migracao-login-senha.sql`, `seed-repertorio.sql`, `update-spotify.sql`
  (os três últimos já rodados no banco de produção em 12/07/2026) e
  `adicionar-candidatas-votacao.sql` (coluna `poll_candidates.added_at` +
  função `add_poll_candidates`; rodar ANTES do deploy do front que a usa).

- Ferramentas do backstage com mais de um contexto usam abas (`.tabs`/`.tab`,
  ver Votações e Shows); tabelas têm cabeçalhos ordenáveis (`th.sortable`).
- Em módulos ES com `await` no topo: a carga inicial fica no FIM do arquivo
  (chamar antes das declarações `let` dá erro de TDZ — já quebrou a página
  de votações uma vez).
- Páginas do backstage são testáveis sem credenciais: sessão falsa no
  localStorage (`sb-<ref>-auth-token`) + Playwright interceptando
  `lpadlajkeqepdabitgvp.supabase.co` com um mock em memória.

## Cuidados neste ambiente
- `git push` pode falhar com erro HTTP2 → usar `git -c http.version=HTTP/1.1 push`.
- `js/config.js` contém a anon key do Supabase — pública por design, não é segredo.
- Login do backstage é usuário + senha (Supabase Auth com e-mail sintético
  `<usuario>@thejames.local`; usuário = nome slugificado, senha inicial =
  telefone). Nada de e-mail/SMTP — magic link foi abandonado porque caixas
  corporativas Microsoft quarentenavam as mensagens. Integrantes são criados
  pelo admin com `admin_create_member` no SQL Editor.
