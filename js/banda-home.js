// Backstage: login por usuário + senha e dashboard com resumo da banda.
import { db, configured, logout, el, show, fmtDate, avatarEl } from "./db.js";

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
  const [member, songs, nextShows, polls, agEvents, agMarks] = await Promise.all([
    db.from("members").select("name").eq("id", session.user.id).single(),
    db.from("songs").select("id", { count: "exact", head: true }).eq("status", "ativa"),
    db.from("shows").select("date, venue").gte("date", today)
      .order("date").limit(6),
    db.from("polls").select("id", { count: "exact", head: true }).eq("status", "aberta"),
    db.from("band_events").select("day, kind, show_id").eq("status", "confirmado")
      .gte("day", today).order("day").limit(6),
    db.from("availability_marks").select("member_id, day, kind").gte("day", today),
  ]);
  const nextEvent = { data: agEvents.data?.[0] ?? null };

  const username = session.user.email.split("@")[0];
  const name = member.data?.name ?? username;
  $("who").textContent = name;
  document.querySelector("#dash .who").prepend(avatarEl(username, name));
  $("st-songs").textContent = songs.count ?? "—";
  $("st-polls").textContent = polls.count ?? "—";

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
    const k = nextEvent.data.kind === "show"
      ? (nextEvent.data.show_id ? "show" : "possível show") : "ensaio";
    parts.push(`próximo: ${fmtDate(nextEvent.data.day).slice(0, 5)} ${k}`);
  }
  if (parts.length) $("agenda-news").textContent = parts.join(" · ");

  // próximos 6 eventos (shows reais + eventos da agenda): ★ show confirmado,
  // ☆ possível show (banda topou, casa não fechada), ♪ ensaio.
  // Evento já promovido a show (show_id) sai da lista — o show real cobre.
  const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const upcoming = [
    ...(nextShows.data ?? []).map((s) => ({
      day: s.date, kind: "show", label: s.venue, href: "shows.html" })),
    ...(agEvents.data ?? []).filter((e) => !e.show_id).map((e) => ({
      day: e.day, kind: e.kind, poss: e.kind === "show",
      label: e.kind === "show" ? "Possível show" : "Ensaio", href: "agenda.html" })),
  ].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 6);
  if (upcoming.length) {
    $("next-box").hidden = false;
    $("next-list").replaceChildren(...upcoming.map((ev) =>
      el("li", { class: "link", onclick: () => { location.href = ev.href; } },
        el("span", { class: "evicon " + ev.kind + (ev.poss ? " poss" : "") },
          ev.kind === "show" ? (ev.poss ? "☆" : "★") : "♪"),
        el("span", { class: "d" },
          `${DIAS[new Date(ev.day + "T12:00:00").getDay()]} ${fmtDate(ev.day)}`),
        el("span", { class: "k" }, ev.label))));
  }
}
