// Backstage: músicas candidatas — caixa de sugestões (feature C).
import { db, requireAuth, el, show, fmtDate, spotifyAnchor } from "./db.js";

const $ = (id) => document.getElementById(id);
let candidates = [];

const { session } = await requireAuth();
await load();

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.from("candidates").insert({
    title: $("f-title").value.trim(),
    artist: $("f-artist").value.trim(),
    spotify_url: $("f-spotify").value.trim() || null,
    note: $("f-note").value.trim() || null,
    suggested_by: session.user.id,
  });
  if (error) return show($("msg"), "Erro ao sugerir: " + error.message, "error");
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

function render() {
  const f = $("filter").value;
  const list = candidates.filter((c) =>
    f === "todas" ? true :
    f === "ativas" ? (c.status === "sugerida" || c.status === "em_votacao") :
    c.status === f);

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
