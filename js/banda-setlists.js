// Backstage: Set Lists reutilizáveis (feature E).
// Listas montadas do repertório com ordem própria, intervalos, mapa de
// energia e duração estimada. Associar a um show grava shows.setlist_id e
// copia as músicas para show_songs (impressão e setlist pública continuam
// funcionando pela página de Shows, sem mudança lá).
import { db, requireAuth, el, show, fmtDate, fmtDur, parseDur } from "./db.js";

const $ = (id) => document.getElementById(id);
const { session } = await requireAuth();

let setlists = [];    // [{...setlist, setlist_items:[...], shows:[...]}]
let current = null;   // set list aberta no editor
let items = [];       // itens da set list aberta, ordenados por position
let repertoire = [];  // músicas ativas
let allShows = [];    // todos os shows (para o seletor de associação)

// ---------- abas ----------
const TABS = ["lists", "new"];
let currentTab = null;

function showTab(name) {
  currentTab = name;
  for (const t of TABS) {
    $("tab-" + t).hidden = t !== name;
    $("tab-btn-" + t).classList.toggle("active", t === name);
  }
}
for (const t of TABS) $("tab-btn-" + t).addEventListener("click", () => showTab(t));

// ---------- carga e estado ----------

async function loadAll() {
  const [sl, rep, sh] = await Promise.all([
    db.from("setlists")
      .select("*, setlist_items(id, position, kind, duration_sec, label, song:songs(id, title, artist, duration_sec, energy)), shows(id, date, venue, city)")
      .order("created_at"),
    db.from("songs").select("*").eq("status", "ativa").order("artist").order("title"),
    db.from("shows").select("id, date, venue, city, setlist_id").order("date", { ascending: false }),
  ]);
  if (sl.error) return show($("msg"), "Erro ao carregar: " + sl.error.message, "error");
  setlists = sl.data ?? [];
  repertoire = rep.data ?? [];
  allShows = sh.data ?? [];
  renderList();
  if (current) {
    current = setlists.find((s) => s.id === current.id) ?? null;
    if (current) renderEditor(); else $("editor").hidden = true;
  }
}

function sortedItems(sl) {
  return [...(sl.setlist_items ?? [])].sort((a, b) => a.position - b.position);
}

function summary(list) {
  const songs = list.filter((i) => i.kind === "song");
  const intervals = list.filter((i) => i.kind === "interval");
  const missing = songs.filter((i) => !i.song?.duration_sec).length;
  const totalSec =
    songs.reduce((t, i) => t + (i.song?.duration_sec ?? 0), 0) +
    intervals.reduce((t, i) => t + i.duration_sec, 0);
  return { nSongs: songs.length, nIntervals: intervals.length, totalSec, missing };
}

function fmtTotal(sec) {
  const min = Math.round(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

function summaryText(list) {
  const s = summary(list);
  const parts = [
    `${s.nSongs} música(s)`,
    s.nIntervals ? `${s.nIntervals} intervalo(s)` : null,
    `duração estimada ~${fmtTotal(s.totalSec)}`,
  ].filter(Boolean);
  let text = parts.join(" · ");
  if (s.missing) text += ` · ${s.missing} música(s) sem duração cadastrada (fora da estimativa)`;
  return text;
}

// ---------- lista de set lists ----------

function setlistCard(sl) {
  const list = sortedItems(sl);
  const nShows = (sl.shows ?? []).length;
  return el("div", { class: "card" },
    el("div", { class: "form-row", style: "align-items:center" },
      el("div", { class: "grow" },
        el("b", {}, sl.name),
        el("div", { class: "muted", style: "font-size:14px" },
          summaryText(list) + (nShows ? ` · ${nShows} show(s)` : "")),
      ),
      el("button", {
        class: "btn small" + (current?.id === sl.id ? "" : " ghost"),
        onclick: () => select(sl.id),
      }, current?.id === sl.id ? "Editando…" : "Abrir"),
    ),
  );
}

function renderList() {
  $("count-lists").textContent = setlists.length;
  $("setlist-list").replaceChildren(...(setlists.length
    ? setlists.map(setlistCard)
    : [el("p", { class: "empty" }, "Nenhuma set list ainda. ",
        el("a", { href: "#", onclick: (e) => { e.preventDefault(); showTab("new"); } },
          "Criar a primeira"))]));
  if (!currentTab) showTab(setlists.length > 0 ? "lists" : "new");
}

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data, error } = await db.from("setlists").insert({
    name: $("f-name").value.trim(),
    notes: $("f-notes").value.trim() || null,
    created_by: session.user.id,
  }).select().single();
  if (error) return show($("msg"), "Erro ao criar: " + error.message, "error");
  e.target.reset();
  await loadAll();
  showTab("lists");
  select(data.id);
});

// ---------- editor ----------

function select(id) {
  current = setlists.find((s) => s.id === id);
  if (!current) return;
  renderList();
  renderEditor();
  $("editor").scrollIntoView({ behavior: "smooth" });
}

