// Backstage: agenda de disponibilidade (ensaios e shows).
// O admin libera janelas de datas (aba Admin); cada integrante marca os
// dias em que topa ensaiar/tocar; quando todos os ativos marcam o mesmo
// (dia, tipo), o banco cria o evento (band_events) — toda a regra vive
// nas funções SQL (set_availability etc.), o front só desenha e chama RPC.
import { db, requireAuth, el, show, fmtDate, avatarEl } from "./db.js";

const $ = (id) => document.getElementById(id);
const { session, member } = await requireAuth();
const isAdmin = member?.is_admin === true;
const myId = session.user.id;

const todayIso = new Date().toLocaleDateString("en-CA");
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const KINDS = [
  { kind: "show", label: "Show" },
  { kind: "ensaio", label: "Ensaio" },
];

let windows = [];
let marks = [];
let events = [];
let members = [];
let marksBy = new Map();   // "dia|tipo" -> [member_id]
let eventBy = new Map();   // "dia|tipo" -> evento
let activeMembers = [];
let evSort = { by: "day", dir: 1 };

// ---------- abas ----------
const TABS = ["cal", "events", "admin"];
let currentTab = null;

function showTab(name) {
  currentTab = name;
  for (const t of TABS) {
    $("tab-" + t).hidden = t !== name;
    $("tab-btn-" + t).classList.toggle("active", t === name);
  }
}
for (const t of TABS) $("tab-btn-" + t).addEventListener("click", () => showTab(t));
if (isAdmin) $("tab-btn-admin").hidden = false;

// ---------- dados ----------
async function loadData() {
  const [w, mk, ev, mb] = await Promise.all([
    db.from("availability_windows").select("*").order("start_date"),
    db.from("availability_marks").select("member_id, day, kind"),
    db.from("band_events").select("*").order("day"),
    db.from("members").select("id, username, name, instrument, is_active, is_admin").order("name"),
  ]);
  windows = w.data ?? [];
  marks = mk.data ?? [];
  events = ev.data ?? [];
  members = mb.data ?? [];

  activeMembers = members.filter((m) => m.is_active);
  marksBy = new Map();
  for (const mrk of marks) {
    const key = mrk.day + "|" + mrk.kind;
    if (!marksBy.has(key)) marksBy.set(key, []);
    marksBy.get(key).push(mrk.member_id);
  }
  eventBy = new Map(events.map((e) => [e.day + "|" + e.kind, e]));
}

const iso = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const inWindow = (dayIso) =>
  windows.some((w) => w.start_date <= dayIso && dayIso <= w.end_date);
const markers = (dayIso, kind) => {
  const ids = new Set(marksBy.get(dayIso + "|" + kind) ?? []);
  return activeMembers.filter((m) => ids.has(m.id));
};
const iMarked = (dayIso, kind) =>
  (marksBy.get(dayIso + "|" + kind) ?? []).includes(myId);

// Semestre corrente (jan–jun ou jul–dez); a partir de junho e de
// dezembro, o semestre seguinte aparece embaixo (horizonte de planejamento).
function semesterMonths() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = m < 6 ? 0 : 6;
  const list = [];
  for (let i = 0; i < 6; i++) list.push({ y, m: start + i });
  if (m === 5 || m === 11) {
    const ny = start === 0 ? y : y + 1;
    const ns = start === 0 ? 6 : 0;
    for (let i = 0; i < 6; i++) list.push({ y: ny, m: ns + i });
  }
  return list;
}

// ---------- calendário ----------
function renderLegend() {
  const sw = (cls, label) => el("span", {}, el("span", { class: "sw " + cls }), label);
  $("legend").replaceChildren(
    sw("", "liberado para marcar"),
    sw("out", "não liberado (bloqueado)"),
    sw("mine", "eu marquei"),
    sw("match-show", "show confirmado"),
    sw("match-ensaio", "ensaio confirmado"),
    sw("risk", "em risco"),
  );
}

