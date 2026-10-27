// Tela 1 — Ranking XP: top por XP no dia / 7 / 30 dias, com data, busca e filtros.
import * as dados from "../dados.js";
import { compacto, dataBR, esc, linkJogador, num, prefs, varRankHTML, vocHTML, VOCACOES } from "../util.js";

const PERIODOS = { xp_dia: "Dia", xp_7: "7 dias", xp_30: "30 dias" };
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
      <label class="campo" style="flex:1 1 12rem">Buscar
        <input id="r-busca" type="search" placeholder="Nome do personagem" autocomplete="off">
      </label>
    </div>
    <div class="controles"><div class="chips" id="r-vocs">${VOCACOES.map((v) =>
      `<button type="button" class="chip" data-v="${v}">${vocHTML(v)}</button>`).join("")}</div></div>
    <div class="cartao">
      <h2 id="r-titulo"></h2>
      <div class="tabela-rolagem" id="r-tabela"></div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  $("#r-guild").value = estado.guild;

  async function desenhar() {
    el.querySelectorAll("#r-periodo button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === estado.periodo));
    el.querySelectorAll("#r-vocs button").forEach((b) => b.setAttribute("aria-pressed", estado.vocs.has(b.dataset.v)));

    const linhasMes = await dados.mes(estado.data.slice(0, 7));
    const busca = estado.busca.trim().toLowerCase();
    const p = estado.periodo;
    let linhas = linhasMes.filter((l) => l.data === estado.data);
    if (estado.vocs.size) linhas = linhas.filter((l) => estado.vocs.has(l.voc));
    if (estado.guild === "*") linhas = linhas.filter((l) => r.guild_de[l.nome]);
    else if (estado.guild) linhas = linhas.filter((l) => r.guild_de[l.nome] === estado.guild);
    linhas.sort((a, b) => b[p] - a[p] || a.rank - b.rank);
    linhas.forEach((l, i) => (l._pos = i + 1));  // posição por XP antes da busca
    if (busca) linhas = linhas.filter((l) => l.nome.toLowerCase().includes(busca));

    $("#r-titulo").textContent = `XP ganha — ${PERIODOS[p].toLowerCase()} até ${dataBR(estado.data)}`;
    if (!linhas.length) {
      $("#r-tabela").innerHTML = `<p class="vazio">Nenhum personagem encontrado.</p>`;
      return;
    }
    const visiveis = linhas.slice(0, estado.limite);
    $("#r-tabela").innerHTML = `
      <table>
        <thead><tr>
          <th>#</th><th>Personagem</th><th>Voc.</th><th class="num">Level</th>
          <th class="num">XP ${PERIODOS[p].toLowerCase()}</th><th class="num">Rank HS</th><th class="num">Variação</th>
          <th>Guild</th>
        </tr></thead>
        <tbody>${visiveis.map((l) => `
          <tr>
            <td class="pos num">${l._pos}</td>
            <td>${linkJogador(l.nome)}</td>
            <td>${vocHTML(l.voc)}</td>
            <td class="num">${l.level}</td>
            <td class="num" title="${num(l[p])}">${compacto(l[p])}</td>
            <td class="num">${l.rank}</td>
            <td class="num">${varRankHTML(l.var_rank)}</td>
            <td class="muted">${esc(r.guild_de[l.nome] || "")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${linhas.length > estado.limite
        ? `<p style="text-align:center"><button type="button" id="r-mais">Mostrar mais (${linhas.length - estado.limite} restantes)</button></p>`
        : `<p class="muted" style="text-align:center">${linhas.length} personagens</p>`}`;
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
