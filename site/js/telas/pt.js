// Tela 3 — Análise PT: até 7 personagens com meta, comparação com a guild e levels possíveis até o fim do ano.
import * as dados from "../dados.js";
import { grafico, legendaHTML, linha, rotulosDatas } from "../graficos.js";
import {
  calcularMeta, corSerie, dataBR, dataCurta, esc, faixaDoLevel, levelDaXp, linkJogador, num, prazoAnual, prefs,
  tituloTela, vocHTML, xpDoLevel,
} from "../util.js";

const MAXIMO = 7;

export async function telaPT(el, r) {
  let lista = prefs.ler("pt.lista", null) ?? r.pt_padrao.map((p) => ({ ...p }));
  const ultimoMes = await dados.mes(r.meses.at(-1));
  const nomes = [...new Set(ultimoMes.map((l) => l.nome))].sort();

  el.innerHTML = `
    ${tituloTela("Análise da PT", "Compare o ritmo de cada personagem, a média da guild e o caminho até a meta")}
    <div class="cartao">
      <div class="cartao-cab"><h2>Personagens</h2><span class="muted">até ${MAXIMO} · a meta de level fica na tabela Comparativo</span></div>
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
        <button type="button" data-remover="${i}" aria-label="Remover ${esc(p.nome)}">✕</button>
      </div>`).join("");
    $("#pt-add").disabled = lista.length >= MAXIMO;
  }

  // A meta não está no editor: cada linha mantém a meta que já tinha (editada no Comparativo).
  function lerEditor() {
    const linhas = [...el.querySelectorAll(".pt-linha")];
    lista = linhas.map((d, i) => ({
      nome: d.querySelector("[name=nome]").value.trim(),
      meta: lista[i]?.meta || 0,
    })).filter((p) => p.nome);
  }

  $("#pt-linhas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remover]"); if (!b) return;
    lerEditor(); lista.splice(+b.dataset.remover, 1); desenharEditor();
  });
  $("#pt-add").addEventListener("click", () => {
    lerEditor(); if (lista.length < MAXIMO) lista.push({ nome: "", meta: 0 }); desenharEditor();
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
    desenharAnalise($("#pt-corpo"), r, membros, (i, meta) => {
      lista[i].meta = meta;
      analisar();
    });
  }

  desenharEditor();
  await analisar();
}

