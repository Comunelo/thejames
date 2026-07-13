// Backstage: votações (feature D).
// Regras: X votos por integrante (1 por música), votos ocultos até encerrar,
// top X promovidas ao repertório; empate na última vaga → quem encerra escolhe.
import { db, requireAuth, el, show, fmtDateTime, spotifyAnchor } from "./db.js";

const $ = (id) => document.getElementById(id);
const { session, member } = await requireAuth();
const isAdmin = member?.is_admin === true;

// ---------- abas ----------
const TABS = ["open", "new", "closed"];
let currentTab = null;

function showTab(name) {
  currentTab = name;
  for (const t of TABS) {
    $("tab-" + t).hidden = t !== name;
    $("tab-btn-" + t).classList.toggle("active", t === name);
  }
}
for (const t of TABS) $("tab-btn-" + t).addEventListener("click", () => showTab(t));

async function refresh() {
  const [nOpen, , nClosed] =
    await Promise.all([renderOpen(), renderPicker(), renderClosed()]);
  $("count-open").textContent = nOpen;
  $("count-closed").textContent = nClosed;
  if (!currentTab) showTab(nOpen > 0 ? "open" : "new");
}

// ---------- criar votação: seletor de candidatas ----------

let pickerCands = [];
let pickSort = { by: null, dir: 1 };   // null = ordem de sugestão (mais antigas primeiro)
const picked = new Set();

async function renderPicker() {
  const { data: cands } = await db.from("candidates")
    .select("*").eq("status", "sugerida").order("created_at");
  pickerCands = cands ?? [];
  const valid = new Set(pickerCands.map((c) => c.id));
  for (const id of [...picked]) if (!valid.has(id)) picked.delete(id);
  drawPicker();
}

function drawPicker() {
  const box = $("cand-picker");
  if (!pickerCands.length) {
    box.replaceChildren(el("p", { class: "empty" },
      "Nenhuma candidata sugerida — adicione músicas em Candidatas primeiro."));
    return;
  }

  const list = [...pickerCands];
  if (pickSort.by) {
    list.sort((a, b) =>
      pickSort.dir * a[pickSort.by].localeCompare(b[pickSort.by], "pt-BR", { sensitivity: "base" })
      || a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));
  }

  const master = el("input", {
    type: "checkbox", title: "Marcar/desmarcar todas",
    onchange: (e) => {
      if (e.target.checked) pickerCands.forEach((c) => picked.add(c.id));
      else picked.clear();
      drawPicker();
    },
  });
  master.checked = picked.size === pickerCands.length;
  master.indeterminate = picked.size > 0 && picked.size < pickerCands.length;

  const sortTh = (field, label) => el("th", {
    class: "sortable", title: `Ordenar por ${label.toLowerCase()}`,
    onclick: () => {
      if (pickSort.by === field) pickSort.dir = -pickSort.dir;
      else pickSort = { by: field, dir: 1 };
      drawPicker();
    },
  }, label, el("span", { class: "dir" },
    pickSort.by === field ? (pickSort.dir === 1 ? " ▲" : " ▼") : ""));

  box.replaceChildren(
    el("label", {}, "Candidatas na votação ",
      el("span", { class: "mono muted" }, `(${picked.size} de ${pickerCands.length} selecionadas)`)),
    el("div", { class: "tblwrap" }, el("table", {},
      el("thead", {}, el("tr", {},
        el("th", { class: "checkth" }, master),
        sortTh("title", "Música"),
        sortTh("artist", "Artista"),
        el("th", {}, "Spotify"))),
      el("tbody", {}, ...list.map((c) => {
        const cb = el("input", {
          type: "checkbox", id: "pick-" + c.id,
          onchange: (e) => {
            e.target.checked ? picked.add(c.id) : picked.delete(c.id);
            drawPicker();
          },
        });
        cb.checked = picked.has(c.id);
        return el("tr", {},
          el("td", {}, cb),
          el("td", {}, el("label", { for: cb.id, style: "font-size:15px;color:var(--ink);cursor:pointer" },
            el("b", {}, c.title))),
          el("td", {}, c.artist),
          el("td", {}, spotifyAnchor(c.spotify_url)));
      })),
    )),
  );
}

$("poll-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ids = [...picked];
  const winners = parseInt($("p-winners").value, 10);
  if (ids.length <= winners) {
    return show($("msg"), "Escolha mais candidatas do que vagas — senão não há o que votar.", "error");
  }
  const { error } = await db.rpc("create_poll", {
    p_title: $("p-title").value.trim(),
    p_num_winners: winners,
    p_deadline: new Date($("p-deadline").value).toISOString(),
    p_candidate_ids: ids,
  });
  if (error) return show($("msg"), "Erro ao criar votação: " + error.message, "error");
  e.target.reset();
  picked.clear();
  show($("msg"), "Votação aberta! Avise a banda.", "ok");
  await refresh();
  showTab("open");
});

