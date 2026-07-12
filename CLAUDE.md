# The James — contexto para o Claude

Site da banda (covers 70s/80s), live em https://www.thejames.com.br via GitHub Pages.
Setup completo e passos pendentes: ver README.md.

## Convenções
- HTML/CSS/JS puro, sem build. Deploy = push na `main` (~1 min).
- Um módulo JS por página em `js/`; cliente e helpers compartilhados em `js/db.js`.
- Toda a segurança está no Postgres (RLS + funções em `supabase/schema.sql`), nunca no front.
- UI em português; identidade visual retrô 70s em `css/style.css` (tokens no `:root`).

## Cuidados neste ambiente
- `git push` pode falhar com erro HTTP2 → usar `git -c http.version=HTTP/1.1 push`.
- `js/config.js` contém a anon key do Supabase — pública por design, não é segredo.
- Login do backstage é usuário + senha (Supabase Auth com e-mail sintético
  `<usuario>@thejames.local`; usuário = nome slugificado, senha inicial =
  telefone). Nada de e-mail/SMTP — magic link foi abandonado porque caixas
  corporativas Microsoft quarentenavam as mensagens. Integrantes são criados
  pelo admin com `admin_create_member` no SQL Editor.
