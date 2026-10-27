// Tela 2 — Jogador: KPIs, gráficos de XP/level/posição, calculadora de meta e histórico.
import * as dados from "../dados.js";
import { barras, degrade, grafico, legendaHTML, linha, rotulosDatas } from "../graficos.js";
import {
  calcularMeta, compacto, cor, dataBR, esc, kpi, num, prefs, tituloTela, varRankHTML, vocHTML, NOMES_VOCACAO,
} from "../util.js";

const PERIODOS = [[30, "30 dias"], [90, "90 dias"], [180, "180 dias"], [9999, "Tudo"]];

export async function telaJogador(el, r, nomeRota) {
  const nomesRecentes = [...new Set((await dados.mes(r.meses.at(-1))).map((l) => l.nome))].sort();
  const nome = nomeRota || prefs.ler("jogador.ultimo", "");
  const dias = prefs.ler("jogador.dias", 90);

  el.innerHTML = `
    <form class="barra-filtros" id="j-form"><div class="controles">
      <label class="campo" style="flex:1 1 14rem">Personagem
        <input id="j-nome" list="j-nomes" value="${esc(nome)}" placeholder="Digite o nome" autocomplete="off" required>
        <datalist id="j-nomes">${nomesRecentes.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      </label>
      <label class="campo">Período
        <select id="j-dias">${PERIODOS.map(([d, t]) => `<option value="${d}" ${d === dias ? "selected" : ""}>${t}</option>`).join("")}</select>
      </label>
      <button class="primario" type="submit">Ver jogador</button>
    </div></form>
    <div id="j-corpo"></div>`;

  const $ = (s) => el.querySelector(s);
  $("#j-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = $("#j-nome").value.trim();
    if (n) location.hash = `jogador/${encodeURIComponent(n)}`;
  });
  $("#j-dias").addEventListener("change", (e) => { prefs.gravar("jogador.dias", +e.target.value); desenhar(); });

  async function desenhar() {
    const corpo = $("#j-corpo");
    if (!nome) {
      corpo.innerHTML = tituloTela("Jogador", "Escolha um personagem acima para ver evolução, metas e histórico.");
      return;
    }
    const diasSel = +$("#j-dias").value;
    corpo.innerHTML = `<div class="carregando"><span></span><span></span></div>`;
    const linhas = (await dados.variosMeses(dados.mesesDosUltimosDias(r, diasSel)))
      .filter((l) => l.nome.toLowerCase() === nome.toLowerCase());
    const inicio = new Date(r.data_ref + "T00:00:00Z");
    inicio.setUTCDate(inicio.getUTCDate() - diasSel + 1);
    const hist = linhas.filter((l) => l.data >= inicio.toISOString().slice(0, 10));

    if (!hist.length) {
      corpo.innerHTML = `<div class="aviso">“${esc(nome)}” não aparece no top 1000 no período escolhido. Confira o nome ou aumente o período.</div>`;
      return;
    }
    prefs.gravar("jogador.ultimo", hist[0].nome);
    desenharJogador(corpo, r, hist);
  }

  await desenhar();
}

