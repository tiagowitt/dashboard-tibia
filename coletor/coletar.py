"""Coleta diária: highscore de XP (top 1000), kill statistics e membros das guilds.

Uso:
    python -m coletor.coletar                       # coleta tudo e grava em dados/
    python -m coletor.coletar --somente ranking     # só um conjunto
    python -m coletor.coletar --pasta-dados C:\\tmp  # grava em outra pasta (testes)

Cada conjunto é coletado e gravado de forma independente: se um falhar, os outros
continuam sendo salvos, e o script termina com código 1 para o workflow acusar o erro.
"""

import argparse
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from coletor.api import ClienteAPI, ErroAPI
from coletor.armazenamento import gravar_mensal
from coletor.config import PASTA_DADOS, carregar_config, hoje_brasilia


def coletar_ranking(api: ClienteAPI, cfg: dict, data_extracao: date) -> pd.DataFrame:
    mundo = cfg["coleta"]["mundo"]
    total_paginas = cfg["coleta"]["paginas_highscore"]
    linhas = []
    for pagina in range(1, total_paginas + 1):
        hs = api.highscore_pagina(mundo, pagina)
        linhas.extend(hs["highscore_list"] or [])
        print(f"  highscore página {pagina}/{total_paginas}: {len(linhas)} linhas", flush=True)

    df = pd.DataFrame(linhas)
    esperado = total_paginas * 50
    if len(df) < esperado:
        raise ErroAPI(f"highscore incompleto: {len(df)} de {esperado} linhas")

    # Se o highscore mudar no meio da coleta, um nome pode aparecer em duas páginas.
    df = df.sort_values("rank").drop_duplicates("name", keep="first")
    df["extraction_date"] = data_extracao
    return df[["extraction_date", "rank", "name", "vocation", "level", "value"]]


def coletar_kills(api: ClienteAPI, cfg: dict, data_extracao: date) -> pd.DataFrame:
    ks = api.kill_statistics(cfg["coleta"]["mundo"])
    df = pd.DataFrame(ks["entries"])
    if df.empty:
        raise ErroAPI("kill statistics vazio")
    df["extraction_date"] = data_extracao
    print(f"  kill statistics: {len(df)} criaturas", flush=True)
    return df[["extraction_date", "race", "last_day_killed", "last_day_players_killed",
               "last_week_killed", "last_week_players_killed"]]


def coletar_guilds(api: ClienteAPI, cfg: dict, data_extracao: date) -> pd.DataFrame:
    partes = []
    for nome in cfg["coleta"]["guilds"]:
        guild = api.guild(nome)
        membros = pd.DataFrame(guild["members"] or [])
        if membros.empty:
            raise ErroAPI(f"guild '{nome}' sem membros (nome errado ou guild desfeita?)")
        membros = membros.rename(columns={"name": "character_name", "joined": "joined_date"})
        membros["guild_name"] = guild["name"]
        partes.append(membros)
        print(f"  guild {guild['name']}: {len(membros)} membros", flush=True)

    df = pd.concat(partes, ignore_index=True)
    df["extraction_date"] = data_extracao
    return df[["extraction_date", "guild_name", "rank", "character_name", "vocation",
               "level", "joined_date", "status"]]


COLETORES = {
    "ranking": coletar_ranking,
    "kills": coletar_kills,
    "guild": coletar_guilds,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--somente", choices=COLETORES, action="append",
                        help="coletar só este conjunto (pode repetir)")
    parser.add_argument("--pasta-dados", type=Path, default=PASTA_DADOS)
    args = parser.parse_args()

    cfg = carregar_config()
    api = ClienteAPI(
        user_agent=cfg["coleta"]["user_agent"],
        timeout=cfg["coleta"]["timeout_segundos"],
        tentativas=cfg["coleta"]["tentativas"],
    )
    data_extracao = hoje_brasilia()
    print(f"Coleta de {data_extracao} (mundo {cfg['coleta']['mundo']})", flush=True)

    falhas = []
    for conjunto in args.somente or COLETORES:
        print(f"[{conjunto}]", flush=True)
        try:
            df = COLETORES[conjunto](api, cfg, data_extracao)
            for arquivo in gravar_mensal(df, conjunto, args.pasta_dados):
                print(f"  gravado: {arquivo}", flush=True)
        except (ErroAPI, KeyError) as e:
            print(f"  ERRO: {e}", file=sys.stderr, flush=True)
            falhas.append(conjunto)

    if falhas:
        print(f"Falharam: {', '.join(falhas)}", file=sys.stderr)
        return 1
    print("Coleta concluída.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