function desenharAnalise(corpo, r, membros, aoMudarMeta) {
  const presentes = membros.filter((m) => m.atual);
  const ausentes = membros.filter((m) => !m.atual);
  const prazo = prazoAnual(r.data_ref, r.data_meta_anual);

  for (const m of presentes) {
    m.guild = r.guild_de[m.atual.nome];
    m.faixa = faixaDoLevel(m.atual.level, r.faixas);
    const media = m.guild ? r.medias_faixa[m.guild]?.[m.faixa] : null;
    m.mediaFaixa = media;
    m.vsGuild = media ? m.atual.xp_30 / media.media - 1 : null;
    m.calc = m.meta > m.atual.level ? calcularMeta(m.atual, m.meta, r.data_ref) : null;
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
      <div class="cartao-cab"><h2>Levels possíveis até ${dataBR(prazo.fim)}</h2>
        <span class="muted">${prazo.dias} dias restantes · ritmo = média dos últimos 30 dias</span></div>
      <div class="legenda legenda-nv">
        <span class="item"><i class="quad nv-ok"></i>✓ Já atingido</span>
        <span class="item"><i class="quad nv-sim"></i>Atinge no ritmo atual</span>
        <span class="item"><i class="quad nv-nao"></i>Não atinge no ritmo atual</span>
      </div>
      <div class="tabela-rolagem">${tabelaPorLevel(presentes, prazo)}</div>
      <p class="muted" style="margin:.5rem 0 0">Cada célula mostra a XP por dia necessária para chegar ao level até ${dataBR(prazo.fim)}.</p>
    </div>` : `<p class="muted">Adicione personagens para ver a análise.</p>`}`;

  if (!presentes.length) return;

  // Meta editável direto no Comparativo: salva e recalcula ao confirmar (Enter ou sair do campo).
  corpo.querySelectorAll(".meta-input").forEach((campo) => {
    campo.addEventListener("change", () => aoMudarMeta(+campo.dataset.i, Math.max(0, Math.round(+campo.value || 0))));
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter") campo.blur(); });
  });

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

// Comparativo com os personagens nas colunas e os indicadores nas linhas (mesma ordem da planilha antiga).
const LINHAS_COMPARATIVO = [
  ["Level atual", (m) => `<strong>${m.atual.level}</strong>`],
  ["Levels em 30 dias", (m) => num(m.atual.lv_30)],
  ["Média de XP diária (30 dias)", (m) => valor(m.atual.xp_30 / 30)],
  ["XP ontem", (m) => valor(m.atual.xp_dia)],
  ["XP 7 dias", (m) => valor(m.atual.xp_7)],
  ["XP 30 dias", (m) => valor(m.atual.xp_30)],
  ["% XP vs média da guild na faixa", (m) => m.vsGuild == null
    ? `<span class="muted" title="Sem guild ou sem média na faixa">—</span>`
    : `<span class="var ${m.vsGuild > 0 ? "sobe" : m.vsGuild < 0 ? "desce" : ""}"
        title="${esc(m.guild)} · ${m.faixa}: média ${num(m.mediaFaixa.media)} (${m.mediaFaixa.n} membros no top 1000)">${m.vsGuild > 0 ? "▲" : m.vsGuild < 0 ? "▼" : ""} ${pct2(Math.abs(m.vsGuild))}</span>`],
  ["Meta de level", (m) => `<input type="number" class="meta-input" data-i="${m.i}" value="${m.meta || ""}" min="${m.atual.level + 1}"
      max="5000" step="1" placeholder="—" aria-label="Meta de level de ${esc(m.atual.nome)}" title="Clique para editar a meta">`],
  ["Dias para a meta", (m) => !m.calc ? `<span class="muted">${m.meta ? "meta atingida" : "—"}</span>`
    : isFinite(m.calc.diasNoRitmo)
      ? `<span title="Previsão: ${dataBR(m.calc.dataEstimada)}">${num(Math.ceil(m.calc.diasNoRitmo))}</span>` : "—"],
];

// Valores inteiros nas tabelas, como na planilha antiga.
const valor = (v) => num(Math.round(v));
const fmtPct2 = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct2 = (v) => fmtPct2.format(v);

function tabelaComparativa(membros) {
  return `<table class="tabela-comparativa">
    <thead><tr><th></th>${membros.map((m) =>
      `<th class="num"><span class="ponto-serie" style="--cor:${corSerie(m.i)}"></span>${linkJogador(m.atual.nome)}
        <div class="sub-cab">${vocHTML(m.atual.voc)}</div></th>`).join("")}</tr></thead>
    <tbody>${LINHAS_COMPARATIVO.map(([rotulo, celula]) => `<tr><th scope="row">${rotulo}</th>${membros.map((m) =>
      `<td class="num">${celula(m)}</td>`).join("")}</tr>`).join("")}
    </tbody></table>`;
}

// Linhas de 50 em 50 levels: para cada personagem, mostra se o level já foi atingido,
// se é alcançável até o fim do ano no ritmo dos últimos 30 dias, ou se não é.
const PASSO_LEVEL = 50;
const LINHAS_ALEM = 4;  // faixas extras depois da primeira que nem o mais rápido alcança
const MAX_LINHAS = 40;

function tabelaPorLevel(membros, prazo) {
  if (prazo.dias <= 0) return `<p class="muted">Sem dias restantes até ${dataBR(prazo.fim)}.</p>`;

  for (const m of membros) {
    m.ritmo = Math.max(0, m.atual.xp_30 / 30);
    m.previsto = levelDaXp(m.atual.xp + m.ritmo * prazo.dias);
  }
  // Da primeira linha ainda não atingida pelo menor level até a primeira que nem o mais rápido
  // alcança, mais LINHAS_ALEM faixas para mostrar o quanto falta além disso.
  const primeiro = Math.floor(Math.min(...membros.map((m) => m.atual.level)) / PASSO_LEVEL) * PASSO_LEVEL + PASSO_LEVEL;
  const ultimo = Math.max(...membros.map((m) => Math.floor(m.previsto / PASSO_LEVEL) * PASSO_LEVEL + PASSO_LEVEL))
    + LINHAS_ALEM * PASSO_LEVEL;
  const niveis = [];
  for (let L = primeiro; L <= ultimo && niveis.length < MAX_LINHAS; L += PASSO_LEVEL) niveis.push(L);

  const celula = (m, L) => {
    if (m.atual.level >= L) return `<td class="nv nv-ok" title="Já atingiu o level ${L}">✓ atingido</td>`;
    // Arredonda para cima: é o mínimo por dia para chegar lá (igual à planilha antiga).
    const porDia = Math.ceil((xpDoLevel(L) - m.atual.xp) / prazo.dias);
    const atinge = porDia <= m.ritmo;
    return `<td class="nv ${atinge ? "nv-sim" : "nv-nao"}"
      title="${atinge ? "Atinge" : "Não atinge"} no ritmo atual: precisa de ${num(Math.round(porDia))} XP/dia (faz ${num(Math.round(m.ritmo))})">${num(porDia)}</td>`;
  };

  return `<table class="tabela-nv">
    <thead><tr><th class="num">Level</th>${membros.map((m) =>
      `<th class="num">${esc(m.atual.nome)}<br><span class="muted">ritmo ${num(Math.round(m.ritmo))}/dia</span></th>`).join("")}</tr></thead>
    <tbody>${niveis.map((L) => `<tr><td class="num"><strong>${L}</strong></td>${membros.map((m) => celula(m, L)).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr><th class="num">Previsto em ${dataCurta(prazo.fim)}</th>${membros.map((m) =>
      `<td class="num nv-previsto" title="Level estimado em ${dataBR(prazo.fim)} mantendo a média dos últimos 30 dias">${m.previsto}</td>`).join("")}</tr></tfoot>
  </table>`;
}
