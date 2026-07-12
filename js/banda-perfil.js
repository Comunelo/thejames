// Backstage · Meu perfil: dados do integrante e troca de senha.
import { db, requireAuth, show, avatarEl } from "./db.js";

const $ = (id) => document.getElementById(id);
const { session, member } = await requireAuth();

const username = member?.username ?? session.user.email.split("@")[0];
$("p-user").textContent = username;
document.querySelector(".banda-header .who")
  .prepend(avatarEl(username, member?.name, "lg"));
$("p-name").value = member?.name ?? "";
$("p-instrument").value = member?.instrument ?? "";

$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.from("members").update({
    name: $("p-name").value.trim(),
    instrument: $("p-instrument").value.trim() || null,
  }).eq("id", session.user.id);
  show($("profile-msg"), error ? "Erro ao salvar: " + error.message : "Perfil salvo.",
    error ? "error" : "ok");
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
