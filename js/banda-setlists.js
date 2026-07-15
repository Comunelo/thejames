// Backstage: Set Lists reutilizáveis (feature E).
// Listas montadas do repertório com ordem própria, intervalos, mapa de
// energia e duração estimada. Associar a um show grava shows.setlist_id e
// copia as músicas para show_songs (impressão e setlist pública continuam
// funcionando pela página de Shows, sem mudança lá).
// UX: músicas entram por modal multi-seleção (busca + ordenação, padrão do
// picker de votações); reordenação por arraste no puxador (Pointer Events,
// mouse e toque) com ↑/↓ como alternativa; intervalos em 1 toque com edição
// inline; resumo em cards fixos no topo do scroll.
import { db, requireAuth, el, show, fmtDate, fmtDur } from "./db.js";

const $ = (id) => document.getElementById(id);
const { session } = await requireAuth();

let setlists = [];    // [{...setlist, setlist_items:[...], shows:[...]}]
let current = null;   // set list aberta no editor
let items = [];       // itens da set list aberta, ordenados por position
let repertoire = [];  // músicas ativas
let allShows = [];    // todos os shows (para o seletor de associação)

// estado da modal de músicas
const modalPicked = new Set();          // ids na ordem dos cliques
let modalSort = { by: "artist", dir: 1 };
let lastPickIndex = -1;                 // p/ shift+clique (faixa)
let savedScrollY = 0;
let escHandler = null;

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

// ---------- resumo em cards ----------

function renderStats() {
  const s = summary(items);
  $("sl-stats").replaceChildren(
    el("div", { class: "stat" }, el("b", {}, String(s.nSongs)), el("span", {}, "Músicas")),
    el("div", { class: "stat" }, el("b", {}, String(s.nIntervals)), el("span", {}, "Intervalos")),
    el("div", { class: "stat" }, el("b", {}, "~" + fmtTotal(s.totalSec)), el("span", {}, "Duração estimada")),
    ...(s.missing ? [el("div", { class: "stat" },
      el("b", { style: "color:var(--danger)" }, String(s.missing)), el("span", {}, "Sem duração"))] : []),
  );
}

// ---------- itens (músicas e intervalos) ----------

function energySpan(energy) {
  return energy
    ? el("span", {}, el("span", { class: "energy-dot e" + energy }), `${energy}/5`)
    : el("span", { class: "muted" }, "—");
}

function itemRow(it, i) {
  const isInt = it.kind === "interval";
  const actions = el("td", {}, el("div", { class: "rowactions" },
    ...(isInt ? [el("button", {
      class: "iconbtn", title: "Editar intervalo",
      onclick: (e) => editIntervalRow(e.currentTarget.closest("tr"), it),
    }, "✎")] : []),
    el("button", { class: "iconbtn", title: "Mover para cima", disabled: i === 0 ? "" : null, onclick: () => move(i, -1) }, "↑"),
    el("button", { class: "iconbtn", title: "Mover para baixo", disabled: i === items.length - 1 ? "" : null, onclick: () => move(i, 1) }, "↓"),
    el("button", { class: "iconbtn", title: "Remover", onclick: () => removeItem(it) }, "✕"),
  ));
  const handle = el("td", { class: "draghandle", title: "Arraste para reordenar" }, "⠿");
  const tr = isInt
    ? el("tr", { class: "interval-row" }, handle,
        el("td", { class: "mono" }, String(i + 1)),
        el("td", {}, "⏸ " + (it.label || "Intervalo")),
        el("td", {}, "—"),
        el("td", {}, "—"),
        el("td", {}, `${Math.round(it.duration_sec / 60)} min`),
        actions)
    : el("tr", {}, handle,
        el("td", { class: "mono" }, String(i + 1)),
        el("td", {}, el("b", {}, it.song.title)),
        el("td", {}, it.song.artist),
        el("td", {}, energySpan(it.song.energy)),
        el("td", {}, fmtDur(it.song.duration_sec) || el("span", { class: "muted" }, "—")),
        actions);
  attachDrag(tr, handle);
  return tr;
}

