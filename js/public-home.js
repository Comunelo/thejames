// Home pública: próximos shows.
import { db, configured, el, fmtDate } from "./db.js";

const box = document.getElementById("upcoming");

if (!configured) {
  box.replaceChildren(el("p", { class: "empty" }, "Agenda em breve."));
} else {
  const today = new Date().toISOString().slice(0, 10);
  const { data: shows } = await db.from("shows")
    .select("date, venue, city").eq("is_public", true)
    .gte("date", today).order("date").limit(5);
  box.replaceChildren(
    shows?.length
      ? el("div", {}, ...shows.map((s) => el("div", { class: "card" },
          el("b", { class: "mono" }, fmtDate(s.date)),
          ` — ${s.venue}`, el("span", { class: "muted" }, ` · ${s.city}`))))
      : el("p", { class: "empty" }, "Nenhum show marcado no momento — volte em breve!"),
  );
}
