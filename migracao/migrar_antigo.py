"""Migração única: Parquet diários do repositório antigo → Parquet mensais do projeto novo.

Antes de rodar, baixe só a pasta do Collabra do repositório antigo:
    git clone --depth 1 --filter=blob:none --sparse https://github.com/tiagowitt/tibia-dados-dashboard migracao/entrada/antigo
    cd migracao/entrada/antigo
    git sparse-checkout set dados/ranking/Collabra dados/kill_statistics/Collabra

Uso:
    python -m migracao.migrar_antigo            # grava em dados/
    python -m migracao.migrar_antigo --forcar   # permite mesclar com dados/ já existente

O histórico de guild (export do BigQuery) fica para outro script.
"""

import argparse
import shutil
import sys
from pathlib import Path

import pandas as pd

from coletor.armazenamento import gravar_mensal
from coletor.config import PASTA_DADOS, RAIZ

ORIGEM_PADRAO = RAIZ / "migracao" / "entrada" / "antigo" / "dados"

COLUNAS = {
    "ranking": ["extraction_date", "rank", "name", "vocation", "level", "value"],
    "kills": ["extraction_date", "race", "last_day_killed", "last_day_players_killed",
              "last_week_killed", "last_week_players_killed"],
}
PASTAS_ORIGEM = {
    "ranking": "ranking/Collabra",          # highscores_* (até 23/01/2026) e ranking_*
    "kills": "kill_statistics/Collabra",    # killstatistics_* e kill_statistics_*
}


def ler_antigos(pasta: Path) -> pd.DataFrame:
    arquivos = sorted(pasta.glob("*.parquet"))
    if not arquivos:
        raise SystemExit(f"Nenhum Parquet em {pasta}. Fez o clone? (veja o topo deste script)")
    df = pd.concat((pd.read_parquet(a) for a in arquivos), ignore_index=True)
    print(f"  {len(arquivos)} arquivos, {len(df)} linhas", flush=True)
    return df


def preparar_ranking(df: pd.DataFrame) -> pd.DataFrame:
    # 11/05 e 14/05/2026 têm nomes repetidos no mesmo dia: fica a linha de maior XP.
    antes = len(df)
    df = (df.sort_values("value", ascending=False)
            .drop_duplicates(["extraction_date", "name"], keep="first"))
    print(f"  duplicatas removidas (mesmo nome e data, mantida a maior XP): {antes - len(df)}")
    return df[COLUNAS["ranking"]]


def preparar_kills(df: pd.DataFrame) -> pd.DataFrame:
    antes = len(df)
    df = df.drop_duplicates(["extraction_date", "race"], keep="last")
    print(f"  duplicatas removidas: {antes - len(df)}")
    return df[COLUNAS["kills"]]


PREPARAR = {"ranking": preparar_ranking, "kills": preparar_kills}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--origem", type=Path, default=ORIGEM_PADRAO)
    parser.add_argument("--pasta-dados", type=Path, default=PASTA_DADOS)
    parser.add_argument("--forcar", action="store_true",
                        help="mesclar mesmo se já houver Parquet no destino "
                             "(em chave repetida, o dado antigo substitui o existente)")
    args = parser.parse_args()

    for conjunto in PREPARAR:
        if any((args.pasta_dados / conjunto).glob("*.parquet")) and not args.forcar:
            print(f"Já existem dados em {args.pasta_dados / conjunto}. Use --forcar para mesclar.",
                  file=sys.stderr)
            return 1

    for conjunto, preparar in PREPARAR.items():
        print(f"[{conjunto}]", flush=True)
        df = preparar(ler_antigos(args.origem / PASTAS_ORIGEM[conjunto]))
        arquivos = gravar_mensal(df, conjunto, args.pasta_dados)
        print(f"  {len(df)} linhas em {len(arquivos)} arquivos mensais", flush=True)

    bosses = args.origem / "bosses.json"
    if bosses.exists():
        shutil.copy2(bosses, args.pasta_dados / "bosses.json")
        print("[bosses] bosses.json copiado")
    else:
        print("[bosses] AVISO: bosses.json não encontrado na origem", file=sys.stderr)

    print("Migração concluída.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
