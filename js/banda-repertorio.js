// Backstage: gestão do repertório (feature A).
import { db, requireAuth, el, show, spotifyAnchor } from "./db.js";

const $ = (id) => document.getElementById(id);
let songs = [];

await requireAuth();
await load();

// Capa do álbum via oEmbed público do Spotify (sem autenticação, com CORS).
async function coverFor(spotifyUrl) {
  if (!spotifyUrl) return null;
  try {
    const r = await fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(spotifyUrl));
    return (await r.json()).thumbnail_url ?? null;
  } catch { return null; }
}

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const spotify = $("f-spotify").value.trim() || null;
  const { error } = await db.from("songs").insert({
    title: $("f-title").value.trim(),
    artist: $("f-artist").value.trim(),
    spotify_url: spotify,
    cover_url: await coverFor(spotify),
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

function rowFor(song) {
  const tr = el("tr", {},
    el("td", { class: "covertd" }, song.cover_url
      ? el("img", { class: "cover", src: song.cover_url, alt: "", loading: "lazy" })
      : el("div", { class: "cover ph" })),
    el("td", {}, el("b", {}, song.title)),
    el("td", {}, song.artist),
    el("td", {}, spotifyAnchor(song.spotify_url)),
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
  tr.replaceChildren(
    el("td", { class: "covertd" }), el("td", {}, t), el("td", {}, a), el("td", {}, s),
    el("td", {}, el("span", { class: "tag " + song.status }, song.status)),
    el("td", {}, el("div", { class: "rowactions" },
      el("button", {
        class: "iconbtn", title: "Salvar",
        onclick: async () => {
          const spotify = s.value.trim() || null;
          const { error } = await db.from("songs").update({
            title: t.value.trim(), artist: a.value.trim(),
            spotify_url: spotify,
            cover_url: await coverFor(spotify),
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
