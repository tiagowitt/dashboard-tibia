// Tela 1 — Ranking XP: top por XP no dia / 7 / 30 dias, com data, busca e filtros.
import * as dados from "../dados.js";
import {
  compacto, dataBR, esc, kpi, linkJogador, num, pct, posicaoHTML, prefs, somarDias, tituloTela, vocHTML, VOCACOES,
} from "../util.js";

const PERIODOS = { xp_dia: "Dia", xp_7: "7 dias", xp_30: "30 dias" };
const DESCRICAO = { xp_dia: "no dia", xp_7: "nos últimos 7 dias", xp_30: "nos últimos 30 dias" };
// Período anterior usado na variação: o dia de antes, ou os 7 / 30 dias imediatamente anteriores.
const DIAS_ANTES = { xp_dia: 1, xp_7: 7, xp_30: 30 };
const ROTULO_VARIACAO = { xp_dia: "vs dia anterior", xp_7: "vs 7 dias antes", xp_30: "vs 30 dias antes" };

/** XP do período anterior de cada nome (mapa nome → valor), ou mapa vazio se não houver o dia. */
async function periodoAnterior(r, data, p) {
  const anterior = somarDias(data, -DIAS_ANTES[p]);
  if (!r.datas.includes(anterior)) return new Map();
  const linhas = await dados.mes(anterior.slice(0, 7));
  return new Map(linhas.filter((l) => l.data === anterior).map((l) => [l.nome, l[p]]));
}

function variacaoHTML(atual, anterior) {
  // Sem base de comparação (não estava no top, ou não ganhou XP antes): não há % que faça sentido.
  if (anterior == null || anterior <= 0) return `<span class="muted" title="Sem XP no período anterior">—</span>`;
  const v = atual / anterior - 1;
  const classe = v > 0.0005 ? "sobe" : v < -0.0005 ? "desce" : "";
  return `<span class="var ${classe}" title="Antes: ${num(anterior)}">${v > 0 ? "▲" : v < 0 ? "▼" : ""} ${pct(v).replace(/^[+-]/, "")}</span>`;
}
const POR_PAGINA = 100;

