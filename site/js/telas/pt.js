// Tela 3 — Análise PT: até 7 personagens com meta, comparação com a guild e XP/dia até o fim do ano.
import * as dados from "../dados.js";
import { grafico, legendaHTML, linha, rotulosDatas } from "../graficos.js";
import {
  calcularMeta, compacto, corSerie, dataBR, esc, faixaDoLevel, linkJogador, num, pct, prefs, tituloTela, vocHTML, xpDoLevel,
} from "../util.js";

const MAXIMO = 7;

export async function telaPT(el, r) {
  let lista = prefs.ler("pt.lista", null) ?? r.pt_padrao.map((p) => ({ ...p }));
  const ultimoMes = await dados.mes(r.meses.at(-1));
  const nomes = [...new Set(ultimoMes.map((l) => l.nome))].sort();

  el.innerHTML = `
    ${tituloTela("Análise da PT", "Compare o ritmo de cada personagem, a média da guild e o caminho até a meta")}
    <div class="cartao">
      <div class="cartao-cab"><h2>Personagens</h2><span class="muted">até ${MAXIMO}, com a meta de level de cada um</span></div>
      <form id="pt-form">
        <div class="pt-linhas" id="pt-linhas"></div>
        <datalist id="pt-nomes">${nomes.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        <div class="controles" style="margin:1rem 0 0">
          <button type="button" id="pt-add">+ Adicionar</button>
          <button type="button" id="pt-padrao">Restaurar padrão</button>
          <button type="submit" class="primario">Atualizar análise</button>
        </div>
      </form>
    </div>
    <div id="pt-corpo"></div>`;

  const $ = (s) => el.querySelector(s);

  function desenharEditor() {
    $("#pt-linhas").innerHTML = lista.map((p, i) => `
      <div class="pt-linha">
        <span class="ponto" style="--cor:${corSerie(i)}"></span>
        <input list="pt-nomes" name="nome" value="${esc(p.nome)}" placeholder="Personagem" aria-label="Personagem ${i + 1}" autocomplete="off">
        <input type="number" name="meta" value="${p.meta}" min="2" max="5000" title="Meta de level" aria-label="Meta de level ${i + 1}">
        <button type="button" data-remover="${i}" aria-label="Remover ${esc(p.nome)}">✕</button>
      </div>`).join("");
    $("#pt-add").disabled = lista.length >= MAXIMO;
  }

  function lerEditor() {
    const linhas = [...el.querySelectorAll(".pt-linha")];
    lista = linhas.map((d) => ({
      nome: d.querySelector("[name=nome]").value.trim(),
      meta: +d.querySelector("[name=meta]").value || 0,
    })).filter((p) => p.nome);
  }

  $("#pt-linhas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remover]"); if (!b) return;
    lerEditor(); lista.splice(+b.dataset.remover, 1); desenharEditor();
  });
  $("#pt-add").addEventListener("click", () => {
    lerEditor(); if (lista.length < MAXIMO) lista.push({ nome: "", meta: 1000 }); desenharEditor();
    el.querySelector(".pt-linha:last-child input")?.focus();
  });
  $("#pt-padrao").addEventListener("click", () => {
    lista = r.pt_padrao.map((p) => ({ ...p })); desenharEditor(); analisar();
  });
  $("#pt-form").addEventListener("submit", (e) => { e.preventDefault(); lerEditor(); desenharEditor(); analisar(); });

  async function analisar() {
    prefs.gravar("pt.lista", lista);
    const hist = await dados.variosMeses(dados.mesesDosUltimosDias(r, 31));
    const membros = lista.map((p, i) => {
      const linhas = hist.filter((l) => l.nome.toLowerCase() === p.nome.toLowerCase());
      return { ...p, i, linhas, atual: linhas.at(-1) };
    });
    desenharAnalise($("#pt-corpo"), r, membros);
  }

  desenharEditor();
  await analisar();
}

function desenharAnalise(corpo, r, membros) {
  const presentes = membros.filter((m) => m.atual);
  const ausentes = membros.filter((m) => !m.atual);
  const fimAno = `${r.data_ref.slice(0, 4)}-${r.data_meta_anual}`;

  for (const m of presentes) {
    m.guild = r.guild_de[m.atual.nome];
    m.faixa = faixaDoLevel(m.atual.level, r.faixas);
    const media = m.guild ? r.medias_faixa[m.guild]?.[m.faixa] : null;
    m.mediaFaixa = media;
    m.vsGuild = media ? m.atual.xp_30 / media.media - 1 : null;
    m.calc = m.meta > m.atual.level ? calcularMeta(m.atual, m.meta, r.data_ref, r.data_meta_anual) : null;
  }

  corpo.innerHTML = `
    ${ausentes.length ? `<div class="aviso">Fora do top 1000 nos últimos 30 dias: ${ausentes.map((m) => esc(m.nome)).join(", ")}.</div>` : ""}
    ${presentes.length ? `
    <div class="cartao">
      <div class="cartao-cab"><h2>Comparativo</h2><span class="muted">${dataBR(r.data_ref)}</span></div>
      <div class="tabela-rolagem">${tabelaComparativa(presentes, r)}</div>
      <p class="muted" style="margin:.5rem 0 0">“vs guild” compara a XP 30 dias com a média dos membros da mesma guild e faixa de level que estão no top 1000.</p>
    </div>
    <div class="cartao">
      <h2>XP por dia — últimos 30 dias</h2>
      <div id="pt-leg"></div>
      <div class="grafico alto" id="pt-grafico"></div>
    </div>
    <div class="cartao">
      <div class="cartao-cab"><h2>XP/dia necessária até ${dataBR(fimAno)}</h2><span class="muted">por level alvo</span></div>
      <div class="tabela-rolagem">${tabelaPorLevel(presentes, r)}</div>
    </div>` : `<p class="muted">Adicione personagens para ver a análise.</p>`}`;

  if (!presentes.length) return;

  // Gráfico: uma linha por personagem, nas datas dos últimos 30 dias.
  const inicio = new Date(r.data_ref + "T00:00:00Z");
  inicio.setUTCDate(inicio.getUTCDate() - 29);
  const datas = [];
  for (let d = inicio; d.toISOString().slice(0, 10) <= r.data_ref; d.setUTCDate(d.getUTCDate() + 1)) {
    datas.push(d.toISOString().slice(0, 10));
  }
  corpo.querySelector("#pt-leg").innerHTML = legendaHTML(presentes.map((m) => [esc(m.atual.nome), corSerie(m.i)]));
  grafico(corpo.querySelector("#pt-grafico"), "line", {
    labels: rotulosDatas(datas),
    datasets: presentes.map((m) => {
      const porData = new Map(m.linhas.map((l) => [l.data, l.xp_dia]));
      return linha(m.atual.nome, datas.map((d) => porData.get(d) ?? null), corSerie(m.i), { spanGaps: false, pointRadius: 2 });
    }),
  });
}

