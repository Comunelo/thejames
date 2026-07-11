// Backstage: login por magic link + dashboard com perfil.
import { db, configured, logout, show } from "./db.js";

const $ = (id) => document.getElementById(id);

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
    const email = $("email").value.trim();
    show($("login-msg"), "Enviando link…");
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: location.href },
    });
    if (error) {
      const detail = [error.code, error.status, error.message]
        .filter((x) => x && x !== "{}").join(" · ") || "erro desconhecido";
      const reason = error.code === "over_email_send_rate_limit"
        ? "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo."
        : error.code === "otp_disabled" || error.status === 422
          ? "Este e-mail não está cadastrado na banda."
          : error.status >= 500
            ? `Falha no envio do e-mail — problema na configuração do servidor (${detail}).`
            : `Não foi possível enviar o link (${detail}).`;
      show($("login-msg"), reason, "error");
    } else {
      show($("login-msg"),
        `Link enviado para ${email}. Abra o e-mail e clique para entrar.`, "ok");
    }
  });
}

async function renderDash(session) {
  $("dash").hidden = false;
  const { data: member } = await db
    .from("members").select("*").eq("id", session.user.id).single();

  $("who").textContent = member?.name ?? session.user.email;
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
}
