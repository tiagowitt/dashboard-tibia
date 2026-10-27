// Tela 4 — Guild & Kills: membros, composição, médias por faixa, entradas/saídas e estatísticas de mortes.
import * as dados from "../dados.js";
import { barras, grafico, legendaHTML, linha, rotulosDatas } from "../graficos.js";
import {
  barraHTML, compacto, cor, corSerie, corVocacao, dataBR, esc, kpi, linkJogador, num, prefs, tituloTela, vocHTML, VOCACOES, NOMES_VOCACAO,
} from "../util.js";

export async function telaGuild(el, r) {
  const [g, k] = await Promise.all([dados.guild(), dados.kills()]);
  const membros = dados.tabela(g.membros);
  const estado = { guild: prefs.ler("guild.sel", ""), periodo: prefs.ler("kills.periodo", "7") };

  el.innerHTML = `
    ${tituloTela("Guild & Kills", `Membros de ${r.guilds.map(esc).join(" e ")} e as estatísticas de mortes do mundo`)}
    <div class="barra-filtros"><div class="controles">
      <div class="campo">Guild
        <div class="segmentado" id="g-sel">
          <button type="button" data-g="">Ambas</button>
          ${r.guilds.map((n) => `<button type="button" data-g="${esc(n)}">${esc(n)}</button>`).join("")}
        </div>
      </div>
    </div></div>
    ${g.inicio_historico === g.data ? `<div class="aviso">O histórico de guild começou em ${dataBR(g.inicio_historico)}. Membros por dia e saídas ficam completos conforme a coleta diária acumula dias.</div>` : ""}
    <div id="g-corpo"></div>

    <h2 class="secao">Kill statistics</h2>
    <div class="controles">
      <div class="campo">Período
        <div class="segmentado" id="k-periodo">
          <button type="button" data-p="1">Dia</button><button type="button" data-p="7">7 dias</button><button type="button" data-p="30">30 dias</button>
        </div>
      </div>
      <span class="muted">até ${dataBR(k.data)}</span>
    </div>
    <div id="k-corpo"></div>`;

  const $ = (s) => el.querySelector(s);
  $("#g-sel").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    estado.guild = b.dataset.g; prefs.gravar("guild.sel", estado.guild); desenharGuild();
  });
  $("#k-periodo").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    estado.periodo = b.dataset.p; prefs.gravar("kills.periodo", estado.periodo); desenharKills();
  });

  function desenharGuild() {
    el.querySelectorAll("#g-sel button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.g === estado.guild));
    const sel = estado.guild;
    const filtra = (lista, campo = "guild") => (sel ? lista.filter((x) => x[campo] === sel) : lista);
    const ms = filtra(membros).sort((a, b) => b.level - a.level);
    const entradas = filtra(dados.tabela(g.entradas_30));
    const saidas = filtra(dados.tabela(g.saidas_30));
    const noTop = ms.filter((m) => m.rank != null).length;
    const guildsVisiveis = sel ? [sel] : r.guilds;

    $("#g-corpo").innerHTML = `
      <div class="kpis">
        ${kpi("Membros", num(ms.length), `em ${dataBR(g.data)}`, true)}
        ${kpi("No top 1000", num(noTop), ms.length ? `${Math.round((noTop / ms.length) * 100)}% dos membros` : "")}
        ${kpi("Entradas (30 dias)", num(entradas.length), "pela data de entrada")}
        ${kpi("Saídas (30 dias)", num(saidas.length), `desde ${dataBR(g.inicio_historico)}`)}
      </div>
      <div class="grade-2">
        <div class="cartao">
          <h2>Composição por faixa e vocação</h2>
          <div id="g-leg-comp"></div>
          <div class="grafico alto" id="g-comp"></div>
        </div>
        <div class="cartao">
          <h2>Média de XP 30 dias por faixa</h2>
          <p class="muted" style="margin:-.4rem 0 .4rem">Só membros no top 1000</p>
          <div id="g-leg-media"></div>
          <div class="grafico alto" id="g-media"></div>
        </div>
      </div>
      <div class="cartao">
        <h2>Membros por dia</h2>
        <div id="g-leg-dia"></div>
        <div class="grafico" id="g-dia"></div>
      </div>
      <div class="grade-2">
        <div class="cartao"><h2>Entradas nos últimos 30 dias</h2>
          <div class="tabela-rolagem" style="max-height:360px">${tabelaPessoas(entradas, "data", "Entrou", !sel)}</div></div>
        <div class="cartao"><h2>Saídas nos últimos 30 dias</h2>
          <div class="tabela-rolagem" style="max-height:360px">${tabelaPessoas(saidas, "visto_por_ultimo", "Visto por último", !sel)}</div></div>
      </div>
      <div class="cartao">
        <h2>Membros (${num(ms.length)})</h2>
        <div class="tabela-rolagem" style="max-height:480px">${tabelaMembros(ms, !sel)}</div>
      </div>`;

    // Composição: barras horizontais empilhadas por vocação (cor fixa por vocação).
    const comp = filtra(dados.tabela(g.composicao));
    const faixasComp = r.faixas.filter((f) => comp.some((c) => c.faixa === f)).reverse();
    $("#g-leg-comp").innerHTML = legendaHTML(VOCACOES.map((v) => [`${v} · ${NOMES_VOCACAO[v]}`, corVocacao(v)]), true);
    grafico($("#g-comp"), "bar", {
      labels: faixasComp,
      datasets: VOCACOES.map((v) => barras(v, faixasComp.map((f) =>
        comp.filter((c) => c.faixa === f && c.voc === v).reduce((s, c) => s + c.n, 0)), corVocacao(v), {
        borderRadius: 0, borderColor: cor("--superficie"), borderWidth: { right: 2 }, borderSkipped: false,
      })),
    }, {
      indexAxis: "y",
      interaction: { mode: "index", axis: "y", intersect: false },
      scales: {
        x: { stacked: true, grid: { display: true, color: cor("--grade") }, ticks: { callback: (v) => num(v) } },
        y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, callback: rotuloCategoria } },
      },
    });

    // Médias por faixa: barras horizontais, uma série por guild.
    const faixasMedia = r.faixas.filter((f) => guildsVisiveis.some((gn) => r.medias_faixa[gn]?.[f])).reverse();
    $("#g-leg-media").innerHTML = guildsVisiveis.length > 1
      ? legendaHTML(guildsVisiveis.map((gn) => [esc(gn), corSerie(r.guilds.indexOf(gn))]), true) : "";
    grafico($("#g-media"), "bar", {
      labels: faixasMedia,
      datasets: guildsVisiveis.map((gn) => barras(gn, faixasMedia.map((f) => r.medias_faixa[gn]?.[f]?.media ?? null),
        corSerie(r.guilds.indexOf(gn)), { borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: "start" })),
    }, {
      indexAxis: "y",
      interaction: { mode: "index", axis: "y", intersect: false },
      scales: {
        x: { grid: { display: true, color: cor("--grade") }, ticks: { callback: (v) => compacto(v) } },
        y: { grid: { display: false }, ticks: { autoSkip: false, callback: rotuloCategoria } },
      },
      plugins: { tooltip: { callbacks: { label: (c) => {
        const info = r.medias_faixa[c.dataset.label]?.[c.label];
        return info ? ` ${c.dataset.label}: ${compacto(info.media)} (${info.n} membros)` : "";
      } } } },
    });

    // Membros por dia
    const porDia = filtra(dados.tabela(g.membros_por_dia));
    const datas = [...new Set(porDia.map((p) => p.data))].sort();
    $("#g-leg-dia").innerHTML = guildsVisiveis.length > 1
      ? legendaHTML(guildsVisiveis.map((gn) => [esc(gn), corSerie(r.guilds.indexOf(gn))])) : "";
    grafico($("#g-dia"), "line", {
      labels: rotulosDatas(datas),
      datasets: guildsVisiveis.map((gn) => {
        const m = new Map(porDia.filter((p) => p.guild === gn).map((p) => [p.data, p.n]));
        return linha(gn, datas.map((d) => m.get(d) ?? null), corSerie(r.guilds.indexOf(gn)), { pointRadius: datas.length < 15 ? 4 : 0 });
      }),
    }, { scales: { y: { beginAtZero: false, ticks: { callback: (v) => num(v) } } } });
  }

  function desenharKills() {
    el.querySelectorAll("#k-periodo button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === estado.periodo));
    const p = estado.periodo;
    const bosses = k.bosses.periodos[p].map(([boss, tipo, mortes]) => ({ boss, tipo, mortes }));
    const nemesis = dados.tabela(k.nemesis_historico).slice(0, 40);

    $("#k-corpo").innerHTML = `
      <div class="grade-2">
        <div class="cartao"><h2>Criaturas mais mortas</h2>${listaTop(k.criaturas[p].slice(0, 20), "Criatura", "Mortas", true)}</div>
        <div class="cartao"><h2>Quem mais matou jogadores</h2>${listaTop(k.matadores[p].slice(0, 20), "Criatura", "Jogadores mortos", true)}</div>
      </div>
      <div class="grade-2">
        ${["Nemesis", "Archfoe", "Bane"].map((t) => {
          const lista = bosses.filter((b) => b.tipo === t);
          return `<div class="cartao"><h2>Bosses ${t} <span class="muted">(${lista.length} diferentes)</span></h2>
            <div class="tabela-rolagem" style="max-height:360px">${listaTop(lista.map((b) => [b.boss, b.mortes]), "Boss", "Mortes")}</div></div>`;
        }).join("")}
        <div class="cartao"><h2>Últimos Nemesis mortos</h2>
          <div class="tabela-rolagem" style="max-height:360px">
            ${nemesis.length ? `<table><thead><tr><th>Data</th><th>Boss</th><th class="num">Mortes</th></tr></thead><tbody>
              ${nemesis.map((n) => `<tr><td>${dataBR(n.data)}</td><td>${esc(n.boss)}</td><td class="num">${n.mortes}</td></tr>`).join("")}
            </tbody></table>` : `<p class="vazio">Nenhum registro.</p>`}
          </div></div>
      </div>`;
  }

  desenharGuild();
  desenharKills();
}