function renderItems() {
  const tbody = $("item-rows");
  tbody.replaceChildren(...items.map(itemRow));
  if (!items.length) {
    tbody.replaceChildren(el("tr", {},
      el("td", { colspan: "7", class: "empty" }, "Lista vazia — use “＋ Adicionar músicas”.")));
  }
  $("sl-summary").textContent = items.length ? summaryText(items) : "";
  renderStats();
}

// Regrava as posições 1..n em UMA request (upsert pela PK id). As linhas vão
// COMPLETAS: o INSERT do ON CONFLICT valida os NOT NULL/CHECK da tabela antes
// do conflito. Depende de NÃO existir unique em (setlist_id, position).
// A UI atualiza antes (otimista); erro → mensagem + recarga da verdade do banco.
async function persistPositions() {
  current.setlist_items = items.map((it, i) => ({ ...it, position: i + 1 }));
  items = sortedItems(current);
  renderItems();
  renderEnergyMap();
  renderList();
  const rows = items.map((it) => ({
    id: it.id, setlist_id: current.id, position: it.position, kind: it.kind,
    song_id: it.song?.id ?? null,
    duration_sec: it.kind === "interval" ? it.duration_sec : null,
    label: it.label ?? null,
  }));
  if (!rows.length) return;
  const { error } = await db.from("setlist_items").upsert(rows);
  if (error) {
    show($("msg"), "Erro ao reordenar: " + error.message, "error");
    await loadAll();
  }
}

async function move(i, delta) {
  const next = [...items];
  [next[i], next[i + delta]] = [next[i + delta], next[i]];
  items = next;
  await persistPositions();
}

async function removeItem(it) {
  const { error } = await db.from("setlist_items").delete().eq("id", it.id);
  if (error) return show($("msg"), "Erro ao remover: " + error.message, "error");
  items = items.filter((x) => x.id !== it.id);
  await persistPositions();
}

// Arrastar pelo puxador — Pointer Events (mesmo código para mouse e toque).
// touch-action:none SÓ no puxador: o resto da linha continua rolando a página.
// pointer-events:none na linha arrastada faz elementFromPoint ver as vizinhas.
function attachDrag(tr, handle) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    tr.classList.add("dragging");
    const tbody = tr.parentNode;
    let target = null, scrollDir = 0, rafId = null;
    const scrollLoop = () => {
      if (!scrollDir) { rafId = null; return; }
      window.scrollBy(0, scrollDir);
      rafId = requestAnimationFrame(scrollLoop);
    };
    const onMove = (ev) => {
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("#item-rows tr");
      target = row && row !== tr ? row : null;
      for (const r of tbody.children) r.classList.toggle("drop-target", r === target);
      scrollDir = ev.clientY < 90 ? -12 : ev.clientY > window.innerHeight - 90 ? 12 : 0;
      if (scrollDir && rafId === null) rafId = requestAnimationFrame(scrollLoop);
    };
    const cleanup = () => {
      tr.classList.remove("dragging");
      for (const r of tbody.children) r.classList.remove("drop-target");
      scrollDir = 0;
      if (rafId !== null) cancelAnimationFrame(rafId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
    };
    const onUp = () => {
      const rows = [...tbody.children];
      const from = rows.indexOf(tr);
      const to = target ? rows.indexOf(target) : -1;
      cleanup();
      if (to >= 0 && to !== from) {
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        items = next;
        persistPositions();
      }
    };
    const onCancel = () => cleanup();
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  });
}

// ---------- modal: adicionar músicas do repertório ----------

function modalCandidates() {
  const inList = new Set(items.filter((i) => i.kind === "song").map((i) => i.song.id));
  return repertoire.filter((s) => !inList.has(s.id));
}

function updateModalFooter() {
  const n = modalPicked.size;
  const sum = [...modalPicked].reduce((t, id) =>
    t + (repertoire.find((s) => s.id === id)?.duration_sec ?? 0), 0);
  $("modal-count").textContent = n
    ? `${n} selecionada${n > 1 ? "s" : ""}` + (sum ? ` · +${fmtTotal(sum)}` : "")
    : "0 selecionadas";
  const add = $("modal-add");
  add.disabled = !n;
  add.textContent = n ? `Adicionar ${n} música${n > 1 ? "s" : ""}` : "Adicionar";
}

