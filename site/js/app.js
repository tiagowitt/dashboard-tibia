// Navegação entre telas (por #hash), tema e cabeçalho.
import * as dados from "./dados.js";
import { destruirTodos } from "./graficos.js";
import { dataBR, esc } from "./util.js";
import { telaRanking } from "./telas/ranking.js";
import { telaJogador } from "./telas/jogador.js";
import { telaPT } from "./telas/pt.js";
import { telaGuild } from "./telas/guild.js";

const TELAS = { ranking: telaRanking, jogador: telaJogador, pt: telaPT, guild: telaGuild };
const conteudo = document.getElementById("conteudo");
let rotaAtual = "";

async function navegar() {
  const hash = decodeURIComponent(location.hash.slice(1)) || "ranking";
  const [nome, ...resto] = hash.split("/");
  const tela = TELAS[nome] ? nome : "ranking";
  rotaAtual = hash;

  document.querySelectorAll(".abas a").forEach((a) => {
    if (a.dataset.tela === tela) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  destruirTodos();
  conteudo.innerHTML = `<p class="carregando">Carregando…</p>`;
  try {
    const r = await dados.resumo();
    if (rotaAtual !== hash) return;  // o usuário já trocou de tela
    await TELAS[tela](conteudo, r, resto.join("/"));
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="aviso">Não foi possível carregar os dados: ${esc(e.message)}</div>`;
  }
}

async function cabecalho() {
  try {
    const r = await dados.resumo();
    document.getElementById("info-data").textContent =
      `${r.mundo} · dados de ${dataBR(r.data_ref)}`;
  } catch {
    document.getElementById("info-data").textContent = "dados indisponíveis";
  }
}

document.getElementById("alternar-tema").addEventListener("click", () => {
  const raiz = document.documentElement;
  const escuroAgora = getComputedStyle(raiz).colorScheme.includes("dark");
  const novo = escuroAgora ? "light" : "dark";
  raiz.dataset.theme = novo;
  try { localStorage.setItem("tema", novo); } catch {}
  navegar();  // redesenha os gráficos com as cores do novo tema
});

window.addEventListener("hashchange", navegar);
cabecalho();
navegar();
