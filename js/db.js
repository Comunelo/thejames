// Cliente Supabase + utilitários compartilhados por todas as páginas.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configured = !SUPABASE_URL.startsWith("COLE_AQUI");

export const db = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Exige sessão ativa; senão redireciona para a página de login do backstage.
// Retorna { session, member }.
export async function requireAuth(loginUrl = "index.html") {
  if (!configured) {
    document.body.innerHTML =
      '<div class="wrap"><div class="notice error">Supabase ainda não configurado — edite <code>js/config.js</code>.</div></div>';
    throw new Error("Supabase não configurado");
  }
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    location.href = loginUrl;
    throw new Error("Sem sessão");
  }
  const { data: member } = await db
    .from("members").select("*").eq("id", session.user.id).single();
  return { session, member };
}

export async function logout(loginUrl = "index.html") {
  await db.auth.signOut();
  location.href = loginUrl;
}

// ---- helpers de DOM ----
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// Foto do integrante (media/avatars/<usuario>.jpg, caminho relativo às
// páginas de banda/); quem não tem foto cai na inicial do nome.
export function avatarEl(username, name, extraClass = "") {
  const cls = ("avatar " + extraClass).trim();
  const img = el("img", {
    class: cls,
    src: `../media/avatars/${username}.jpg`,
    alt: "Foto de " + (name || username),
  });
  img.addEventListener("error", () => {
    img.replaceWith(el("span", { class: cls + " avatar-fallback" },
      (name || username || "?").trim().charAt(0).toUpperCase()));
  });
  return img;
}

export function show(node, message, kind = "") {
  node.className = "notice " + kind;
  node.textContent = message;
  node.hidden = !message;
}

// ---- formatação ----
export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  return dt.toLocaleDateString("pt-BR") + " " +
    dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Duração de música: "3:45" ou "4" (minutos) -> segundos.
// Vazio -> null; formato inválido -> NaN (o chamador avisa o usuário).
export function parseDur(text) {
  const t = (text ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d{1,3}$/.test(t)) return Number(t) * 60;
  return NaN;
}

// 225 -> "3:45"; nulo/zero -> "".
export function fmtDur(sec) {
  if (!sec) return "";
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

export function spotifyAnchor(url) {
  if (!url) return el("span", { class: "muted" }, "—");
  return el("a", { class: "spotify", href: url, target: "_blank", rel: "noopener" }, "▶ Spotify");
}