export async function telaRanking(el, r) {
  const estado = {
    data: r.data_ref,
    periodo: prefs.ler("ranking.periodo", "xp_dia"),
    busca: "",
    vocs: new Set(),
    guild: prefs.ler("ranking.guild", ""),
    limite: POR_PAGINA,
  };

  el.innerHTML = `
    ${tituloTela("Ranking de XP", `Quem mais upou entre o top 1000 de ${esc(r.mundo)}`)}
    <div class="barra-filtros">
      <div class="controles">
        <label class="campo">Data
          <select id="r-data">${[...r.datas].reverse().map((d) =>
            `<option value="${d}">${dataBR(d)}</option>`).join("")}</select>
        </label>
        <div class="campo">Período
          <div class="segmentado" id="r-periodo">${Object.entries(PERIODOS).map(([k, v]) =>
            `<button type="button" data-p="${k}">${v}</button>`).join("")}</div>
        </div>
        <label class="campo">Guild
          <select id="r-guild">
            <option value="">Todas</option>
            ${r.guilds.map((g) => `<option>${esc(g)}</option>`).join("")}
            <option value="*">Só membros das guilds</option>
          </select>
        </label>
        <label class="campo" style="flex:1 1 14rem">Buscar
          <input id="r-busca" type="search" placeholder="Nome do personagem" autocomplete="off">
        </label>
      </div>
      <div class="controles"><div class="chips" id="r-vocs" aria-label="Filtrar por vocação">${VOCACOES.map((v) =>
        `<button type="button" class="chip" data-v="${v}">${vocHTML(v)}</button>`).join("")}</div></div>
    </div>
    <div class="kpis" id="r-kpis"></div>
    <div class="cartao">
      <div class="cartao-cab"><h2 id="r-titulo"></h2><span class="muted" id="r-contagem"></span></div>
      <div class="tabela-rolagem" id="r-tabela"></div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  $("#r-guild").value = estado.guild;

  async function desenhar() {
    el.querySelectorAll("#r-periodo button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === estado.periodo));
    el.querySelectorAll("#r-vocs button").forEach((b) => b.setAttribute("aria-pressed", estado.vocs.has(b.dataset.v)));

    const [linhasMes, antes] = await Promise.all([
      dados.mes(estado.data.slice(0, 7)), periodoAnterior(r, estado.data, estado.periodo)]);
    const busca = estado.busca.trim().toLowerCase();
    const p = estado.periodo;
    let linhas = linhasMes.filter((l) => l.data === estado.data);
    if (estado.vocs.size) linhas = linhas.filter((l) => estado.vocs.has(l.voc));
    if (estado.guild === "*") linhas = linhas.filter((l) => r.guild_de[l.nome]);
    else if (estado.guild) linhas = linhas.filter((l) => r.guild_de[l.nome] === estado.guild);
    linhas.sort((a, b) => b[p] - a[p] || a.rank - b.rank);
    linhas.forEach((l, i) => (l._pos = i + 1));  // posição por XP antes da busca

    // Indicadores do recorte (antes da busca por nome)
    const upando = linhas.filter((l) => l[p] > 0);
    const total = upando.reduce((s, l) => s + l[p], 0);
    const lider = linhas[0];
    $("#r-kpis").innerHTML = linhas.length ? [
      kpi("Maior ganho", compacto(lider[p]), esc(lider.nome), true),
      kpi("XP somada", compacto(total), `${DESCRICAO[p]}, no recorte`),
      kpi("Upando", num(upando.length), `de ${num(linhas.length)} personagens`),
      kpi("Média de quem upou", upando.length ? compacto(total / upando.length) : "—", "por personagem"),
    ].join("") : "";

    if (busca) linhas = linhas.filter((l) => l.nome.toLowerCase().includes(busca));

    $("#r-titulo").textContent = `XP ganha ${DESCRICAO[p]} · ${dataBR(estado.data)}`;
    $("#r-contagem").textContent = linhas.length ? `${num(linhas.length)} personagens` : "";
    if (!linhas.length) {
      $("#r-tabela").innerHTML = `<p class="vazio">Nenhum personagem encontrado.</p>`;
      return;
    }
    const visiveis = linhas.slice(0, estado.limite);
    $("#r-tabela").innerHTML = `
      <table>
        <thead><tr>
          <th class="num">#</th><th>Personagem</th><th class="centro">Vocação</th><th class="num">Level</th>
          <th class="num">XP ${PERIODOS[p].toLowerCase()}</th><th class="num">${ROTULO_VARIACAO[p]}</th>
        </tr></thead>
        <tbody>${visiveis.map((l) => `
          <tr>
            <td class="pos num">${posicaoHTML(l._pos)}</td>
            <td>${linkJogador(l.nome)}</td>
            <td class="centro">${vocHTML(l.voc)}</td>
            <td class="num">${l.level}</td>
            <td class="num"><strong>${num(l[p])}</strong></td>
            <td class="num">${variacaoHTML(l[p], antes.get(l.nome))}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${linhas.length > estado.limite
        ? `<p style="text-align:center;margin:1rem 0 0"><button type="button" id="r-mais">Mostrar mais (${num(linhas.length - estado.limite)} restantes)</button></p>`
        : ""}`;
    $("#r-mais")?.addEventListener("click", () => { estado.limite += POR_PAGINA; desenhar(); });
  }

  $("#r-data").addEventListener("change", (e) => { estado.data = e.target.value; estado.limite = POR_PAGINA; desenhar(); });
  $("#r-periodo").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    estado.periodo = b.dataset.p; prefs.gravar("ranking.periodo", estado.periodo); desenhar();
  });
  $("#r-guild").addEventListener("change", (e) => {
    estado.guild = e.target.value; prefs.gravar("ranking.guild", estado.guild); estado.limite = POR_PAGINA; desenhar();
  });
  $("#r-vocs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    estado.vocs.has(b.dataset.v) ? estado.vocs.delete(b.dataset.v) : estado.vocs.add(b.dataset.v);
    estado.limite = POR_PAGINA; desenhar();
  });
  let espera;
  $("#r-busca").addEventListener("input", (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.busca = e.target.value; estado.limite = POR_PAGINA; desenhar(); }, 150);
  });

  await desenhar();
}
