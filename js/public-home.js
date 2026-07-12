// Home pública: próximos shows (banco + cartazes).
import { db, configured, el } from "./db.js";
import { mergeShows, todayISO, showCard } from "./shows-data.js";

const box = document.getElementById("upcoming");

let dbShows = [];
if (configured) {
  const { data } = await db.from("shows")
    .select("date, venue, city").eq("is_public", true)
    .gte("date", todayISO()).order("date").limit(5);
  dbShows = data ?? [];
}

const upcoming = mergeShows(dbShows).filter((s) => s.date >= todayISO()).slice(0, 3);

box.replaceChildren(
  ...(upcoming.length
    ? upcoming.map(showCard)
    : [el("p", { class: "empty" }, "Nenhum show marcado no momento — volte em breve!")]),
);
