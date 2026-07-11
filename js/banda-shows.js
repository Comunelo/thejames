// Backstage: shows e setlists ordenadas (feature B).
import { db, requireAuth, el, show, fmtDate } from "./db.js";

const $ = (id) => document.getElementById(id);
let shows = [];
let current = null;   // show selecionado
let setlist = [];     // [{position, song:{...}}]
let repertoire = [];  // músicas ativas

await requireAuth();
await Promise.all([loadShows(), loadRepertoire()]);

$("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data, error } = await db.from("shows").insert({
    date: $("f-date").value,
    venue: $("f-venue").value.trim(),
    city: $("f-city").value.trim(),
  }).select().single();
  if (error) return show($("msg"), "Erro ao criar: " + error.message, "error");
  e.target.reset();
  await loadShows();
  select(data.id);
});

async function loadShows() {
  const { data, error } = await db.from("shows").select("*").order("date", { ascending: false });
  if (error) return show($("msg"), "Erro ao carregar shows: " + error.message, "error");
  shows = data;
  renderList();
}

async function loadRepertoire() {
  const { data } = await db.from("songs")
    .select("*").eq("status", "ativa").order("artist").order("title");
  repertoire = data ?? [];
}

function renderList() {
  const box = $("show-list");
  if (!shows.length) {
    box.replaceChildren(el("p", { class: "empty" }, "Nenhum show cadastrado ainda."));
    return;
  }
  box.replaceChildren(...shows.map((s) =>
    el("div", { class: "card" },
      el("div", { class: "form-row", style: "align-items:center" },
        el("div", { class: "grow" },
          el("b", {}, `${fmtDate(s.date)} — ${s.venue}`),
          el("span", { class: "muted" }, ` · ${s.city}`),
          s.is_public ? el("span", { class: "tag ativa", style: "margin-left:8px" }, "público") : null,
        ),
        el("button", { class: "btn small ghost", onclick: () => select(s.id) },
          current?.id === s.id ? "Editando…" : "Abrir"),
      ),
    ),
  ));
}

async function select(id) {
  current = shows.find((s) => s.id === id);
  if (!current) return;
  $("editor").hidden = false;
  $("ed-title").textContent = `${fmtDate(current.date)} — ${current.venue}`;
  $("e-date").value = current.date;
  $("e-venue").value = current.venue;
  $("e-city").value = current.city;
  $("e-notes").value = current.notes ?? "";
  $("e-public").checked = current.is_public;
  $("e-setlist-public").checked = current.setlist_public;
  renderList();
  await loadSetlist();
  $("editor").scrollIntoView({ behavior: "smooth" });
}

$("ed-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await updateShow({
    date: $("e-date").value,
    venue: $("e-venue").value.trim(),
    city: $("e-city").value.trim(),
    notes: $("e-notes").value.trim() || null,
  });
  show($("msg"), "Show salvo.", "ok");
});
$("e-public").addEventListener("change", (e) => updateShow({ is_public: e.target.checked }));
$("e-setlist-public").addEventListener("change", (e) => updateShow({ setlist_public: e.target.checked }));

$("e-delete").addEventListener("click", async () => {
  if (!confirm(`Excluir o show de ${fmtDate(current.date)} em ${current.venue}, incluindo a setlist?`)) return;
  const { error } = await db.from("shows").delete().eq("id", current.id);
  if (error) return show($("msg"), "Erro ao excluir: " + error.message, "error");
  current = null;
  $("editor").hidden = true;
  await loadShows();
});

async function updateShow(patch) {
  const { error } = await db.from("shows").update(patch).eq("id", current.id);
  if (error) return show($("msg"), "Erro ao salvar: " + error.message, "error");
  Object.assign(current, patch);
  $("ed-title").textContent = `${fmtDate(current.date)} — ${current.venue}`;
  await loadShows();
  renderList();
}

// ---------- setlist ----------

async function loadSetlist() {
  const { data, error } = await db.from("show_songs")
    .select("position, song:songs(*)")
    .eq("show_id", current.id).order("position");
  if (error) return show($("msg"), "Erro na setlist: " + error.message, "error");
  setlist = data;
  renderSetlist();
}

function renderSetlist() {
  const tbody = $("setlist-rows");
  tbody.replaceChildren(...setlist.map((item, i) =>
    el("tr", {},
      el("td", { class: "mono" }, String(i + 1)),
      el("td", {}, el("b", {}, item.song.title)),
      el("td", {}, item.song.artist),
      el("td", {}, el("div", { class: "rowactions" },
        el("button", { class: "iconbtn", disabled: i === 0 ? "" : null, onclick: () => move(i, -1) }, "↑"),
        el("button", { class: "iconbtn", disabled: i === setlist.length - 1 ? "" : null, onclick: () => move(i, 1) }, "↓"),
        el("button", { class: "iconbtn", onclick: () => removeSong(item) }, "✕"),
      )),
    ),
  ));
  if (!setlist.length) {
    tbody.replaceChildren(el("tr", {}, el("td", { colspan: "4", class: "empty" }, "Setlist vazia — adicione músicas abaixo.")));
  }
  const inSet = new Set(setlist.map((x) => x.song.id));
  $("song-pick").replaceChildren(...repertoire
    .filter((s) => !inSet.has(s.id))
    .map((s) => el("option", { value: s.id }, `${s.title} — ${s.artist}`)));
}

$("song-add").addEventListener("click", async () => {
  const songId = $("song-pick").value;
  if (!songId) return;
  const { error } = await db.from("show_songs").insert({
    show_id: current.id, song_id: songId, position: setlist.length + 1,
  });
  if (error) return show($("msg"), "Erro ao adicionar: " + error.message, "error");
  await loadSetlist();
});

async function removeSong(item) {
  await db.from("show_songs").delete()
    .eq("show_id", current.id).eq("song_id", item.song.id);
  await renumber(setlist.filter((x) => x.song.id !== item.song.id));
}

async function move(i, delta) {
  const next = [...setlist];
  [next[i], next[i + delta]] = [next[i + delta], next[i]];
  await renumber(next);
}

// Regrava as posições 1..n na nova ordem.
async function renumber(ordered) {
  for (let i = 0; i < ordered.length; i++) {
    await db.from("show_songs")
      .update({ position: i + 1 })
      .eq("show_id", current.id).eq("song_id", ordered[i].song.id);
  }
  await loadSetlist();
}

// ---------- impressão ----------

$("print").addEventListener("click", () => {
  $("print-view").replaceChildren(
    el("h1", {}, "The James"),
    el("h2", {}, `${fmtDate(current.date)} — ${current.venue}, ${current.city}`),
    el("ol", { class: "tracklist" }, ...setlist.map((item, i) =>
      el("li", {},
        el("span", { class: "n" }, String(i + 1)),
        el("b", {}, item.song.title),
        el("span", { class: "artist" }, item.song.artist),
      ),
    )),
  );
  window.print();
});