// ---------- votações abertas ----------

async function renderOpen() {
  const { data: polls } = await db.from("polls")
    .select("*, poll_candidates(added_at, candidate:candidates(*))")
    .eq("status", "aberta").order("created_at", { ascending: false });
  const box = $("open-list");
  if (!polls?.length) {
    box.replaceChildren(el("p", { class: "empty" },
      "Nenhuma votação aberta no momento. ",
      el("a", { href: "#", onclick: (e) => { e.preventDefault(); showTab("new"); } },
        "Abrir uma nova votação")));
    return 0;
  }
  box.replaceChildren(...await Promise.all(polls.map(openCard)));
  return polls.length;
}

async function openCard(poll) {
  const [{ data: myVotes }, { data: progress }] = await Promise.all([
    db.from("votes").select("candidate_id")
      .eq("poll_id", poll.id).eq("member_id", session.user.id),
    db.rpc("poll_progress", { p_poll_id: poll.id }),
  ]);
  const mine = new Set((myVotes ?? []).map((v) => v.candidate_id));   // votos salvos
  const local = new Set(mine);                                        // seleção na tela
  let sort = { by: null, dir: 1 };
  const cands = poll.poll_candidates.map((pc) => pc.candidate);

  const tableBox = el("div");
  const footBox = el("div", { class: "form-row", style: "align-items:center" });

  const dirty = () =>
    local.size !== mine.size || [...local].some((id) => !mine.has(id));

  function drawTable() {
    const chosen = cands.filter((c) => local.has(c.id));
    const rest = cands.filter((c) => !local.has(c.id));
    if (sort.by) {
      rest.sort((a, b) =>
        sort.dir * a[sort.by].localeCompare(b[sort.by], "pt-BR", { sensitivity: "base" })
        || a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));
    }
    const sortTh = (field, label) => el("th", {
      class: "sortable", title: `Ordenar por ${label.toLowerCase()}`,
      onclick: () => {
        if (sort.by === field) sort.dir = -sort.dir;
        else sort = { by: field, dir: 1 };
        drawTable();
      },
    }, label, el("span", { class: "dir" },
      sort.by === field ? (sort.dir === 1 ? " ▲" : " ▼") : ""));

    // grupo dos meus votos: as escolhidas saem da lista e sobem para cá
    const myvotes = el("div", { class: "myvotes" },
      el("h4", {}, "Meus votos",
        el("span", { class: "mono muted", style: "margin-left:10px" },
          `${local.size} de ${poll.num_winners}`)),
      chosen.length
        ? el("div", {}, ...chosen.map((c) => el("div", { class: "cand" },
            el("button", {
              class: "iconbtn", title: "Remover este voto",
              onclick: () => { local.delete(c.id); drawTable(); },
            }, "✕"),
            el("span", {}, el("b", {}, c.title), ` — ${c.artist}`),
            c.spotify_url
              ? el("a", { class: "spotify", href: c.spotify_url, target: "_blank",
                          rel: "noopener", style: "margin-left:auto" }, "▶")
              : null)))
        : el("p", { class: "empty", style: "padding:6px 0" },
            "Nenhuma música selecionada ainda — marque na lista abaixo."),
    );

    const table = rest.length
      ? el("div", { class: "tblwrap" }, el("table", {},
          el("thead", {}, el("tr", {},
            el("th", { class: "checkth" }),
            sortTh("title", "Música"),
            sortTh("artist", "Artista"),
            el("th", {}, "Spotify"))),
          el("tbody", {}, ...rest.map((c) => {
            const cb = el("input", {
              type: "checkbox", id: `v-${poll.id}-${c.id}`,
              disabled: local.size >= poll.num_winners ? "" : null,
              onchange: () => { local.add(c.id); drawTable(); },
            });
            return el("tr", {},
              el("td", {}, cb),
              el("td", {}, el("label", { for: cb.id, style: "font-size:15px;color:var(--ink);cursor:pointer" },
                el("b", {}, c.title))),
              el("td", {}, c.artist),
              el("td", {}, spotifyAnchor(c.spotify_url)));
          })),
        ))
      : el("p", { class: "empty" }, "Todas as candidatas estão nos seus votos.");

    tableBox.replaceChildren(myvotes, table);
    drawFoot();
  }

  function drawFoot() {
    // replaceChildren converte null em texto "null" — filtrar antes
    footBox.replaceChildren(...[
      el("span", { class: "mono muted" },
        `${local.size} de ${poll.num_winners} votos selecionados`),
      el("button", {
        class: "btn small", disabled: dirty() ? null : "",
        onclick: confirmVotes,
      }, mine.size ? "Atualizar meus votos" : "Confirmar meus votos"),
      !dirty() && mine.size
        ? el("span", { class: "tag aberta" }, "✔ seus votos estão registrados")
        : dirty()
          ? el("span", { class: "muted", style: "font-size:13px" },
              "Você pode mudar a seleção até confirmar.")
          : null,
    ].filter(Boolean));
  }

  async function confirmVotes() {
    const adds = [...local].filter((id) => !mine.has(id));
    const removes = [...mine].filter((id) => !local.has(id));
    for (const id of removes) {
      const { error } = await db.from("votes").delete()
        .eq("poll_id", poll.id).eq("candidate_id", id).eq("member_id", session.user.id);
      if (error) return show($("msg"), "Erro ao salvar votos: " + error.message, "error");
    }
    if (adds.length) {
      const { error } = await db.from("votes").insert(adds.map((id) => (
        { poll_id: poll.id, candidate_id: id, member_id: session.user.id })));
      if (error) return show($("msg"), "Erro ao salvar votos: " + error.message, "error");
    }
    show($("msg"), "Votos registrados! Você pode mudá-los até o encerramento.", "ok");
    await renderOpen();
  }

  const voters = el("div", { class: "voters" }, ...(progress ?? []).map((m) =>
    el("span", { class: "tag" + (m.votes_used > 0 ? " voted" : "") },
      `${m.name} ${m.votes_used > 0 ? "✔" : "…"}`)));

  // candidatas que entraram depois da abertura (added_at preenchido)
  const lateCount = poll.poll_candidates.filter((pc) => pc.added_at).length;

  // painel do admin para adicionar candidatas 'sugerida' à votação aberta
  const addBox = el("div");

  async function openAddPanel() {
    const { data: sugeridas } = await db.from("candidates")
      .select("*").eq("status", "sugerida").order("created_at");
    if (!sugeridas?.length) {
      addBox.replaceChildren(el("p", { class: "empty" },
        "Nenhuma candidata sugerida disponível — adicione músicas em Candidatas primeiro."));
      return;
    }
    const picks = sugeridas.map((c) => {
      const cb = el("input", { type: "checkbox", id: `add-${poll.id}-${c.id}` });
      return { c, cb };
    });
    addBox.replaceChildren(el("div", { class: "myvotes" },
      el("h4", {}, "Adicionar candidatas à votação"),
      ...picks.map(({ c, cb }) => el("div", { class: "cand" }, cb,
        el("label", { for: cb.id, style: "cursor:pointer" },
          el("b", {}, c.title), ` — ${c.artist}`))),
      el("div", { class: "form-row", style: "margin-top:10px" },
        el("button", {
          class: "btn small",
          onclick: async () => {
            const chosen = picks.filter((p) => p.cb.checked).map((p) => p.c.id);
            if (!chosen.length) {
              return show($("msg"), "Marque pelo menos uma candidata para adicionar.", "error");
            }
            const { error } = await db.rpc("add_poll_candidates", {
              p_poll_id: poll.id, p_candidate_ids: chosen,
            });
            if (error) return show($("msg"), "Erro ao adicionar candidatas: " + error.message, "error");
            show($("msg"),
              chosen.length === 1
                ? "1 candidata adicionada — a banda verá o aviso no card da votação."
                : `${chosen.length} candidatas adicionadas — a banda verá o aviso no card da votação.`,
              "ok");
            await refresh();
          },
        }, "Adicionar à votação"),
        el("button", { class: "btn small ghost", onclick: () => addBox.replaceChildren() },
          "Cancelar"),
      ),
    ));
  }

  drawTable();

  return el("div", { class: "card pollcard" },
    el("h3", { style: "margin-top:0" }, poll.title, " ",
      el("span", { class: "tag aberta" }, "aberta")),
    el("p", { class: "muted", style: "margin:4px 0 10px" },
      `${poll.num_winners} vaga(s) · prazo ${fmtDateTime(poll.deadline)} · votos ocultos até encerrar`),
    lateCount
      ? el("div", { class: "notice", style: "margin:10px 0" },
          lateCount === 1
            ? "1 música entrou nesta votação depois da abertura — se você já votou, pode ajustar seus votos."
            : `${lateCount} músicas entraram nesta votação depois da abertura — se você já votou, pode ajustar seus votos.`)
      : null,
    tableBox, footBox, voters,
    // adicionar candidatas e encerrar/apurar: só o administrador vê
    // (e o banco também só aceita admin)
    isAdmin
      ? el("div", {},
          addBox,
          el("div", { class: "form-row", style: "margin-top:14px;align-items:center" },
            el("button", { class: "btn small ghost", onclick: openAddPanel },
              "Adicionar candidatas"),
            el("button", { class: "btn small danger", onclick: () => closePoll(poll) },
              "Encerrar votação e apurar"),
            el("span", { class: "muted", style: "font-size:13px" },
              "Encerra para todos e promove as vencedoras ao repertório.")))
      : null,
  );
}

