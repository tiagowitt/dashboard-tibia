// Formatação, regras de XP e pequenos utilitários de DOM.

const fmtInteiro = new Intl.NumberFormat("pt-BR");
const fmtCompacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const fmtBilhoes = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export const num = (v) => (v == null ? "—" : fmtInteiro.format(v));
// Bilhões com 2 casas (1,97 bi), o resto com 1 (94,7 mi).
export const compacto = (v) => (v == null ? "—" : (Math.abs(v) >= 1e9 ? fmtBilhoes : fmtCompacto).format(v));
export const pct = (v) => (v == null || !isFinite(v) ? "—" : fmtPct.format(v));
export const dataBR = (iso) => (iso ? fmtData.format(new Date(iso + "T00:00:00Z")) : "—");
export const dataCurta = (iso) => fmtDataCurta.format(new Date(iso + "T00:00:00Z"));

export const VOCACOES = ["EK", "RP", "ED", "MS", "EM"];
export const NOMES_VOCACAO = { EK: "Knight", RP: "Paladin", ED: "Druid", MS: "Sorcerer", EM: "Monk" };

/** XP total para alcançar o level L (fórmula oficial do Tibia). */
export function xpDoLevel(L) {
  return (50 * L ** 3 - 300 * L ** 2 + 850 * L) / 3 - 200;
}

export function diasEntre(isoA, isoB) {
  return Math.round((new Date(isoB + "T00:00:00Z") - new Date(isoA + "T00:00:00Z")) / 86400000);
}

export function somarDias(iso, dias) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
}

/** Cálculos da meta de level a partir da linha do jogador (xp, xp_30) e da data de referência. */
export function calcularMeta(linha, meta, dataRef, dataMetaAnual) {
  const falta = xpDoLevel(meta) - linha.xp;
  const ritmo = linha.xp_30 / 30;
  const fimAno = `${dataRef.slice(0, 4)}-${dataMetaAnual}`;
  const diasAteFim = diasEntre(dataRef, fimAno);
  const diasNoRitmo = falta <= 0 ? 0 : ritmo > 0 ? falta / ritmo : Infinity;
  return {
    falta: Math.max(0, falta),
    atingida: falta <= 0,
    ritmo,
    diasNoRitmo,
    dataEstimada: isFinite(diasNoRitmo) ? somarDias(dataRef, Math.ceil(diasNoRitmo)) : null,
    diasAteFim,
    xpDiaAteFim: falta <= 0 ? 0 : diasAteFim > 0 ? falta / diasAteFim : null,
  };
}

export function faixaDoLevel(level, faixas) {
  for (const f of faixas) {
    if (f.endsWith("+")) { if (level >= parseInt(f)) return f; continue; }
    const [a, b] = f.split(" - ").map(Number);
    if (level >= a && level <= b) return f;
  }
  return faixas[0];
}

/** Lê uma cor (variável CSS) do tema atual. */
export function cor(variavel) {
  return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
}

export const corSerie = (i) => cor(`--s${(i % 8) + 1}`);
export const corVocacao = (v) => cor(`--voc-${v}`) || cor("--texto-3");

/** Escapa texto para inserir em HTML. */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function vocHTML(sigla) {
  return sigla && sigla !== "-" ? `<span class="voc voc-${sigla}">${sigla}</span>` : `<span class="muted">—</span>`;
}

export function varRankHTML(v) {
  if (v == null) return `<span class="muted">novo</span>`;
  if (v === 0) return `<span class="muted">=</span>`;
  return v > 0 ? `<span class="sobe">▲ ${v}</span>` : `<span class="desce">▼ ${-v}</span>`;
}

export function linkJogador(nome) {
  return `<a href="#jogador/${encodeURIComponent(nome)}">${esc(nome)}</a>`;
}

/** Guarda/lê preferências do usuário sem quebrar em modo privado. */
export const prefs = {
  ler(chave, padrao) {
    try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
  },
};
