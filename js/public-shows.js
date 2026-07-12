// Agenda pública: próximos shows e os que já aconteceram (cartazes + setlists).
import { db, configured, el } from "./db.js";
import { mergeShows, todayISO, showCard, posterCard } from "./shows-data.js";

const $ = (id) => document.getElementById(id);

let dbShows = [];
if (configured) {
  const { data } = await db.from("shows")
    .select("id, date, venue, city, setlist_public, show_songs(position, song:songs(title, artist))")
    .eq("is_public", true);
  dbShows = data ?? [];
}

const today = todayISO();
const all = mergeShows(dbShows);
const upcoming = all.filter((s) => s.date >= today);           // mais próximo primeiro
const past = all.filter((s) => s.date < today).reverse();      // mais recente primeiro

$("upcoming").replaceChildren(
  ...(upcoming.length
    ? upcoming.map(showCard)
    : [el("p", { class: "empty" }, "Nenhum show marcado no momento — volte em breve!")]),
);

$("past").replaceChildren(
  past.length
    ? el("div", { class: "poster-grid" }, ...past.map(posterCard))
    : el("p", { class: "empty" }, "O histórico aparece aqui depois do primeiro show."),
);
