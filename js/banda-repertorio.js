// Backstage: gestão do repertório (feature A).
// Duração (m:ss) e energia (1–5) alimentam as Set Lists.
import { db, requireAuth, el, show, spotifyAnchor, fmtDur, parseDur } from "./db.js";

const $ = (id) => document.getElementById(id);
let songs = [];

await requireAuth();
await load();

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dur = parseDur($("f-duration").value);
  if (Number.isNaN(dur)) return show($("msg"), 'Duração inválida — use m:ss (ex.: 3:45).', "error");
  const { error } = await db.from("songs").insert({
    title: $("f-title").value.trim(),
    artist: $("f-artist").value.trim(),
    spotify_url: $("f-spotify").value.trim() || null,
    duration_sec: dur,
    energy: $("f-energy").value ? Number($("f-energy").value) : null,
  });
  if (error) return show($("msg"), "Erro ao adicionar: " + error.message, "error");
  e.target.reset();
  show($("msg"), "Música adicionada ao repertório.", "ok");
  await load();
});

$("search").addEventListener("input", render);
$("filter").addEventListener("change", render);

async function load() {
  const { data, error } = await db.from("songs")
    .select("*").order("artist").order("title");
  if (error) return show($("msg"), "Erro ao carregar: " + error.message, "error");
  songs = data;
  render();
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const f = $("filter").value;
  const list = songs.filter((s) =>
    (f === "todas" || s.status === f) &&
    (!q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)));

  const ativas = songs.filter((s) => s.status === "ativa").length;
  $("count").textContent = `${ativas} ativas · ${songs.length - ativas} aposentadas`;

  const tbody = $("rows");
  tbody.replaceChildren(...list.map(rowFor));
  $("empty").hidden = list.length > 0;
}

function energyCell(energy) {
  return energy
    ? el("span", {}, el("span", { class: "energy-dot e" + energy }), `${energy}/5`)
    : el("span", { class: "muted" }, "—");
}

function rowFor(song) {
  const tr = el("tr", {},
    el("td", {}, el("b", {}, song.title)),
    el("td", {}, song.artist),
    el("td", {}, spotifyAnchor(song.spotify_url)),
    el("td", {}, fmtDur(song.duration_sec) || el("span", { class: "muted" }, "—")),
    el("td", {}, energyCell(song.energy)),
    el("td", {}, el("span", { class: "tag " + song.status }, song.status)),
    el("td", {}, el("div", { class: "rowactions" },
      el("button", { class: "iconbtn", title: "Editar", onclick: () => editRow(tr, song) }, "✎"),
      el("button", {
        class: "iconbtn",
        title: song.status === "ativa" ? "Aposentar" : "Reativar",
        onclick: () => toggleStatus(song),
      }, song.status === "ativa" ? "⏸" : "▶"),
      el("button", { class: "iconbtn", title: "Excluir", onclick: () => remove(song) }, "🗑"),
    )),
  );
  return tr;
}

function editRow(tr, song) {
  const t = el("input", { value: song.title });
  const a = el("input", { value: song.artist });
  const s = el("input", { value: song.spotify_url ?? "", placeholder: "link do Spotify" });
  const d = el("input", { value: fmtDur(song.duration_sec), placeholder: "3:45", style: "width:70px" });
  const en = el("select", { style: "width:70px" },
    el("option", { value: "" }, "—"),
    ...[1, 2, 3, 4, 5].map((n) => {
      const o = el("option", { value: String(n) }, String(n));
      if (song.energy === n) o.selected = true;
      return o;
    }));
  tr.replaceChildren(
    el("td", {}, t), el("td", {}, a), el("td", {}, s),
    el("td", {}, d), el("td", {}, en),
    el("td", {}, el("span", { class: "tag " + song.status }, song.status)),
    el("td", {}, el("div", { class: "rowactions" },
      el("button", {
        class: "iconbtn", title: "Salvar",
        onclick: async () => {
          const dur = parseDur(d.value);
          if (Number.isNaN(dur)) return show($("msg"), 'Duração inválida — use m:ss (ex.: 3:45).', "error");
          const { error } = await db.from("songs").update({
            title: t.value.trim(), artist: a.value.trim(),
            spotify_url: s.value.trim() || null,
            duration_sec: dur,
            energy: en.value ? Number(en.value) : null,
          }).eq("id", song.id);
          if (error) return show($("msg"), "Erro ao salvar: " + error.message, "error");
          await load();
        },
      }, "✔"),
      el("button", { class: "iconbtn", title: "Cancelar", onclick: () => load() }, "✕"),
    )),
  );
  t.focus();
}

async function toggleStatus(song) {
  const status = song.status === "ativa" ? "aposentada" : "ativa";
  const { error } = await db.from("songs").update({ status }).eq("id", song.id);
  if (error) return show($("msg"), "Erro: " + error.message, "error");
  await load();
}

async function remove(song) {
  if (!confirm(`Excluir "${song.title}" (${song.artist}) do repertório?\nEla sai também das setlists antigas — para manter o histórico, prefira "aposentar".`)) return;
  const { error } = await db.from("songs").delete().eq("id", song.id);
  if (error) return show($("msg"), "Erro ao excluir: " + error.message, "error");
  await load();
}
