# The James — site da banda

Site do **The James** (covers de classic rock e pop).

- **Área pública**: home, repertório e agenda de shows.
- **Backstage** (`/banda`, só integrantes): gestão do repertório, setlists de
  shows, músicas candidatas e votações para escolher as próximas do repertório.

**Stack**: HTML/CSS/JS puro hospedado no GitHub Pages + [Supabase](https://supabase.com)
(banco Postgres, login por usuário + senha e segurança via Row Level Security).
Custo mensal: **R$ 0**.

---

## Configuração (fazer uma vez)

### 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo
   (região `South America (São Paulo)`).
2. No painel, abra **SQL Editor**, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e execute (**Run**).

### 2. Desligar o cadastro aberto e criar os acessos da banda

O login do backstage é **usuário + senha** (sem e-mail): o usuário é o nome do
integrante em minúsculas e sem acentos, e a senha inicial é o telefone dele
(9 dígitos) — que ele pode trocar quando quiser, no próprio backstage.

1. Em **Authentication → Sign In / Up**: desative **"Allow new users to sign up"**
   e mantenha o provedor **Email** ativado (é ele que valida a senha).
2. No **SQL Editor**, crie cada integrante (nome e telefone com 9 dígitos):

   ```sql
   select public.admin_create_member('Cláudio', '999999999');
   -- retorna o usuário criado (ex.: "claudio")
   -- opcional: 3º parâmetro = instrumento, 4º = usuário explícito
   -- select public.admin_create_member('João Silva', '988887777', 'baixo', 'joao');
   ```

3. Para se tornar admin: **Table Editor → members**, edite a sua linha e marque
   `is_admin = true`.
4. Se alguém esquecer a senha, o admin redefine no SQL Editor:
   `select public.admin_set_password('claudio', 'novasenha');`

> Banco criado com o `schema.sql` antigo (era do magic link)? Rode uma vez o
> [`supabase/migracao-login-senha.sql`](supabase/migracao-login-senha.sql) —
> as instruções estão no topo do arquivo. SMTP e templates de e-mail não são
> mais usados.

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
- **Backstage**: `www.thejames.com.br/banda/` → usuário (nome em minúsculas,
  sem acentos) + senha (a inicial é o telefone, 9 dígitos). Troca de senha é
  opcional, na própria página; senha esquecida → admin roda
  `admin_set_password` no SQL Editor.
- **Fluxo das músicas novas**: qualquer integrante sugere em **Candidatas** →
  alguém abre uma **Votação** (X vagas + prazo) → cada um dá seus X votos
  (ocultos até o fim) → ao encerrar, as mais votadas entram sozinhas no
  **Repertório**; as demais voltam para a caixa de sugestões.
- **Empate na última vaga**: quem encerra a votação escolhe entre as empatadas
  (a tela pede o desempate).

## Estrutura

```
index.html            home pública (hero com foto de show + seção sobre a banda)
repertorio.html       repertório público (só músicas ativas)
shows.html            agenda pública (próximos + cartazes dos anteriores)
banda/                backstage (login + 4 ferramentas)
media/                foto do hero e cartazes dos shows (banners_shows/)
js/shows-data.js      manifesto dos cartazes + helpers de exibição de shows
css/style.css         identidade visual (cores do cartaz: carmim/violeta)
js/config.js          URL e anon key do Supabase  ← único arquivo a configurar
js/db.js              cliente + helpers compartilhados
js/*.js               um módulo por página
supabase/schema.sql   tabelas, regras de segurança e funções de votação
supabase/migracao-login-senha.sql   migração p/ bancos criados na era do magic link
```