async function closePoll(poll, tiebreak = null) {
  if (!tiebreak &&
      !confirm(`Encerrar "${poll.title}" e promover as ${poll.num_winners} mais votadas ao repertório?`)) return;
  const { error } = await db.rpc("close_poll", {
    p_poll_id: poll.id, p_tiebreak: tiebreak,
  });
  if (error) {
    if (error.message.includes("EMPATE")) return tieBreak(poll, error);
    return show($("msg"), error.message, "error");
  }
  show($("msg"), "Votação encerrada — vencedoras já estão no repertório! 🎸", "ok");
  await refresh();
}

// Empate na última vaga: quem encerra escolhe entre as empatadas.
function tieBreak(poll, error) {
  const tied = JSON.parse(error.details || "[]");
  const slots = parseInt(error.hint || "1", 10);
  const picks = tied.map((c) => {
    const cb = el("input", { type: "checkbox", value: c.id });
    return { c, cb };
  });
  const dialog = el("div", { class: "card pollcard" },
    el("h3", { style: "margin-top:0" }, "Empate na última vaga"),
    el("p", { class: "muted" },
      `Estas músicas empataram. Escolha ${slots} para completar as vagas:`),
    ...picks.map(({ c, cb }) => el("div", { class: "cand" }, cb,
      el("label", {}, el("b", {}, c.title), ` — ${c.artist}`))),
    el("div", { class: "form-row" },
      el("button", {
        class: "btn small",
        onclick: () => {
          const chosen = picks.filter((p) => p.cb.checked).map((p) => p.c.id);
          if (chosen.length !== slots) {
            return show($("msg"), `Escolha exatamente ${slots}.`, "error");
          }
          dialog.remove();
          closePoll(poll, chosen);
        },
      }, "Confirmar desempate"),
      el("button", { class: "btn small ghost", onclick: () => dialog.remove() }, "Cancelar"),
    ),
  );
  $("open-list").prepend(dialog);
  dialog.scrollIntoView({ behavior: "smooth" });
}

