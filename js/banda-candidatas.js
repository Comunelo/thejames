// Backstage: músicas candidatas — caixa de sugestões (feature C).
import { db, requireAuth, el, show, fmtDate, spotifyAnchor } from "./db.js";

const $ = (id) => document.getElementById(id);
let candidates = [];
let sortBy = null;   // null = mais recentes primeiro (ordem do banco)
let sortDir = 1;

const { session } = await requireAuth();
await load();

for (const th of document.querySelectorAll("th.sortable")) {
  th.addEventListener("click", () => {
    const field = th.dataset.field;
    if (sortBy === field) sortDir = -sortDir;
    else { sortBy = field; sortDir = 1; }
    render();
  });
}

// Espelha public.slugify do schema.sql (mesma regra do índice único
// candidates_unicas): minúsculas, sem acentos, só letras e dígitos.
const slugify = (s) => s
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]/g, "");

const STATUS_DUP = {
  sugerida: "já foi sugerida",
  em_votacao: "já está em votação",
  aprovada: "já foi aprovada em votação",
  arquivada: "está arquivada — reative-a com ↩ em vez de sugerir de novo",
};

// Duplicata em potencial: mesma música + artista nas candidatas (qualquer
// status) ou já no repertório. Devolve a mensagem de bloqueio, ou null.
async function duplicataDe(title, artist) {
  const t = slugify(title), a = slugify(artist);
  const cand = candidates.find((c) =>
    slugify(c.title) === t && slugify(c.artist) === a);
  if (cand) {
    return `"${cand.title}" (${cand.artist}) ${STATUS_DUP[cand.status] ?? "já existe nas candidatas"}.`;
  }
  const { data: songs } = await db.from("songs").select("title, artist");
  const song = (songs ?? []).find((s) =>
    slugify(s.title) === t && slugify(s.artist) === a);
  if (song) return `"${song.title}" (${song.artist}) já está no repertório da banda.`;
  return null;
}

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("f-title").value.trim();
  const artist = $("f-artist").value.trim();

  const dup = await duplicataDe(title, artist);
  if (dup) return show($("msg"), "Sugestão repetida: " + dup, "error");

  const { error } = await db.from("candidates").insert({
    title,
    artist,
    spotify_url: $("f-spotify").value.trim() || null,
    note: $("f-note").value.trim() || null,
    suggested_by: session.user.id,
  });
  if (error) {
    // rede de segurança: índice único candidates_unicas no banco
    const msg = error.code === "23505" || error.message.includes("candidates_unicas")
      ? "Sugestão repetida: essa música já existe nas candidatas."
      : "Erro ao sugerir: " + error.message;
    return show($("msg"), msg, "error");
  }
  e.target.reset();
  show($("msg"), "Sugestão registrada — ela pode entrar na próxima votação.", "ok");
  await load();
});

$("filter").addEventListener("change", render);

async function load() {
  const { data, error } = await db.from("candidates")
    .select("*, suggester:members!candidates_suggested_by_fkey(name)")
    .order("created_at", { ascending: false });
  if (error) return show($("msg"), "Erro ao carregar: " + error.message, "error");
  candidates = data;
  render();
}

const sortKey = (c) =>
  sortBy === "suggester" ? (c.suggester?.name ?? "") : (c[sortBy] ?? "");

function render() {
  const f = $("filter").value;
  const list = candidates.filter((c) =>
    f === "todas" ? true :
    f === "ativas" ? (c.status === "sugerida" || c.status === "em_votacao") :
    c.status === f);

  if (sortBy) {
    list.sort((a, b) =>
      sortDir * sortKey(a).localeCompare(sortKey(b), "pt-BR", { sensitivity: "base" })
      || a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));
  }
  for (const th of document.querySelectorAll("th.sortable")) {
    th.querySelector(".dir").textContent =
      th.dataset.field === sortBy ? (sortDir === 1 ? " ▲" : " ▼") : "";
  }

  $("rows").replaceChildren(...list.map((c) =>
    el("tr", {},
      el("td", {}, el("b", {}, c.title),
        c.note ? el("div", { class: "muted", style: "font-size:13px" }, "“" + c.note + "”") : null),
      el("td", {}, c.artist),
      el("td", {}, spotifyAnchor(c.spotify_url)),
      el("td", { class: "muted" }, `${c.suggester?.name ?? "—"} · ${fmtDate(c.created_at)}`),
      el("td", {}, el("span", { class: "tag " + c.status }, c.status.replace("_", " "))),
      el("td", {}, el("div", { class: "rowactions" },
        c.status === "sugerida"
          ? el("button", { class: "iconbtn", title: "Arquivar", onclick: () => setStatus(c, "arquivada") }, "📦")
          : null,
        c.status === "arquivada"
          ? el("button", { class: "iconbtn", title: "Reativar sugestão", onclick: () => setStatus(c, "sugerida") }, "↩")
          : null,
        (c.status === "sugerida" || c.status === "arquivada")
          ? el("button", { class: "iconbtn", title: "Excluir", onclick: () => remove(c) }, "🗑")
          : null,
      )),
    ),
  ));
  $("empty").hidden = list.length > 0;
}

async function setStatus(c, status) {
  const { error } = await db.from("candidates").update({ status }).eq("id", c.id);
  if (error) return show($("msg"), "Erro: " + error.message, "error");
  await load();
}

async function remove(c) {
  if (!confirm(`Excluir a sugestão "${c.title}" (${c.artist})?`)) return;
  const { error } = await db.from("candidates").delete().eq("id", c.id);
  if (error) return show($("msg"), "Erro ao excluir: " + error.message, "error");
  await load();
}
