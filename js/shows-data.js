// Cartazes dos shows (arquivos em media/banners_shows) e helpers de exibição.
// Ganhou cartaz novo? Salve o arquivo lá e acrescente uma linha aqui.
import { el, fmtDate } from "./db.js";
export const BANNERS = [
  { date: "2026-11-14", venue: "Gravador Pub", city: "Porto Alegre",
    note: "sexta · 20h", img: "media/banners_shows/2026_11_14_Gravador.jpg" },
  { date: "2026-06-26", venue: "Encouraçado Butikin", city: "Porto Alegre",
    img: "media/banners_shows/2026_06_26_Encouracado.jpg" },
  { date: "2026-04-30", venue: "Gravador Pub", city: "Porto Alegre",
    img: "media/banners_shows/2026_04_30_Gravador.jpg" },
  { date: "2025-12-19", venue: "Encouraçado Butikin", city: "Porto Alegre",
    img: "media/banners_shows/2025_12_19_Encouracado.jpg" },
];

// Hoje no fuso local, em YYYY-MM-DD (comparável com as datas acima e do banco).
export function todayISO() {
  const d = new Date();
  return [d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")].join("-");
}

// Junta os shows do banco com os cartazes: mesma data = mesmo show
// (dados do banco prevalecem; o cartaz entra como foto).
export function mergeShows(dbShows) {
  const byDate = new Map();
  for (const b of BANNERS) byDate.set(b.date, { ...b });
  for (const s of dbShows ?? []) {
    const banner = byDate.get(s.date);
    byDate.set(s.date, { ...banner, ...s, img: banner?.img });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
               "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function weekday(iso) {
  return new Date(iso + "T12:00:00")
    .toLocaleDateString("pt-BR", { weekday: "long" });
}

// Card de show futuro: data grande + local (+ cartaz, quando houver).
export function showCard(s) {
  const [y, m, d] = s.date.split("-");
  return el("article", { class: "show-card" },
    el("div", { class: "date" },
      el("span", { class: "d" }, d),
      el("span", { class: "m" }, `${MESES[m - 1]} ${y}`)),
    el("div", { class: "info" },
      el("h3", {}, s.venue),
      el("p", {}, `${s.city} · ${s.note ?? weekday(s.date)}`)),
    s.img ? el("img", { src: s.img, alt: `Cartaz do show no ${s.venue}` }) : null,
  );
}

// Card de show passado: o cartaz (ou um card de texto) + setlist quando liberada.
export function posterCard(s) {
  const tracks = (s.show_songs ?? []).sort((a, b) => a.position - b.position);
  const setlist = s.setlist_public && tracks.length
    ? el("details", {},
        el("summary", {}, "Setlist"),
        el("ol", { class: "tracklist" }, ...tracks.map((t, i) => el("li", {},
          el("span", { class: "n" }, String(i + 1)),
          el("b", {}, t.song.title),
          el("span", { class: "artist" }, t.song.artist)))))
    : null;
  return el("figure", { class: "poster-card" + (s.img ? "" : " no-img") },
    s.img ? el("img", { src: s.img, alt: `Cartaz do show no ${s.venue}`, loading: "lazy" }) : null,
    el("figcaption", {},
      el("span", { class: "mono" }, fmtDate(s.date)),
      `${s.venue} · ${s.city}`,
      setlist),
  );
}