// ---------- votações encerradas ----------

async function renderClosed() {
  const { data: polls } = await db.from("polls")
    .select("*, poll_candidates(candidate:candidates(id,title,artist))")
    .eq("status", "encerrada").order("created_at", { ascending: false });
  const box = $("closed-list");
  if (!polls?.length) {
    box.replaceChildren(el("p", { class: "empty" }, "Nenhuma votação encerrada ainda."));
    return 0;
  }
  box.replaceChildren(...await Promise.all(polls.map(closedCard)));
  return polls.length;
}

async function closedCard(poll) {
  const [{ data: votes }, { data: promoted }] = await Promise.all([
    db.from("votes").select("candidate_id").eq("poll_id", poll.id),
    db.from("songs").select("title, artist").eq("from_poll_id", poll.id),
  ]);
  const count = {};
  for (const v of votes ?? []) count[v.candidate_id] = (count[v.candidate_id] ?? 0) + 1;
  const winners = new Set((promoted ?? []).map((s) => `${s.title}|${s.artist}`));
  const max = Math.max(1, ...Object.values(count));

  const rows = poll.poll_candidates
    .map(({ candidate: c }) => ({ c, n: count[c.id] ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .map(({ c, n }) => el("div", { class: "cand" },
      el("span", { class: "mono", style: "min-width:2ch" }, String(n)),
      el("div", { style: "flex:1" },
        el("div", {},
          winners.has(`${c.title}|${c.artist}`) ? "🏆 " : "",
          el("b", {}, c.title), ` — ${c.artist}`),
        el("div", { class: "votebar", style: `width:${(n / max) * 100}%;opacity:${n ? 1 : 0.15}` }),
      ),
    ));

  return el("div", { class: "card pollcard" },
    el("h3", { style: "margin-top:0" }, poll.title, " ",
      el("span", { class: "tag encerrada" }, "encerrada")),
    ...rows,
  );
}

// Carrega tudo (fica no fim do módulo: todo o estado acima já foi inicializado).
await refresh();