function drawModalTable() {
  const box = $("modal-table");
  const all = modalCandidates();
  const q = $("modal-search").value.trim().toLowerCase();

  if (!all.length) {
    box.replaceChildren(el("p", { class: "empty" },
      repertoire.length
        ? "Todas as músicas do repertório já estão nesta set list."
        : ["Nenhuma música ativa no repertório. ",
           el("a", { href: "repertorio.html" }, "Cadastrar no Repertório")]));
    return updateModalFooter();
  }

  const list = all
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
    .sort((a, b) =>
      modalSort.dir * a[modalSort.by].localeCompare(b[modalSort.by], "pt-BR", { sensitivity: "base" })
      || a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));

  if (!list.length) {
    box.replaceChildren(el("p", { class: "empty" },
      `Nada encontrado para "${$("modal-search").value.trim()}".`));
    return updateModalFooter();
  }

  const setPicked = (id, on) => { on ? modalPicked.add(id) : modalPicked.delete(id); };

  // checkbox mestre atua só sobre as linhas VISÍVEIS no filtro
  const master = el("input", {
    type: "checkbox", title: "Marcar/desmarcar as visíveis",
    onchange: (e) => { list.forEach((s) => setPicked(s.id, e.target.checked)); drawModalTable(); },
  });
  const pickedVisible = list.filter((s) => modalPicked.has(s.id)).length;
  master.checked = pickedVisible === list.length;
  master.indeterminate = pickedVisible > 0 && pickedVisible < list.length;

  const sortTh = (field, label) => el("th", {
    class: "sortable", title: `Ordenar por ${label.toLowerCase()}`,
    onclick: () => {
      if (modalSort.by === field) modalSort.dir = -modalSort.dir;
      else modalSort = { by: field, dir: 1 };
      drawModalTable();
    },
  }, label, el("span", { class: "dir" },
    modalSort.by === field ? (modalSort.dir === 1 ? " ▲" : " ▼") : ""));

  box.replaceChildren(el("div", { class: "tblwrap" }, el("table", {},
    el("thead", {}, el("tr", {},
      el("th", { class: "checkth" }, master),
      sortTh("title", "Música"),
      sortTh("artist", "Artista"),
      el("th", {}, "Energia"),
      el("th", {}, "Duração"))),
    el("tbody", {}, ...list.map((s, idx) => {
      const cb = el("input", { type: "checkbox", id: "pick-" + s.id });
      cb.checked = modalPicked.has(s.id);
      cb.addEventListener("click", (e) => {
        // shift+clique aplica o mesmo estado à faixa entre os dois cliques
        if (e.shiftKey && lastPickIndex >= 0) {
          const [a, b] = [Math.min(lastPickIndex, idx), Math.max(lastPickIndex, idx)];
          for (let k = a; k <= b; k++) setPicked(list[k].id, e.target.checked);
        } else {
          setPicked(s.id, e.target.checked);
        }
        lastPickIndex = idx;
        drawModalTable();
      });
      const tr = el("tr", { style: "cursor:pointer" },
        el("td", {}, cb),
        el("td", {}, el("label", { for: cb.id, style: "font-size:15px;color:var(--ink);cursor:pointer" },
          el("b", {}, s.title))),
        el("td", {}, s.artist),
        el("td", {}, energySpan(s.energy)),
        el("td", {}, fmtDur(s.duration_sec) || el("span", { class: "muted" }, "—")));
      // linha inteira clicável (fora do checkbox e do label, que já alternam)
      tr.addEventListener("click", (e) => {
        if (e.target === cb || e.target.closest("label")) return;
        setPicked(s.id, !cb.checked);
        lastPickIndex = idx;
        drawModalTable();
      });
      return tr;
    })))));
  updateModalFooter();
}