function dayCell(y, m, d) {
  const dayIso = iso(y, m, d);
  const open = inWindow(dayIso);
  const past = dayIso < todayIso;
  const evShow = eventBy.get(dayIso + "|show");
  const evEnsaio = eventBy.get(dayIso + "|ensaio");

  let cls = "calday";
  if (open) cls += " open";
  if (past) cls += " past";
  if (iMarked(dayIso, "show") || iMarked(dayIso, "ensaio")) cls += " mine";
  if (evShow?.status === "confirmado") cls += " match-show";
  else if (evEnsaio?.status === "confirmado") cls += " match-ensaio";
  if (evShow?.status === "em_risco" || evEnsaio?.status === "em_risco") cls += " risk";
  if ((evShow?.status === "cancelado" || evEnsaio?.status === "cancelado")
      && !cls.includes("match") && !cls.includes("risk")) cls += " cancelled";
  if (dayIso === todayIso) cls += " today";

  // micro-barras de progresso (só faz sentido antes do evento confirmar)
  const bars = [];
  if (open && activeMembers.length) {
    for (const { kind } of KINDS) {
      const ev = kind === "show" ? evShow : evEnsaio;
      const n = markers(dayIso, kind).length;
      if (n > 0 && ev?.status !== "confirmado") {
        bars.push(el("i", {
          class: kind === "show" ? "bshow" : "bensaio",
          style: `width:${Math.round((n / activeMembers.length) * 100)}%`,
        }));
      }
    }
  }

  const cell = el("div", {
    class: cls,
    title: open ? "Ver o dia " + fmtDate(dayIso)
                : "Data não liberada pelo administrador",
    onclick: open ? () => renderDayPanel(dayIso) : null,
  }, String(d), bars.length ? el("span", { class: "calbars" }, ...bars) : null);
  return cell;
}

function renderCalendar() {
  const grid = $("cal-grid");
  const monthCards = semesterMonths().map(({ y, m }) => {
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;   // seg = coluna 0
    const cells = [
      ...DIAS_SEMANA.map((wd) => el("span", { class: "wd" }, wd)),
      ...Array.from({ length: offset }, () => el("span")),
      ...Array.from({ length: daysInMonth }, (_, i) => dayCell(y, m, i + 1)),
    ];
    return el("div", { class: "card calmonth" },
      el("h3", {}, `${MESES[m]} ${y}`),
      el("div", { class: "calgrid" }, ...cells));
  });
  grid.replaceChildren(...monthCards);
}

// ---------- painel do dia ----------
function closeModal() {
  $("overlay").hidden = true;
  $("modal").replaceChildren();
}
$("overlay").addEventListener("click", (e) => {
  if (e.target === $("overlay")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("overlay").hidden) closeModal();
});

async function toggle(dayIso, kind, available) {
  const { data, error } = await db.rpc("set_availability", {
    p_day: dayIso, p_kind: kind, p_available: available,
  });
  if (error) return show($("day-msg"), error.message, "error");
  await refresh();
  renderDayPanel(dayIso, data === "match" ? kind : null,
    data === "em_risco" ? kind : null);
}

function kindBlock(dayIso, kind, label, past) {
  const ev = eventBy.get(dayIso + "|" + kind);
  const who = markers(dayIso, kind);
  const mine = iMarked(dayIso, kind);
  const missing = activeMembers.filter((m) => !who.some((x) => x.id === m.id));
  const locked = past || !member.is_active || ev?.status === "cancelado"
    || (mine && ev?.show_id);

  const statusTag =
    ev?.status === "confirmado"
      ? el("span", { class: "tag aberta" }, ev.show_id ? "✔ virou show" : "✔ confirmado")
      : ev?.status === "em_risco"
        ? el("span", { class: "tag", style: "border-color:var(--danger);color:var(--danger)" }, "em risco")
        : ev?.status === "cancelado"
          ? el("span", { class: "tag encerrada" }, "cancelado")
          : el("span", { class: "mono muted" },
              `${who.length} de ${activeMembers.length}`);

  return el("div", { class: "dayblock k-" + kind },
    el("h4", {},
      el("span", { class: "evicon " + kind }, kind === "show" ? "★" : "♪"),
      label, " ", statusTag),
    who.length
      ? el("div", { class: "avatars" }, ...who.map((m) =>
          el("span", { title: m.name }, avatarEl(m.username, m.name, "sm"))))
      : el("p", { class: "muted", style: "margin:6px 0;font-size:14px" },
          "Ninguém marcou ainda."),
    missing.length && who.length
      ? el("p", { class: "muted", style: "margin:6px 0;font-size:14px" },
          missing.length === 1
            ? `Falta 1: ${missing[0].name}`
            : `Faltam ${missing.length}: ${missing.map((m) => m.name).join(", ")}`)
      : null,
    el("div", { class: "form-row", style: "margin:8px 0 0" },
      el("button", {
        class: mine ? "btn small ghost" : "btn small",
        disabled: locked ? "" : null,
        onclick: () => toggle(dayIso, kind, !mine),
      }, mine ? "Desmarcar" : `Estou dentro para o ${kind}`),
      mine && ev?.show_id
        ? el("span", { class: "muted", style: "font-size:13px" },
            "Já virou show — fale com o admin para desmarcar.")
        : null,
    ),
  );
}

