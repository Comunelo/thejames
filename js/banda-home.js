// Backstage: login por usuário + senha e dashboard com resumo da banda.
import { db, configured, logout, show, fmtDate } from "./db.js";

const $ = (id) => document.getElementById(id);

// "João Márcio" -> "joaomarcio" — mesma regra da função slugify do banco.
// O e-mail em auth.users é sintético (<usuario>@thejames.local), nunca recebe nada.
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");

if (!configured) {
  document.querySelector(".wrap").innerHTML =
    '<div class="notice error">Supabase ainda não configurado — edite <code>js/config.js</code>.</div>';
} else {
  init();
}

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session) renderDash(session);
  else renderLogin();
}

function renderLogin() {
  $("login").hidden = false;

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    show($("login-msg"), "Entrando…");
    const { error } = await db.auth.signInWithPassword({
      email: slug($("user").value) + "@thejames.local",
      password: $("password").value,
    });
    if (error) {
      show($("login-msg"),
        error.status === 400
          ? "Usuário ou senha incorretos."
          : `Não foi possível entrar (${error.message}).`,
        "error");
    } else {
      location.reload();
    }
  });
}

async function renderDash(session) {
  $("dash").hidden = false;
  $("logout").addEventListener("click", (e) => { e.preventDefault(); logout(); });

  const today = new Date().toLocaleDateString("en-CA");
  const [member, songs, nextShow, polls] = await Promise.all([
    db.from("members").select("name").eq("id", session.user.id).single(),
    db.from("songs").select("id", { count: "exact", head: true }).eq("status", "ativa"),
    db.from("shows").select("date, venue").gte("date", today)
      .order("date").limit(1).maybeSingle(),
    db.from("polls").select("id", { count: "exact", head: true }).eq("status", "aberta"),
  ]);

  $("who").textContent = member.data?.name ?? session.user.email.split("@")[0];
  $("st-songs").textContent = songs.count ?? "—";
  $("st-polls").textContent = polls.count ?? "—";
  $("st-next").textContent = nextShow.data
    ? `${fmtDate(nextShow.data.date).slice(0, 5)} · ${nextShow.data.venue}`
    : "nada marcado";
}
