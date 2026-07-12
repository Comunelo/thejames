// Backstage: login por usuário + senha e dashboard com perfil.
import { db, configured, logout, show } from "./db.js";

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
  const { data: member } = await db
    .from("members").select("*").eq("id", session.user.id).single();

  $("who").textContent = member?.name ?? session.user.email;
  $("p-user").textContent = member?.username ?? session.user.email.split("@")[0];
  $("p-name").value = member?.name ?? "";
  $("p-instrument").value = member?.instrument ?? "";

  $("logout").addEventListener("click", (e) => { e.preventDefault(); logout(); });

  $("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await db.from("members").update({
      name: $("p-name").value.trim(),
      instrument: $("p-instrument").value.trim() || null,
    }).eq("id", session.user.id);
    show($("profile-msg"), error ? "Erro ao salvar: " + error.message : "Perfil salvo.",
      error ? "error" : "ok");
    if (!error) $("who").textContent = $("p-name").value.trim();
  });

  $("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await db.auth.updateUser({ password: $("new-password").value });
    show($("password-msg"),
      error
        ? (error.code === "same_password"
            ? "A nova senha precisa ser diferente da atual."
            : "Erro ao trocar a senha: " + error.message)
        : "Senha alterada.",
      error ? "error" : "ok");
    if (!error) $("new-password").value = "";
  });
}