function renderDayPanel(dayIso, matchKind = null, riskKind = null) {
  const past = dayIso < todayIso;
  const [y, m, d] = dayIso.split("-").map(Number);
  const weekday = DIAS_LONGOS[new Date(y, m - 1, d).getDay()];

  $("modal").replaceChildren(
    el("header", {},
      el("h3", {}, `${weekday} · ${fmtDate(dayIso)}`),
      el("button", { class: "iconbtn", title: "Fechar", onclick: closeModal }, "✕")),
    el("div", { class: "modal-body" },
      el("div", { id: "day-msg", class: "notice", hidden: "" }),
      matchKind
        ? el("div", { class: "matchbanner" },
            `🎉 Fechou! Toda a banda topou — ${matchKind} confirmado em ${fmtDate(dayIso)}.`)
        : null,
      riskKind
        ? el("div", { class: "notice error" },
            `Sua desmarcação desfez o consenso — o ${riskKind} deste dia ficou em risco.`)
        : null,
      past
        ? el("p", { class: "muted" }, "Esta data já passou — só consulta.")
        : !member.is_active
          ? el("p", { class: "muted" },
              "Você está afastado — fale com o administrador para voltar a marcar.")
          : null,
      ...KINDS.map(({ kind, label }) => kindBlock(dayIso, kind, label, past)),
    ),
    el("footer", {},
      el("span", { class: "grow" }),
      el("button", { class: "btn small ghost", onclick: closeModal }, "Fechar")),
  );
  $("overlay").hidden = false;
}

// ---------- aba eventos ----------
function renderEvents() {
  const box = $("events-box");
  $("count-events").textContent = events.length;
  if (!events.length) {
    box.replaceChildren(el("p", { class: "empty" },
      "Nenhum evento ainda — o primeiro nasce quando toda a banda marcar o mesmo dia no calendário."));
    return;
  }

  const list = [...events].sort((a, b) => {
    const va = a[evSort.by] ?? "";
    const vb = b[evSort.by] ?? "";
    return evSort.dir * String(va).localeCompare(String(vb), "pt-BR");
  });

  const sortTh = (field, label) => el("th", {
    class: "sortable", title: `Ordenar por ${label.toLowerCase()}`,
    onclick: () => {
      if (evSort.by === field) evSort.dir = -evSort.dir;
      else evSort = { by: field, dir: 1 };
      renderEvents();
    },
  }, label, el("span", { class: "dir" },
    evSort.by === field ? (evSort.dir === 1 ? " ▲" : " ▼") : ""));

  const statusCell = (ev) =>
    ev.status === "confirmado"
      ? el("span", { class: "tag aberta" }, "confirmado")
      : ev.status === "em_risco"
        ? el("span", { class: "tag", style: "border-color:var(--danger);color:var(--danger)" }, "em risco")
        : el("span", { class: "tag encerrada" }, "cancelado");

  const actions = (ev) => {
    if (!isAdmin) return null;
    const btns = [];
    if (ev.kind === "show" && ev.status === "confirmado" && !ev.show_id) {
      btns.push(el("button", { class: "iconbtn", title: "Promover a show",
        onclick: () => renderPromotePanel(ev) }, "→ show"));
    }
    if (!ev.show_id && ev.status !== "cancelado") {
      btns.push(el("button", { class: "iconbtn", title: "Cancelar evento",
        onclick: () => cancelEvent(ev) }, "✕"));
    }
    if (ev.status === "cancelado") {
      btns.push(el("button", { class: "iconbtn", title: "Reabrir evento",
        onclick: () => reopenEvent(ev) }, "↺"));
    }
    return el("div", { class: "rowactions" }, ...btns);
  };

  box.replaceChildren(el("div", { class: "tblwrap" }, el("table", {},
    el("thead", {}, el("tr", {},
      sortTh("day", "Data"),
      sortTh("kind", "Tipo"),
      sortTh("status", "Status"),
      el("th", {}, "Show"),
      isAdmin ? el("th", {}, "") : null)),
    el("tbody", {}, ...list.map((ev) => el("tr", {},
      el("td", { class: "mono" }, fmtDate(ev.day)),
      el("td", {}, ev.kind),
      el("td", {}, statusCell(ev)),
      el("td", {}, ev.show_id
        ? el("a", { href: "shows.html" }, "ver em Shows")
        : el("span", { class: "muted" }, "—")),
      isAdmin ? el("td", {}, actions(ev)) : null))),
  )));
}