function renderEditor() {
  items = sortedItems(current);
  $("editor").hidden = false;
  $("ed-title").textContent = current.name;
  $("e-name").value = current.name;
  $("e-notes").value = current.notes ?? "";
  renderItems();
  renderEnergyMap();
  renderShows();
}

$("ed-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await db.from("setlists").update({
    name: $("e-name").value.trim(),
    notes: $("e-notes").value.trim() || null,
  }).eq("id", current.id);
  if (error) return show($("msg"), "Erro ao salvar: " + error.message, "error");
  show($("msg"), "Set list salva.", "ok");
  await loadAll();
});

$("e-delete").addEventListener("click", async () => {
  const nShows = (current.shows ?? []).length;
  if (!confirm(`Excluir a set list "${current.name}"?` +
      (nShows ? `\nEla está associada a ${nShows} show(s); os shows mantêm as músicas já aplicadas, só perdem o vínculo.` : ""))) return;
  const { error } = await db.from("setlists").delete().eq("id", current.id);
  if (error) return show($("msg"), "Erro ao excluir: " + error.message, "error");
  current = null;
  $("editor").hidden = true;
  await loadAll();
});

$("e-dup").addEventListener("click", async () => {
  const { data, error } = await db.from("setlists").insert({
    name: current.name + " (cópia)",
    notes: current.notes,
    created_by: session.user.id,
  }).select().single();
  if (error) return show($("msg"), "Erro ao duplicar: " + error.message, "error");
  if (items.length) {
    const rows = items.map((it, i) => ({
      setlist_id: data.id, position: i + 1, kind: it.kind,
      song_id: it.song?.id ?? null, duration_sec: it.kind === "interval" ? it.duration_sec : null,
      label: it.label,
    }));
    const { error: e2 } = await db.from("setlist_items").insert(rows);
    if (e2) return show($("msg"), "Erro ao copiar os itens: " + e2.message, "error");
  }
  show($("msg"), `Set list duplicada como "${data.name}".`, "ok");
  await loadAll();
  select(data.id);
});

// ---------- itens (músicas e intervalos) ----------

function itemRow(it, i) {
  const actions = el("td", {}, el("div", { class: "rowactions" },
    el("button", { class: "iconbtn", disabled: i === 0 ? "" : null, onclick: () => move(i, -1) }, "↑"),
    el("button", { class: "iconbtn", disabled: i === items.length - 1 ? "" : null, onclick: () => move(i, 1) }, "↓"),
    el("button", { class: "iconbtn", onclick: () => removeItem(it) }, "✕"),
  ));
  if (it.kind === "interval") {
    return el("tr", { class: "interval-row" },
      el("td", { class: "mono" }, String(i + 1)),
      el("td", {}, "⏸ " + (it.label || "Intervalo")),
      el("td", {}, "—"),
      el("td", {}, "—"),
      el("td", {}, `${Math.round(it.duration_sec / 60)} min`),
      actions,
    );
  }
  const e = it.song?.energy;
  return el("tr", {},
    el("td", { class: "mono" }, String(i + 1)),
    el("td", {}, el("b", {}, it.song.title)),
    el("td", {}, it.song.artist),
    el("td", {}, e
      ? el("span", {}, el("span", { class: "energy-dot e" + e }), `${e}/5`)
      : el("span", { class: "muted" }, "—")),
    el("td", {}, fmtDur(it.song.duration_sec) || el("span", { class: "muted" }, "—")),
    actions,
  );
}

function renderItems() {
  const tbody = $("item-rows");
  tbody.replaceChildren(...items.map(itemRow));
  if (!items.length) {
    tbody.replaceChildren(el("tr", {},
      el("td", { colspan: "6", class: "empty" }, "Lista vazia — adicione músicas abaixo.")));
  }
  $("sl-summary").textContent = items.length ? summaryText(items) : "";

  const inList = new Set(items.filter((i) => i.kind === "song").map((i) => i.song.id));
  $("song-pick").replaceChildren(...repertoire
    .filter((s) => !inList.has(s.id))
    .map((s) => el("option", { value: s.id }, `${s.title} — ${s.artist}`)));
}

$("song-add").addEventListener("click", async () => {
  const songId = $("song-pick").value;
  if (!songId) return;
  const { error } = await db.from("setlist_items").insert({
    setlist_id: current.id, position: items.length + 1, kind: "song", song_id: songId,
  });
  if (error) return show($("msg"), "Erro ao adicionar: " + error.message, "error");
  await loadAll();
});

$("int-add").addEventListener("click", async () => {
  const min = parseInt($("int-min").value, 10);
  if (!min || min < 1) return show($("msg"), "Informe a duração do intervalo em minutos.", "error");
  const { error } = await db.from("setlist_items").insert({
    setlist_id: current.id, position: items.length + 1, kind: "interval",
    duration_sec: min * 60, label: $("int-label").value.trim() || null,
  });
  if (error) return show($("msg"), "Erro ao adicionar intervalo: " + error.message, "error");
  $("int-label").value = "";
  await loadAll();
});

