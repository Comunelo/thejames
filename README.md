# The James — site da banda

Site do **The James** (covers de classic rock & yacht rock, anos 70/80).

- **Área pública**: home, repertório e agenda de shows.
- **Backstage** (`/banda`, só integrantes): gestão do repertório, setlists de
  shows, músicas candidatas e votações para escolher as próximas do repertório.

**Stack**: HTML/CSS/JS puro hospedado no GitHub Pages + [Supabase](https://supabase.com)
(banco Postgres, login por magic link e segurança via Row Level Security).
Custo mensal: **R$ 0**.

---

## Configuração (fazer uma vez)

### 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo
   (região `South America (São Paulo)`).
2. No painel, abra **SQL Editor**, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e execute (**Run**).

### 2. Desligar o cadastro aberto e convidar a banda

1. Em **Authentication → Sign In / Up**: desative **"Allow new users to sign up"**.
   (O login por magic link continua funcionando para usuários já cadastrados.)
2. Em **Authentication → Users → Add user → Send invitation**: convide o e-mail
   de cada um dos 5 integrantes. Cada convite cria o usuário e a linha na tabela
   `members` automaticamente.
3. Para se tornar admin: **Table Editor → members**, edite a sua linha e marque
   `is_admin = true`.
4. Em **Authentication → URL Configuration**: em **Site URL** coloque
   `https://www.thejames.com.br` e adicione em **Redirect URLs**:
   `https://www.thejames.com.br/**` e `https://comunelo.github.io/**`
   (para o magic link funcionar antes e depois do domínio).

### 3. Apontar o site para o Supabase

1. No painel: **Project Settings → API** — copie a **Project URL** e a
   **anon public key**.
2. Edite [`js/config.js`](js/config.js) e cole os dois valores.
3. Commit e push — o GitHub Pages publica sozinho.

> A anon key é pública por design: quem protege os dados são as regras RLS
> do banco, não a chave.

### 4. Domínio www.thejames.com.br

1. No repositório: **Settings → Pages → Custom domain** = `www.thejames.com.br`.
2. No [Registro.br](https://registro.br), na zona DNS do domínio:
   - `CNAME` — nome `www`, valor `comunelo.github.io`
   - (opcional, para o domínio sem www) registros `A` no apex apontando para
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. Aguarde a propagação (minutos a algumas horas) e marque **Enforce HTTPS**
   no GitHub Pages.

---

## Dia a dia

- **Publicar mudanças no site**: `git push` (Pages atualiza em ~1 min).
- **Backstage**: `www.thejames.com.br/banda/` → digite o e-mail → clique no
  link recebido.
- **Fluxo das músicas novas**: qualquer integrante sugere em **Candidatas** →
  alguém abre uma **Votação** (X vagas + prazo) → cada um dá seus X votos
  (ocultos até o fim) → ao encerrar, as mais votadas entram sozinhas no
  **Repertório**; as demais voltam para a caixa de sugestões.
- **Empate na última vaga**: quem encerra a votação escolhe entre as empatadas
  (a tela pede o desempate).

## Estrutura

```
index.html            home pública
repertorio.html       repertório público (só músicas ativas)
shows.html            agenda pública (+ setlists liberadas)
banda/                backstage (login + 4 ferramentas)
css/style.css         identidade visual (retro 70s/80s)
js/config.js          URL e anon key do Supabase  ← único arquivo a configurar
js/db.js              cliente + helpers compartilhados
js/*.js               um módulo por página
supabase/schema.sql   tabelas, regras de segurança e funções de votação
```
