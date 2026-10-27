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
  conteudo.innerHTML = `<div class="carregando" aria-label="Carregando"><span></span><span></span><span></span></div>`;
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
  const info = document.getElementById("info-data");
  try {
    const r = await dados.resumo();
    info.textContent = `Dados de ${dataBR(r.data_ref)}`;
    info.title = `${r.mundo} · dia de referência ${dataBR(r.data_ref)}`;
    const gerado = new Date(r.gerado_em);
    document.getElementById("rodape-gerado").textContent =
      `Gerado em ${gerado.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  } catch {
    info.textContent = "dados indisponíveis";
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

window.addEventListener("hashchange", () => { navegar(); window.scrollTo({ top: 0 }); });
cabecalho();
// Os gráficos (canvas) usam a fonte disponível no momento do desenho: espera a Inter carregar.
Promise.race([document.fonts?.ready, new Promise((ok) => setTimeout(ok, 1500))]).then(navegar);
