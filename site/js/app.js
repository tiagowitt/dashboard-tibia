// Navegação entre telas (por #hash), seletor de mundo, tema e cabeçalho.
import * as dados from "./dados.js";
import { destruirTodos } from "./graficos.js";
import { contexto, dataBR, esc } from "./util.js";
import { telaRanking } from "./telas/ranking.js";
import { telaJogador } from "./telas/jogador.js";
import { telaPT } from "./telas/pt.js";
import { telaGuild } from "./telas/guild.js";

const TELAS = { ranking: telaRanking, jogador: telaJogador, pt: telaPT, guild: telaGuild };
const conteudo = document.getElementById("conteudo");
const seletorMundo = document.getElementById("sel-mundo");
let rotaAtual = "";
let listaMundos = [];

async function navegar() {
  const hash = decodeURIComponent(location.hash.slice(1)) || "ranking";
  const [nome, ...resto] = hash.split("/");
  const tela = TELAS[nome] ? nome : "ranking";
  rotaAtual = `${contexto.mundo}|${hash}`;
  const rota = rotaAtual;

  document.querySelectorAll(".abas a").forEach((a) => {
    if (a.dataset.tela === tela) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  destruirTodos();
  const info = listaMundos.find((m) => m.nome === contexto.mundo);
  if (info && !info.data_ref) {
    conteudo.innerHTML = `<div class="aviso">A coleta de ${esc(contexto.mundo)} ainda não tem dados. Eles aparecem depois da próxima coleta diária (06:30).</div>`;
    return;
  }
  conteudo.innerHTML = `<div class="carregando" aria-label="Carregando"><span></span><span></span><span></span></div>`;
  try {
    const r = await dados.resumo();
    if (rotaAtual !== rota) return;  // o usuário já trocou de tela ou de mundo
    await TELAS[tela](conteudo, r, resto.join("/"));
    avisoHistoricoCurto(r);
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="aviso">Não foi possível carregar os dados: ${esc(e.message)}</div>`;
  }
}

// Mundo recém-adicionado: a XP do dia só existe a partir do 2º dia, e 7/30 dias levam semanas.
function avisoHistoricoCurto(r) {
  if (r.datas.length >= 30) return;
  const texto = r.datas.length < 2
    ? `O histórico de ${esc(r.mundo)} começou em ${dataBR(r.datas[0])}: a XP ganha aparece a partir da próxima coleta.`
    : `O histórico de ${esc(r.mundo)} começou em ${dataBR(r.datas[0])} (${r.datas.length} dias): a XP de 7 e 30 dias ainda está incompleta.`;
  const aviso = `<div class="aviso">${texto}</div>`;
  const titulo = conteudo.querySelector(".titulo-tela, .perfil");
  if (titulo) titulo.insertAdjacentHTML("afterend", aviso);
  else conteudo.insertAdjacentHTML("afterbegin", aviso);
}

async function cabecalho() {
  const info = document.getElementById("info-data");
  document.getElementById("rodape-mundo").textContent = contexto.mundo;
  try {
    const r = await dados.resumo();
    info.textContent = `Dados de ${dataBR(r.data_ref)}`;
    info.title = `${r.mundo} · dia de referência ${dataBR(r.data_ref)}`;
    const gerado = new Date(r.gerado_em);
    document.getElementById("rodape-gerado").textContent =
      `Gerado em ${gerado.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  } catch {
    info.textContent = "sem dados ainda";
    document.getElementById("rodape-gerado").textContent = "";
  }
}

function escolherMundo(nome) {
  contexto.mundo = nome;
  seletorMundo.value = nome;
  document.title = `${nome} XP`;
  try { localStorage.setItem("mundo", nome); } catch {}
}

async function iniciar() {
  try {
    listaMundos = (await dados.mundos()).mundos;
  } catch {
    listaMundos = [{ nome: "Collabra", data_ref: true }];  // site antigo, sem mundos.json
  }
  contexto.mundoPadrao = listaMundos[0].nome;
  seletorMundo.innerHTML = listaMundos.map((m) => `<option value="${esc(m.nome)}">${esc(m.nome)}</option>`).join("");
  let salvo = null;
  try { salvo = localStorage.getItem("mundo"); } catch {}
  escolherMundo(listaMundos.some((m) => m.nome === salvo) ? salvo : contexto.mundoPadrao);

  seletorMundo.addEventListener("change", () => {
    escolherMundo(seletorMundo.value);
    cabecalho();
    navegar();
  });
  cabecalho();
  // Os gráficos (canvas) usam a fonte disponível no momento do desenho: espera a Inter carregar.
  await Promise.race([document.fonts?.ready, new Promise((ok) => setTimeout(ok, 1500))]);
  navegar();
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
iniciar();
