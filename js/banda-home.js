// Backstage: login por usuário + senha e dashboard com resumo da banda.
import { db, configured, logout, show, fmtDate, avatarEl } from "./db.js";

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
  const [member, songs, nextShow, polls, nextEvent, agMarks] = await Promise.all([
    db.from("members").select("name").eq("id", session.user.id).single(),
    db.from("songs").select("id", { count: "exact", head: true }).eq("status", "ativa"),
    db.from("shows").select("date, venue").gte("date", today)
      .order("date").limit(1).maybeSingle(),
    db.from("polls").select("id", { count: "exact", head: true }).eq("status", "aberta"),
    db.from("band_events").select("day, kind").eq("status", "confirmado")
      .gte("day", today).order("day").limit(1).maybeSingle(),
    db.from("availability_marks").select("member_id, day, kind").gte("day", today),
  ]);

  const username = session.user.email.split("@")[0];
  const name = member.data?.name ?? username;
  $("who").textContent = name;
  document.querySelector("#dash .who").prepend(avatarEl(username, name));
  $("st-songs").textContent = songs.count ?? "—";
  $("st-polls").textContent = polls.count ?? "—";
  $("st-next").textContent = nextShow.data
    ? `${fmtDate(nextShow.data.date).slice(0, 5)} · ${nextShow.data.venue}`
    : "nada marcado";

  // novidades da agenda: datas em que outros já marcaram e eu não
  const marks = agMarks.data ?? [];
  const mine = new Set(marks
    .filter((k) => k.member_id === session.user.id).map((k) => k.day + "|" + k.kind));
  const waiting = new Set(marks
    .filter((k) => k.member_id !== session.user.id && !mine.has(k.day + "|" + k.kind))
    .map((k) => k.day)).size;
  const parts = [];
  if (waiting) parts.push(waiting === 1
    ? "1 data esperando você" : `${waiting} datas esperando você`);
  if (nextEvent.data) {
    parts.push(`próximo: ${fmtDate(nextEvent.data.day).slice(0, 5)} ${nextEvent.data.kind}`);
  }
  if (parts.length) $("agenda-news").textContent = parts.join(" · ");
}
