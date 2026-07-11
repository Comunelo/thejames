// Agenda pública: próximos shows e histórico (com setlist quando liberada).
import { db, configured, el, fmtDate } from "./db.js";

const $ = (id) => document.getElementById(id);

if (!configured) {
  $("upcoming").replaceChildren(el("p", { class: "empty" }, "Agenda em breve."));
  $("past").replaceChildren(el("p", { class: "empty" }, ""));
} else {
  const { data: shows } = await db.from("shows")
    .select("id, date, venue, city, setlist_public, show_songs(position, song:songs(title, artist))")
    .eq("is_public", true).order("date", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (shows ?? []).filter((s) => s.date >= today).reverse();
  const past = (shows ?? []).filter((s) => s.date < today);

  fill($("upcoming"), upcoming, "Nenhum show marcado no momento — volte em breve!");
  fill($("past"), past, "O histórico aparece aqui depois do primeiro show.");
}

function fill(box, list, emptyMsg) {
  if (!list.length) {
    box.replaceChildren(el("p", { class: "empty" }, emptyMsg));
    return;
  }
  box.replaceChildren(...list.map((s) => {
    const tracks = (s.show_songs ?? []).sort((a, b) => a.position - b.position);
    return el("div", { class: "card" },
      el("b", { class: "mono" }, fmtDate(s.date)),
      ` — ${s.venue}`, el("span", { class: "muted" }, ` · ${s.city}`),
      s.setlist_public && tracks.length
        ? el("ol", { class: "tracklist" }, ...tracks.map((t, i) => el("li", {},
            el("span", { class: "n" }, String(i + 1)),
            el("b", {}, t.song.title),
            el("span", { class: "artist" }, t.song.artist))))
        : null,
    );
  }));
}
