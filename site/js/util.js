// Formatação, regras de XP e pequenos utilitários de DOM.

const fmtInteiro = new Intl.NumberFormat("pt-BR");
const fmtUmaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtDuasCasas = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const fmtDataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export const num = (v) => (v == null ? "—" : fmtInteiro.format(v));
// Padrão do Tibia: k = mil, kk = milhão, kkk = bilhão (65,1kk; 1,97kkk).
// Bilhões com 2 casas, o resto com 1.
const ESCALAS = [[1e9, "kkk", fmtDuasCasas], [1e6, "kk", fmtUmaCasa], [1e3, "k", fmtUmaCasa]];
export function compacto(v) {
  if (v == null) return "—";
  const a = Math.abs(v);
  for (let i = 0; i < ESCALAS.length; i++) {
    const [base, sufixo, fmt] = ESCALAS[i];
    if (a < base) continue;
    // 999.960.000 arredondaria para "1.000kk": nesse caso sobe para a escala de cima.
    if (i > 0 && Math.round((a / base) * 10) / 10 >= 1000) return `${ESCALAS[i - 1][2].format(v / ESCALAS[i - 1][0])}${ESCALAS[i - 1][1]}`;
    return `${fmt.format(v / base)}${sufixo}`;
  }
  return fmtUmaCasa.format(v);
}
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
/** Maior level já alcançado com essa XP total (inverso de xpDoLevel). */
export function levelDaXp(xp) {
  let L = Math.max(1, Math.floor(Math.cbrt((xp * 3) / 50)));  // aproximação; o laço acerta o valor exato
  while (xpDoLevel(L + 1) <= xp) L++;
  while (L > 1 && xpDoLevel(L) > xp) L--;
  return L;
}

/**
 * Prazo do fim do ano (dia/mês do config, ex. "12-31").
 * Os dias contam a partir do dia da atualização (dia de referência + 1), como na planilha antiga:
 * dados de 27/10 (atualizados em 28/10) → 64 dias até 31/12. Sem dias restantes, passa para o ano seguinte.
 */
export function prazoAnual(dataRef, dataMetaAnual) {
  const atualizacao = somarDias(dataRef, 1);
  let ano = +atualizacao.slice(0, 4);
  if (diasEntre(atualizacao, `${ano}-${dataMetaAnual}`) <= 0) ano++;
  const fim = `${ano}-${dataMetaAnual}`;
  return { fim, dias: diasEntre(atualizacao, fim) };
}

export function calcularMeta(linha, meta, dataRef) {
  const falta = xpDoLevel(meta) - linha.xp;
  const ritmo = linha.xp_30 / 30;
  const diasNoRitmo = falta <= 0 ? 0 : ritmo > 0 ? falta / ritmo : Infinity;
  return {
    falta: Math.max(0, falta),
    atingida: falta <= 0,
    ritmo,
    diasNoRitmo,
    dataEstimada: isFinite(diasNoRitmo) ? somarDias(dataRef, Math.ceil(diasNoRitmo)) : null,
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
  if (v === 0) return `<span class="muted">—</span>`;
  return v > 0 ? `<span class="var sobe">▲ ${v}</span>` : `<span class="var desce">▼ ${-v}</span>`;
}

/** Posição com medalha para o top 3. */
export function posicaoHTML(pos) {
  return pos <= 3 ? `<span class="medalha medalha-${pos}">${pos}</span>` : String(pos);
}

export function tituloTela(titulo, subtitulo = "") {
  return `<div class="titulo-tela"><h1>${titulo}</h1>${subtitulo ? `<p>${subtitulo}</p>` : ""}</div>`;
}

export function kpi(rotulo, valor, detalhe = "", destaque = false) {
  return `<div class="kpi${destaque ? " destaque" : ""}"><div class="rotulo">${rotulo}</div>` +
    `<div class="valor">${valor}</div><div class="detalhe">${detalhe}</div></div>`;
}

/** Linha de tabela de top com barra proporcional. */
export function barraHTML(valor, maximo) {
  const largura = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return `<div class="barra-celula"><span class="trilha"><span style="width:${largura}%"></span></span>` +
    `<span class="num">${fmtInteiro.format(valor)}</span></div>`;
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