// Em gráficos horizontais o eixo y é de categorias: mostra o nome, não o índice.
function rotuloCategoria(valor) {
  return this.getLabelForValue(valor);
}

// Nomes de criaturas vêm em minúsculas da API; os de bosses já vêm formatados.
function listaTop(itens, rotNome, rotValor, capitalizar = false) {
  if (!itens.length) return `<p class="vazio">Nenhum registro no período.</p>`;
  const maximo = Math.max(...itens.map(([, v]) => v));
  return `<table><thead><tr><th class="num">#</th><th>${rotNome}</th><th>${rotValor}</th></tr></thead><tbody>
    ${itens.map(([nome, v], i) => `<tr><td class="pos num">${i + 1}</td><td${capitalizar ? ' class="capitalizar"' : ""}>${esc(nome)}</td>
      <td style="width:45%">${barraHTML(v, maximo)}</td></tr>`).join("")}
  </tbody></table>`;
}

function tabelaPessoas(lista, campoData, rotData, mostrarGuild) {
  if (!lista.length) return `<p class="vazio">Nenhum registro.</p>`;
  return `<table><thead><tr><th>Personagem</th>${mostrarGuild ? "<th>Guild</th>" : ""}<th>Voc.</th><th class="num">Level</th><th class="num">${rotData}</th></tr></thead><tbody>
    ${lista.map((p) => `<tr><td>${linkJogador(p.nome)}</td>${mostrarGuild ? `<td class="muted">${esc(p.guild)}</td>` : ""}
      <td>${vocHTML(p.voc)}</td><td class="num">${p.level}</td><td class="num">${dataBR(p[campoData])}</td></tr>`).join("")}
  </tbody></table>`;
}

function tabelaMembros(ms, mostrarGuild) {
  return `<table><thead><tr><th>Personagem</th>${mostrarGuild ? "<th>Guild</th>" : ""}<th>Cargo</th><th>Voc.</th>
    <th class="num">Level</th><th>Faixa</th><th class="num">XP 30d</th><th class="num">Rank HS</th><th class="num">Entrou</th></tr></thead><tbody>
    ${ms.map((m) => `<tr><td>${linkJogador(m.nome)}</td>${mostrarGuild ? `<td class="muted">${esc(m.guild)}</td>` : ""}
      <td class="muted">${esc(m.cargo)}</td><td>${vocHTML(m.voc)}</td><td class="num">${m.level}</td><td>${m.faixa}</td>
      <td class="num">${m.xp_30 == null ? "—" : compacto(m.xp_30)}</td><td class="num">${m.rank ?? "—"}</td>
      <td class="num">${dataBR(m.entrou)}</td></tr>`).join("")}
  </tbody></table>`;
}
