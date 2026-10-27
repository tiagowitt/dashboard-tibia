// Ajustes do Chart.js para o visual do projeto (marcas finas, grade discreta, tema).
import { compacto, cor, dataCurta, num } from "./util.js";

const Chart = window.Chart;
const ativos = new Set();

function base() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },  // legendas são HTML (ver legendaHTML)
      tooltip: {
        backgroundColor: cor("--superficie"),
        titleColor: cor("--texto"),
        bodyColor: cor("--texto-2"),
        borderColor: cor("--eixo"),
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          label: (c) => ` ${c.dataset.label}: ${num(Math.round(c.parsed.y ?? c.parsed.x))}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: cor("--eixo") },
        ticks: { color: cor("--texto-3"), maxRotation: 0, autoSkipPadding: 12 },
      },
      y: {
        grid: { color: cor("--grade") },
        border: { display: false },
        ticks: { color: cor("--texto-3"), callback: (v) => compacto(v) },
      },
    },
  };
}

function mesclar(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof a[k] === "object") mesclar(a[k], v);
    else a[k] = v;
  }
  return a;
}

/** Cria um gráfico no <canvas> dentro de `el`, destruindo o anterior se houver. */
export function grafico(el, tipo, data, opcoes) {
  const antigo = el._grafico;
  if (antigo) { antigo.destroy(); ativos.delete(antigo); }
  el.innerHTML = "<canvas></canvas>";
  const g = new Chart(el.querySelector("canvas"), { type: tipo, data, options: mesclar(base(), opcoes) });
  el._grafico = g;
  ativos.add(g);
  return g;
}

export function destruirTodos() {
  for (const g of ativos) g.destroy();
  ativos.clear();
}

/** Estilos de marca padronizados. */
export const linha = (label, data, corSerie, extra = {}) => ({
  type: "line", label, data, borderColor: corSerie, backgroundColor: corSerie,
  borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2,
  pointHoverBorderColor: cor("--superficie"), tension: 0.25, spanGaps: true, ...extra,
});

export const barras = (label, data, corSerie, extra = {}) => ({
  type: "bar", label, data, backgroundColor: corSerie, borderRadius: { topLeft: 4, topRight: 4 },
  borderSkipped: "start", maxBarThickness: 24, categoryPercentage: 0.85, barPercentage: 0.9, ...extra,
});

export const rotulosDatas = (datas) => datas.map(dataCurta);

/** Legenda em HTML (texto em cor de texto; a cor fica só na marca). */
export function legendaHTML(itens, quadrado = false) {
  return `<div class="legenda">${itens.map(([nome, c]) =>
    `<span class="item"><i class="${quadrado ? "quad" : ""}" style="--cor:${c}"></i>${nome}</span>`).join("")}</div>`;
}