function renderPromotePanel(ev) {
  const venue = el("input", { id: "pr-venue", required: "", placeholder: "Gravador Pub" });
  const city = el("input", { id: "pr-city", required: "", placeholder: "Porto Alegre" });
  const notes = el("input", { id: "pr-notes", placeholder: "opcional" });

  $("modal").replaceChildren(
    el("header", {},
      el("h3", {}, "Promover a show · " + fmtDate(ev.day)),
      el("button", { class: "iconbtn", title: "Fechar", onclick: closeModal }, "✕")),
    el("div", { class: "modal-body" },
      el("div", { id: "day-msg", class: "notice", hidden: "" }),
      el("p", { class: "muted" },
        "Cria o show com estes dados, ainda oculto do site público — revise e publique na página Shows."),
      el("div", { class: "field", style: "margin:10px 0" }, el("label", { for: "pr-venue" }, "Local"), venue),
      el("div", { class: "field", style: "margin:10px 0" }, el("label", { for: "pr-city" }, "Cidade"), city),
      el("div", { class: "field", style: "margin:10px 0" }, el("label", { for: "pr-notes" }, "Observações"), notes)),
    el("footer", {},
      el("span", { class: "grow" }),
      el("button", { class: "btn small ghost", onclick: closeModal }, "Cancelar"),
      el("button", { class: "btn small", onclick: async () => {
        const { error } = await db.rpc("promote_event_to_show", {
          p_event_id: ev.id, p_venue: venue.value.trim(),
          p_city: city.value.trim(), p_notes: notes.value.trim() || null,
        });
        if (error) return show($("day-msg"), error.message, "error");
        closeModal();
        show($("msg"), "Show criado (oculto do site) — complete os dados na página Shows.", "ok");
        await refresh();
      } }, "Criar show")),
  );
  $("overlay").hidden = false;
}

async function cancelEvent(ev) {
  if (!confirm(`Cancelar o ${ev.kind} de ${fmtDate(ev.day)}? As marcações ficam guardadas e o admin pode reabrir depois.`)) return;
  const { error } = await db.rpc("cancel_band_event", { p_event_id: ev.id });
  if (error) return show($("msg"), error.message, "error");
  show($("msg"), "Evento cancelado — dá para reabrir na aba Eventos.", "ok");
  await refresh();
}

async function reopenEvent(ev) {
  const { data, error } = await db.rpc("reopen_band_event", { p_event_id: ev.id });
  if (error) return show($("msg"), error.message, "error");
  show($("msg"), data === "match"
    ? "Evento reaberto — toda a banda segue marcada, match confirmado de novo!"
    : "Evento reaberto — a data volta a valer no calendário.", "ok");
  await refresh();
}

