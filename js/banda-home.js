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

  // Erro vindo do link do e-mail (ex.: link expirado ou consumido pelo
  // antivírus corporativo) chega no hash da URL.
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("error_code") === "otp_expired") {
    show($("login-msg"),
      "Este link já expirou ou foi usado. Peça um novo e, se preferir, entre digitando o código de 6 dígitos do e-mail.",
      "error");
    history.replaceState(null, "", location.pathname);
  }

  $("code-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await db.auth.verifyOtp({
      email: $("email").value.trim(),
      token: $("code").value.trim(),
      type: "email",
    });
    if (error) {
      show($("login-msg"), "Código inválido ou expirado — peça um novo e-mail.", "error");
    } else {
      location.reload();
    }
  });

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
        `E-mail enviado para ${email}. Clique no link — ou digite abaixo o código de 6 dígitos que está no e-mail.`,
        "ok");
      $("code-form").hidden = false;
      $("code").focus();
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
