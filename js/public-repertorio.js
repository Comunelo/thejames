// Repertório público (somente músicas ativas — garantido pelo RLS).
// Clique no cabeçalho "Música" ou "Artista" para ordenar.
import { db, configured, el, spotifyAnchor } from "./db.js";

const $ = (id) => document.getElementById(id);
let songs = [];
let sortBy = "artist";   // ordenação inicial: artista, depois música
let sortDir = 1;         // 1 = A→Z, -1 = Z→A

if (!configured) {
  $("empty").hidden = false;
} else {
  // select * para tolerar colunas novas/removidas no banco
  const { data } = await db.from("songs").select("*");
  songs = data ?? [];
  render();
  $("search").addEventListener("input", render);
  for (const th of document.querySelectorAll("th.sortable")) {
    th.addEventListener("click", () => {
      const field = th.dataset.field;
      if (sortBy === field) sortDir = -sortDir;
      else { sortBy = field; sortDir = 1; }
      render();
    });
  }
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const list = songs
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
    .sort((a, b) =>
      sortDir * a[sortBy].localeCompare(b[sortBy], "pt-BR", { sensitivity: "base" })
      || a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));

  for (const th of document.querySelectorAll("th.sortable")) {
    th.querySelector(".dir").textContent =
      th.dataset.field === sortBy ? (sortDir === 1 ? " ▲" : " ▼") : "";
  }

  $("count").textContent = `${list.length} música(s)`;
  $("rows").replaceChildren(...list.map((s) => el("tr", {},
    el("td", {}, el("b", {}, s.title)),
    el("td", {}, s.artist),
    el("td", {}, spotifyAnchor(s.spotify_url)),
  )));
  $("empty").hidden = list.length > 0;
}