function tabelaComparativa(membros) {
  return `<table>
    <thead><tr>
      <th>Personagem</th><th>Voc.</th><th class="num">Level</th><th class="num">XP dia</th><th class="num">XP 7d</th>
      <th class="num">XP 30d</th><th class="num">Média/dia</th><th>Faixa</th><th class="num">vs guild</th>
      <th class="num">Meta</th><th class="num">Falta</th><th class="num">Dias no ritmo</th><th class="num">Previsão</th>
    </tr></thead>
    <tbody>${membros.map((m) => {
      const a = m.atual, c = m.calc;
      return `<tr>
        <td>${linkJogador(a.nome)}</td><td>${vocHTML(a.voc)}</td><td class="num">${a.level}</td>
        <td class="num" title="${num(a.xp_dia)}">${compacto(a.xp_dia)}</td>
        <td class="num" title="${num(a.xp_7)}">${compacto(a.xp_7)}</td>
        <td class="num" title="${num(a.xp_30)}">${compacto(a.xp_30)}</td>
        <td class="num">${compacto(a.xp_30 / 30)}</td>
        <td>${m.faixa}</td>
        <td class="num ${m.vsGuild > 0 ? "sobe" : m.vsGuild < 0 ? "desce" : ""}"
            title="${m.mediaFaixa ? `Média ${esc(m.guild)} ${m.faixa}: ${num(m.mediaFaixa.media)} (${m.mediaFaixa.n} membros)` : "Sem guild ou sem média na faixa"}">${pct(m.vsGuild)}</td>
        <td class="num">${m.meta || "—"}</td>
        ${c ? `<td class="num" title="${num(Math.round(c.falta))}">${compacto(c.falta)}</td>
          <td class="num">${isFinite(c.diasNoRitmo) ? num(Math.ceil(c.diasNoRitmo)) : "—"}</td>
          <td class="num">${c.dataEstimada ? dataBR(c.dataEstimada) : "—"}</td>`
        : `<td class="num muted" colspan="3">${m.meta ? "meta atingida" : "sem meta"}</td>`}
      </tr>`;
    }).join("")}</tbody></table>`;
}

function tabelaPorLevel(membros, r) {
  const fimAno = `${r.data_ref.slice(0, 4)}-${r.data_meta_anual}`;
  const diasAteFim = Math.round((new Date(fimAno) - new Date(r.data_ref)) / 86400000);
  if (diasAteFim <= 0) return `<p class="muted">O prazo de ${dataBR(fimAno)} já passou.</p>`;

  const menor = Math.min(...membros.map((m) => m.atual.level));
  const maior = Math.max(...membros.map((m) => Math.max(m.meta || 0, m.atual.level + 50)));
  const passo = maior - menor > 400 ? 50 : maior - menor > 150 ? 25 : 10;
  const niveis = [];
  for (let L = Math.ceil((menor + 1) / passo) * passo; L <= Math.ceil(maior / passo) * passo; L += passo) niveis.push(L);
  for (const m of membros) if (m.meta && !niveis.includes(m.meta)) niveis.push(m.meta);
  niveis.sort((a, b) => a - b);

  return `<table>
    <thead><tr><th class="num">Level</th>${membros.map((m) =>
      `<th class="num">${esc(m.atual.nome)}<br><span class="muted">${compacto(m.atual.xp_30 / 30)}/dia hoje</span></th>`).join("")}</tr></thead>
    <tbody>${niveis.map((L) => `<tr>
      <td class="num"><strong>${L}</strong></td>
      ${membros.map((m) => {
        const falta = xpDoLevel(L) - m.atual.xp;
        if (falta <= 0) return `<td class="num muted">✓</td>`;
        const porDia = falta / diasAteFim;
        const ritmo = m.atual.xp_30 / 30;
        const ehMeta = L === m.meta;
        return `<td class="num ${porDia <= ritmo ? "sobe" : ""}" title="${num(Math.round(porDia))} XP/dia">${ehMeta ? "<strong>" : ""}${compacto(porDia)}${ehMeta ? " ★</strong>" : ""}</td>`;
      }).join("")}
    </tr>`).join("")}</tbody></table>
    <p class="muted" style="margin:.5rem 0 0">${diasAteFim} dias até ${dataBR(fimAno)}. Verde = cabe no ritmo atual (média de 30 dias). ★ = meta do personagem.</p>`;
}