function openSongModal() {
  modalPicked.clear();
  lastPickIndex = -1;
  $("modal-search").value = "";
  drawModalTable();
  savedScrollY = window.scrollY;
  document.body.style.overflow = "hidden";
  $("song-modal").hidden = false;
  escHandler = (e) => { if (e.key === "Escape") closeSongModal(); };
  document.addEventListener("keydown", escHandler);
  // foco na busca só com mouse — no celular o teclado cobriria meia tela
  if (matchMedia("(pointer: fine)").matches) $("modal-search").focus();
}

function closeSongModal() {
  $("song-modal").hidden = true;
  document.body.style.overflow = "";
  window.scrollTo(0, savedScrollY);
  document.removeEventListener("keydown", escHandler);
  $("song-add-open").focus();
}

$("song-add-open").addEventListener("click", openSongModal);
$("modal-close").addEventListener("click", closeSongModal);
$("modal-cancel").addEventListener("click", closeSongModal);
$("song-modal").addEventListener("click", (e) => {
  if (e.target === $("song-modal")) closeSongModal();
});
$("modal-search").addEventListener("input", drawModalTable);

$("modal-add").addEventListener("click", async () => {
  const rows = [...modalPicked].map((songId, i) => ({
    setlist_id: current.id, position: items.length + 1 + i, kind: "song", song_id: songId,
  }));
  if (!rows.length) return;
  closeSongModal();
  const { error } = await db.from("setlist_items").insert(rows);   // 1 request
  if (error) {
    show($("msg"), "Erro ao adicionar: " + error.message, "error");
    return loadAll();
  }
  show($("msg"), `${rows.length} música(s) adicionada(s).`, "ok");
  await loadAll();
});

// ---------- intervalos ----------

// 1 toque: entra com 15 min e sem rótulo; ajuste pelo ✎ da linha.
$("int-add").addEventListener("click", async () => {
  const { error } = await db.from("setlist_items").insert({
    setlist_id: current.id, position: items.length + 1, kind: "interval",
    duration_sec: 900, label: null,
  });
  if (error) return show($("msg"), "Erro ao adicionar intervalo: " + error.message, "error");
  await loadAll();
});

// Edição inline (padrão editRow do repertório): rótulo + minutos com stepper.
function editIntervalRow(tr, it) {
  const lbl = el("input", { value: it.label ?? "", placeholder: "Intervalo" });
  const num = el("input", { type: "number", min: "1", style: "width:70px",
    value: String(Math.round(it.duration_sec / 60)) });
  const step = (d) => { num.value = String(Math.max(1, (parseInt(num.value, 10) || 0) + d)); };
  tr.replaceChildren(
    el("td", { class: "draghandle" }, "⠿"),
    el("td", { class: "mono" }, tr.children[1].textContent),
    el("td", {}, lbl),
    el("td", { colspan: "2" }, el("div", { class: "rowactions", style: "align-items:center" },
      el("button", { class: "iconbtn", type: "button", title: "Menos 5 minutos", onclick: () => step(-5) }, "−5"),
      num,
      el("button", { class: "iconbtn", type: "button", title: "Mais 5 minutos", onclick: () => step(5) }, "+5"),
    )),
    el("td", { class: "muted" }, "min"),
    el("td", {}, el("div", { class: "rowactions" },
      el("button", {
        class: "iconbtn", title: "Salvar",
        onclick: async () => {
          const min = parseInt(num.value, 10);
          if (!min || min < 1) return show($("msg"), "Informe a duração do intervalo em minutos.", "error");
          const { error } = await db.from("setlist_items")
            .update({ label: lbl.value.trim() || null, duration_sec: min * 60 }).eq("id", it.id);
          if (error) return show($("msg"), "Erro ao salvar o intervalo: " + error.message, "error");
          await loadAll();
        },
      }, "✔"),
      el("button", { class: "iconbtn", title: "Cancelar", onclick: () => renderItems() }, "✕"),
    )),
  );
  lbl.focus();
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

// Carga inicial no fim do módulo (todo o estado acima já inicializado — TDZ).
await loadAll();
