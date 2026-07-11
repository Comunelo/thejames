// Repertório público (somente músicas ativas — garantido pelo RLS).
import { db, configured, el, spotifyAnchor } from "./db.js";

const $ = (id) => document.getElementById(id);
let songs = [];

if (!configured) {
  $("empty").hidden = false;
} else {
  const { data } = await db.from("songs")
    .select("title, artist, spotify_url").order("artist").order("title");
  songs = data ?? [];
  render();
  $("search").addEventListener("input", render);
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const list = songs.filter((s) =>
    !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  $("count").textContent = `${list.length} música(s)`;
  $("rows").replaceChildren(...list.map((s) => el("tr", {},
    el("td", {}, el("b", {}, s.title)),
    el("td", {}, s.artist),
    el("td", {}, spotifyAnchor(s.spotify_url)),
  )));
  $("empty").hidden = list.length > 0;
}