async function removeItem(it) {
  await db.from("setlist_items").delete().eq("id", it.id);
  await renumber(items.filter((x) => x.id !== it.id));
}

async function move(i, delta) {
  const next = [...items];
  [next[i], next[i + delta]] = [next[i + delta], next[i]];
  await renumber(next);
}

// Regrava as posições 1..n na nova ordem.
async function renumber(ordered) {
  for (let i = 0; i < ordered.length; i++) {
    await db.from("setlist_items").update({ position: i + 1 }).eq("id", ordered[i].id);
  }
  await loadAll();
}

// ---------- mapa de energia ----------

function renderEnergyMap() {
  const box = $("energymap");
  if (!items.length) {
    box.replaceChildren(el("span", { class: "empty", style: "align-self:center" },
      "O mapa aparece quando a lista tiver músicas."));
    return;
  }
  box.replaceChildren(...items.map((it, i) => {
    if (it.kind === "interval") {
      return el("div", { class: "ebar interval",
        title: `${it.label || "Intervalo"} — ${Math.round(it.duration_sec / 60)} min` });
    }
    const e = it.song?.energy;
    return el("div", {
      class: "ebar " + (e ? "e" + e : "unknown"),
      style: `height:${(e ?? 2) * 20}%`,
      title: `${i + 1}. ${it.song.title} — ` + (e ? `energia ${e}/5` : "energia não cadastrada"),
    });
  }));
}

// ---------- associação com shows ----------

function fmtShow(s) {
  return `${fmtDate(s.date)} — ${s.venue} · ${s.city}`;
}

function renderShows() {
  const linked = [...(current.shows ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  $("show-links").replaceChildren(...(linked.length
    ? linked.map((s) => el("div", { class: "card" },
        el("div", { class: "form-row", style: "align-items:center" },
          el("div", { class: "grow" }, el("b", {}, fmtShow(s))),
          el("button", { class: "btn small ghost", onclick: () => applyToShow(s.id, true) }, "Reaplicar"),
          el("button", { class: "btn small ghost", onclick: () => unlink(s) }, "Desassociar"),
        )))
    : [el("p", { class: "empty" }, "Nenhum show associado a esta set list.")]));

  const linkedIds = new Set(linked.map((s) => s.id));
  const today = new Date().toLocaleDateString("en-CA");
  const candidates = allShows.filter((s) => !linkedIds.has(s.id));
  const upcoming = candidates.filter((s) => s.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = candidates.filter((s) => s.date < today);
  $("show-pick").replaceChildren(...[...upcoming, ...past].map((s) =>
    el("option", { value: s.id },
      fmtShow(s) + (s.date < today ? " (já aconteceu)" : "") +
      (s.setlist_id ? " — já tem set list" : ""))));
}

$("show-assoc").addEventListener("click", async () => {
  const showId = $("show-pick").value;
  if (!showId) return;
  await applyToShow(showId, false);
});

// Grava o vínculo e copia as músicas (sem intervalos) para show_songs.
async function applyToShow(showId, reapply) {
  const target = allShows.find((s) => s.id === showId);
  if (!reapply) {
    const { data: existing } = await db.from("show_songs")
      .select("song_id").eq("show_id", showId);
    if (existing?.length &&
        !confirm(`O show de ${fmtShow(target)} já tem uma setlist com ${existing.length} música(s). Substituir pela set list "${current.name}"?`)) return;
  }
  let { error } = await db.from("shows").update({ setlist_id: current.id }).eq("id", showId);
  if (error) return show($("msg"), "Erro ao associar: " + error.message, "error");

  ({ error } = await db.from("show_songs").delete().eq("show_id", showId));
  if (error) return show($("msg"), "Erro ao limpar a setlist do show: " + error.message, "error");

  const rows = items.filter((i) => i.kind === "song")
    .map((i, pos) => ({ show_id: showId, song_id: i.song.id, position: pos + 1 }));
  if (rows.length) {
    ({ error } = await db.from("show_songs").insert(rows));
    if (error) return show($("msg"), "Erro ao aplicar as músicas: " + error.message, "error");
  }
  show($("msg"), reapply
    ? "Set list reaplicada ao show."
    : "Set list associada — as músicas já estão na setlist do show.", "ok");
  await loadAll();
}

async function unlink(s) {
  const { error } = await db.from("shows").update({ setlist_id: null }).eq("id", s.id);
  if (error) return show($("msg"), "Erro ao desassociar: " + error.message, "error");
  show($("msg"), "Show desassociado (as músicas já aplicadas ficam nele).", "ok");
  await loadAll();
}

// Carga inicial no fim do módulo (todo o estado acima já inicializado).
await loadAll();
