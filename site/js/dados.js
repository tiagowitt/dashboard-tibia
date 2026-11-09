// Carregamento dos JSON gerados por coletor/agregados.py (com cache em memória).
// Cada mundo tem sua pasta (dados/<mundo>/); dados/mundos.json lista os mundos.
import { contexto } from "./util.js";

const cache = new Map();

async function buscar(caminho) {
  if (!cache.has(caminho)) {
    cache.set(caminho, fetch(`dados/${caminho}`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar ${caminho} (${r.status})`);
      return r.json();
    }));
  }
  try {
    return await cache.get(caminho);
  } catch (e) {
    cache.delete(caminho);
    throw e;
  }
}

const doMundo = (arquivo) => buscar(`${encodeURIComponent(contexto.mundo)}/${arquivo}`);

/** Converte {colunas, linhas} em lista de objetos. */
export function tabela({ colunas, linhas }) {
  return linhas.map((l) => Object.fromEntries(colunas.map((c, i) => [c, l[i]])));
}

export const mundos = () => buscar("mundos.json");
export const resumo = () => doMundo("resumo.json");
export const guild = () => doMundo("guild.json");
export const kills = () => doMundo("kills.json");

/** Linhas do histórico de um mês (AAAA-MM) do mundo atual, já como objetos. */
const meses = new Map();
export async function mes(m) {
  const chave = `${contexto.mundo}/${m}`;
  if (!meses.has(chave)) meses.set(chave, doMundo(`historico/${m}.json`).then(tabela));
  return meses.get(chave);
}

/** Linhas de vários meses, concatenadas em ordem. */
export async function variosMeses(lista) {
  const partes = await Promise.all(lista.map(mes));
  return partes.flat();
}

/** Meses (AAAA-MM) que cobrem os últimos `dias` dias até a data de referência. */
export function mesesDosUltimosDias(r, dias) {
  const fim = new Date(r.data_ref + "T00:00:00Z");
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - dias + 1);
  const ini = inicio.toISOString().slice(0, 7);
  return r.meses.filter((m) => m >= ini);
}