// ---------- aba admin ----------
function renderAdmin() {
  if (!isAdmin) return;
  const box = $("admin-box");
  const start = el("input", { type: "date", id: "w-start", required: "" });
  const end = el("input", { type: "date", id: "w-end", required: "" });

  const winRows = windows.map((w) => {
    const days = Math.round((new Date(w.end_date) - new Date(w.start_date)) / 86400000) + 1;
    return el("tr", {},
      el("td", { class: "mono" }, fmtDate(w.start_date)),
      el("td", { class: "mono" }, fmtDate(w.end_date)),
      el("td", { class: "mono" }, String(days)),
      el("td", {}, el("button", {
        class: "iconbtn", title: "Remover janela",
        onclick: async () => {
          if (!confirm(`Remover a janela ${fmtDate(w.start_date)}–${fmtDate(w.end_date)}? As marcações e os eventos não promovidos deste intervalo serão apagados.`)) return;
          const { error } = await db.rpc("remove_availability_window", { p_window_id: w.id });
          if (error) return show($("msg"), error.message, "error");
          show($("msg"), "Janela removida.", "ok");
          await refresh();
        },
      }, "✕")));
  });

  const memberRows = members.map((m) => el("tr", {},
    el("td", {}, el("span", { style: "display:inline-flex;align-items:center;gap:10px" },
      avatarEl(m.username, m.name, "sm"), el("b", {}, m.name),
      m.instrument ? el("span", { class: "muted" }, m.instrument) : null)),
    el("td", {}, m.is_active
      ? el("span", { class: "tag aberta" }, "ativo")
      : el("span", { class: "tag encerrada" }, "afastado")),
    el("td", {}, el("button", {
      class: "iconbtn", title: m.is_active ? "Afastar da agenda" : "Reativar na agenda",
      onclick: async () => {
        if (m.is_active && !confirm(`Afastar ${m.name}? Ele sai da conta do "todos" — datas que só esperavam por ele podem confirmar na hora.`)) return;
        const { error } = await db.rpc("set_member_active", {
          p_member_id: m.id, p_active: !m.is_active,
        });
        if (error) return show($("msg"), error.message, "error");
        show($("msg"), m.is_active
          ? `${m.name} afastado — os matches futuros foram reavaliados.`
          : `${m.name} reativado — eventos futuros sem a marcação dele ficaram em risco.`, "ok");
        await refresh();
      },
    }, m.is_active ? "Afastar" : "Reativar"))));

  box.replaceChildren(
    el("div", { class: "card" },
      el("h3", { style: "margin-top:0" }, "Liberar datas"),
      el("p", { class: "muted", style: "margin:4px 0 10px" },
        "Cada intervalo vira dias marcáveis no calendário; pode haver vários intervalos num mesmo mês (sem sobreposição)."),
      el("div", { class: "form-row" },
        el("div", { class: "field" }, el("label", { for: "w-start" }, "Início"), start),
        el("div", { class: "field" }, el("label", { for: "w-end" }, "Fim"), end),
        el("button", { class: "btn small", onclick: async () => {
          if (!start.value || !end.value) {
            return show($("msg"), "Informe as duas datas do intervalo.", "error");
          }
          const { error } = await db.rpc("add_availability_window", {
            p_start: start.value, p_end: end.value,
          });
          if (error) return show($("msg"), error.message, "error");
          show($("msg"), "Datas liberadas — a banda já pode marcar.", "ok");
          await refresh();
        } }, "Liberar")),
    ),
    el("div", { class: "card" },
      el("h3", { style: "margin-top:0" }, "Janelas liberadas"),
      windows.length
        ? el("div", { class: "tblwrap" }, el("table", {},
            el("thead", {}, el("tr", {},
              el("th", {}, "Início"), el("th", {}, "Fim"),
              el("th", {}, "Dias"), el("th", {}, ""))),
            el("tbody", {}, ...winRows)))
        : el("p", { class: "empty" }, "Nenhuma janela liberada ainda."),
    ),
    el("div", { class: "card" },
      el("h3", { style: "margin-top:0" }, "Integrantes na conta do match"),
      el("p", { class: "muted", style: "margin:4px 0 10px" },
        "O match exige todos os integrantes ativos. Afastar alguém tira essa pessoa da conta (e das marcações futuras)."),
      el("div", { class: "tblwrap" }, el("table", {},
        el("thead", {}, el("tr", {},
          el("th", {}, "Integrante"), el("th", {}, "Situação"), el("th", {}, ""))),
        el("tbody", {}, ...memberRows))),
    ),
  );
}

// ---------- próximos eventos ----------
function renderNextEvents() {
  const future = events
    .filter((e) => e.status === "confirmado" && e.day >= todayIso)
    .sort((a, b) => a.day.localeCompare(b.day));
  $("next-events").replaceChildren(...(future.length
    ? future.map((e) => el("li", {
        class: "link",
        title: "Ver o dia " + fmtDate(e.day),
        onclick: () => renderDayPanel(e.day),
      },
        el("span", { class: "evicon " + e.kind }, e.kind === "show" ? "★" : "♪"),
        el("span", { class: "d" },
          `${DIAS_LONGOS[new Date(e.day + "T12:00:00").getDay()].slice(0, 3)} ${fmtDate(e.day)}`),
        el("span", { class: "k" }, e.kind === "show" ? "Show" : "Ensaio")))
    : [el("li", { class: "empty" },
        "Nada agendado ainda — marque seus dias no calendário.")]));
}

// ---------- carga ----------
async function refresh() {
  await loadData();
  renderNextEvents();
  renderLegend();
  renderCalendar();
  renderEvents();
  renderAdmin();
}

// Carga inicial no fim do módulo (todo o estado acima já foi inicializado).
await refresh();
showTab("cal");