function desenharJogador(corpo, r, hist) {
  const atual = hist.at(-1);
  const guild = r.guild_de[atual.nome];
  const foraDoTop = atual.data !== r.data_ref;
  const metaPadrao = r.pt_padrao.find((p) => p.nome === atual.nome)?.meta
    ?? Math.ceil((atual.level + 50) / 50) * 50;
  const metaSalva = prefs.ler(`meta.${atual.nome}`, metaPadrao);

  corpo.innerHTML = `
    <div class="perfil">
      <div class="avatar" style="--cor:var(--voc-${atual.voc}, var(--texto-3))" aria-hidden="true">${esc(atual.nome[0])}</div>
      <div>
        <h1>${esc(atual.nome)}</h1>
        <p>${vocHTML(atual.voc)} <span>${NOMES_VOCACAO[atual.voc] ?? ""}</span>
          ${guild ? `<span>· ${esc(guild)}</span>` : ""}<span>· último registro em ${dataBR(atual.data)}</span></p>
      </div>
    </div>
    ${foraDoTop ? `<div class="aviso">Fora do top 1000 desde ${dataBR(atual.data)}; os números abaixo são do último dia em que apareceu.</div>` : ""}
    <div class="kpis">
      ${kpi("Level", atual.level, `${atual.lv_30 >= 0 ? "+" : ""}${atual.lv_30} em 30 dias`)}
      ${kpi("XP no dia", compacto(atual.xp_dia), num(atual.xp_dia))}
      ${kpi("XP 7 dias", compacto(atual.xp_7), num(atual.xp_7))}
      ${kpi("XP 30 dias", compacto(atual.xp_30), num(atual.xp_30), true)}
      ${kpi("Média diária (30d)", compacto(atual.xp_30 / 30), num(Math.round(atual.xp_30 / 30)))}
      ${kpi("Rank no highscore", atual.rank, varRankHTML(atual.var_rank))}
    </div>

    <div class="cartao">
      <h2>XP por dia</h2>
      <div id="j-leg-xp"></div>
      <div class="grafico" id="j-g-xp"></div>
    </div>
    <div class="grade-2">
      <div class="cartao"><h2>Level</h2><div class="grafico" id="j-g-level"></div></div>
      <div class="cartao"><h2>Posição no highscore</h2><div class="grafico" id="j-g-rank"></div></div>
    </div>

    <div class="cartao">
      <h2>Calculadora de meta</h2>
      <div class="controles">
        <label class="campo">Level meta <input type="number" id="j-meta" min="${atual.level + 1}" max="5000" value="${metaSalva}"></label>
      </div>
      <div class="kpis" id="j-meta-res" style="margin-bottom:0"></div>
    </div>

    <div class="cartao">
      <h2>Histórico diário</h2>
      <div class="tabela-rolagem">${tabelaHistorico(hist)}</div>
    </div>`;

  const kpiMeta = () => {
    const meta = +corpo.querySelector("#j-meta").value;
    if (!meta || meta <= atual.level) {
      corpo.querySelector("#j-meta-res").innerHTML = `<p class="muted">Informe um level maior que o atual (${atual.level}).</p>`;
      return;
    }
    prefs.gravar(`meta.${atual.nome}`, meta);
    const m = calcularMeta(atual, meta, r.data_ref, r.data_meta_anual);
    corpo.querySelector("#j-meta-res").innerHTML = `
      ${kpi("XP que falta", compacto(m.falta), num(Math.round(m.falta)))}
      ${kpi("Ritmo atual", `${compacto(m.ritmo)}/dia`, "média dos últimos 30 dias")}
      ${kpi("Dias no ritmo atual", isFinite(m.diasNoRitmo) ? num(Math.ceil(m.diasNoRitmo)) : "—",
            m.dataEstimada ? `previsão: ${dataBR(m.dataEstimada)}` : "sem ganho de XP em 30 dias")}
      ${kpi(`XP/dia até ${dataBR(r.data_ref.slice(0, 4) + "-" + r.data_meta_anual)}`,
            m.xpDiaAteFim == null ? "—" : compacto(m.xpDiaAteFim),
            m.xpDiaAteFim == null ? "prazo encerrado" : `${m.diasAteFim} dias restantes`)}`;
  };
  corpo.querySelector("#j-meta").addEventListener("input", kpiMeta);
  kpiMeta();

  // Gráficos
  const rotulos = rotulosDatas(hist.map((l) => l.data));
  const cXp = cor("--s1"), cMedia = cor("--s2");
  corpo.querySelector("#j-leg-xp").innerHTML = legendaHTML([["XP no dia", cXp], ["Média móvel 7 dias", cMedia]]);
  grafico(corpo.querySelector("#j-g-xp"), "bar", {
    labels: rotulos,
    datasets: [
      linha("Média móvel 7 dias", hist.map((l) => l.xp_7 / 7), cMedia, { order: 0 }),
      barras("XP no dia", hist.map((l) => l.xp_dia), cXp, { order: 1 }),
    ],
  });
  grafico(corpo.querySelector("#j-g-level"), "line", {
    labels: rotulos, datasets: [linha("Level", hist.map((l) => l.level), cor("--s1"),
      { tension: 0.2, fill: "origin", backgroundColor: degrade(cor("--s1")) })],
  }, { scales: { y: { ticks: { callback: (v) => num(v) } } } });
  grafico(corpo.querySelector("#j-g-rank"), "line", {
    labels: rotulos, datasets: [linha("Rank", hist.map((l) => l.rank), cor("--s7"),
      { tension: 0.2, fill: "end", backgroundColor: degrade(cor("--s7")) })],
  }, { scales: { y: { reverse: true, ticks: { callback: (v) => num(v) } } } });
}

function tabelaHistorico(hist) {
  return `<table>
    <thead><tr><th>Data</th><th class="num">Level</th><th class="num">XP no dia</th><th class="num">XP 7 dias</th>
      <th class="num">XP 30 dias</th><th class="num">Rank</th><th class="num">Variação</th></tr></thead>
    <tbody>${[...hist].reverse().map((l) => `<tr>
      <td>${dataBR(l.data)}</td><td class="num">${l.level}</td>
      <td class="num">${num(l.xp_dia)}</td><td class="num">${compacto(l.xp_7)}</td><td class="num">${compacto(l.xp_30)}</td>
      <td class="num">${l.rank}</td><td class="num">${varRankHTML(l.var_rank)}</td></tr>`).join("")}
    </tbody></table>`;
}
