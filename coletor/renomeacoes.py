"""Detecção de troca de nick: liga o histórico do nome antigo ao nome novo.

Cada nome que aparece pela primeira vez no top 1000 é pesquisado na API. Se o personagem
tem nomes anteriores (former_names) que já existem no nosso histórico do mesmo mundo, foi uma
troca de nick. A API é a fonte da verdade: não há chute por level ou XP.

Registro: dados/<mundo>/renomeacoes.csv com as colunas data, antigo, novo.

Uso:
    python -m coletor.renomeacoes                          # confere todo o histórico (uso único)
    python -m coletor.renomeacoes --mundo Collabra --desde 2026-08-01
A coleta diária chama `detectar_do_dia` para os nomes novos do dia.
"""

import argparse
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from coletor.api import ClienteAPI, ErroAPI
from coletor.armazenamento import ler_conjunto
from coletor.config import PASTA_DADOS, carregar_config

ARQUIVO = "renomeacoes.csv"
COLUNAS = ["data", "antigo", "novo"]


def ler(pasta_mundo: Path) -> pd.DataFrame:
    arquivo = Path(pasta_mundo) / ARQUIVO
    if not arquivo.exists():
        return pd.DataFrame(columns=COLUNAS)
    return pd.read_csv(arquivo, dtype=str)


def gravar(pasta_mundo: Path, novos: list[dict]) -> int:
    """Acrescenta as trocas novas ao CSV do mundo. Retorna quantas eram inéditas."""
    if not novos:
        return 0
    antes = ler(pasta_mundo)
    tudo = pd.concat([antes, pd.DataFrame(novos, columns=COLUNAS)], ignore_index=True)
    tudo = tudo.drop_duplicates(["antigo", "novo"], keep="first").sort_values(["data", "antigo"])
    Path(pasta_mundo).mkdir(parents=True, exist_ok=True)
    tudo.to_csv(Path(pasta_mundo) / ARQUIVO, index=False, encoding="utf-8")
    return len(tudo) - len(antes)


def mapa_final(renomeacoes: pd.DataFrame) -> dict[str, str]:
    """{nome antigo: nome atual}, resolvendo cadeias (A → B → C vira A → C e B → C)."""
    direto = dict(zip(renomeacoes["antigo"], renomeacoes["novo"]))
    final = {}
    for antigo in direto:
        atual, vistos = antigo, set()
        while atual in direto and atual not in vistos:  # `vistos` evita laço se o CSV tiver ciclo
            vistos.add(atual)
            atual = direto[atual]
        if atual != antigo:
            final[antigo] = atual
    return final


def conferir_nomes(api: ClienteAPI, mundo: str, nomes: dict[str, date], historico: set[str]) -> list[dict]:
    """Pesquisa cada nome {nome: data da 1ª aparição} e devolve as trocas de nick encontradas."""
    trocas = []
    for i, (nome, data) in enumerate(sorted(nomes.items(), key=lambda x: x[1]), 1):
        try:
            p = api.personagem(nome)
        except ErroAPI as e:
            print(f"  aviso: não consegui pesquisar '{nome}': {e}", file=sys.stderr, flush=True)
            continue
        if i % 50 == 0:
            print(f"  {i}/{len(nomes)} nomes pesquisados...", flush=True)
        if not p or p.get("world") != mundo:
            continue  # nome sumiu, ou o personagem mudou de mundo
        atual = p["name"]
        for antigo in p.get("former_names") or []:
            if antigo != atual and antigo in historico:
                trocas.append({"data": str(data), "antigo": antigo, "novo": atual})
                print(f"  troca de nick: {antigo} -> {atual} (1ª aparição de {nome} em {data})", flush=True)
    return trocas


def primeiras_aparicoes(ranking: pd.DataFrame) -> pd.Series:
    """Data da primeira aparição de cada nome no histórico do mundo."""
    return ranking.groupby("name")["extraction_date"].min()


def detectar_do_dia(api: ClienteAPI, mundo: str, pasta_mundo: Path, data_extracao: date) -> int:
    """Confere os nomes que apareceram pela primeira vez na coleta de `data_extracao`."""
    ranking = ler_conjunto("ranking", pasta_mundo)
    if ranking.empty or ranking["extraction_date"].min() == data_extracao:
        return 0  # primeiro dia do mundo: todo mundo é "novo", não há com o que ligar
    primeira = primeiras_aparicoes(ranking)
    novos = {n: d for n, d in primeira.items() if d == data_extracao}
    historico = set(ranking.loc[ranking["extraction_date"] < data_extracao, "name"])
    print(f"  {mundo}: {len(novos)} nomes novos no top hoje; conferindo trocas de nick", flush=True)
    return gravar(pasta_mundo, conferir_nomes(api, mundo, novos, historico))


def main() -> int:
    cfg = carregar_config()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mundo", choices=[m["nome"] for m in cfg["mundos"]], action="append")
    parser.add_argument("--desde", type=date.fromisoformat, help="só nomes que apareceram a partir desta data")
    parser.add_argument("--pasta-dados", type=Path, default=PASTA_DADOS)
    args = parser.parse_args()

    api = ClienteAPI(user_agent=cfg["coleta"]["user_agent"], timeout=cfg["coleta"]["timeout_segundos"],
                     tentativas=cfg["coleta"]["tentativas"])
    for mundo in cfg["mundos"]:
        if args.mundo and mundo["nome"] not in args.mundo:
            continue
        pasta = args.pasta_dados / mundo["nome"]
        ranking = ler_conjunto("ranking", pasta)
        if ranking.empty:
            continue
        inicio = ranking["extraction_date"].min()
        primeira = primeiras_aparicoes(ranking)
        # Quem aparece já no primeiro dia de dados não tem histórico anterior para ligar.
        novos = {n: d for n, d in primeira.items() if d > inicio and (not args.desde or d >= args.desde)}
        historico = set(ranking["name"])
        print(f"{mundo['nome']}: pesquisando {len(novos)} nomes novos no histórico...", flush=True)
        n = gravar(pasta, conferir_nomes(api, mundo["nome"], novos, historico))
        print(f"{mundo['nome']}: {n} trocas de nick novas registradas em {pasta / ARQUIVO}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
