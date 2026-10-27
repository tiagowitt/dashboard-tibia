"""Gravação em Parquet consolidado por mês, com deduplicação por chave."""

import os
from pathlib import Path

import pandas as pd

# Esquema de cada conjunto de dados: chave de deduplicação e ordenação.
CONJUNTOS = {
    "ranking": {
        "chave": ["extraction_date", "name"],
        "ordem": ["extraction_date", "rank"],
    },
    "kills": {
        "chave": ["extraction_date", "race"],
        "ordem": ["extraction_date", "race"],
    },
    "guild": {
        "chave": ["extraction_date", "guild_name", "character_name"],
        "ordem": ["extraction_date", "guild_name", "character_name"],
    },
}


def _normalizar_datas(df: pd.DataFrame) -> pd.DataFrame:
    """Garante colunas *_date como datetime.date (gravadas como date32 no Parquet)."""
    df = df.copy()
    for col in df.columns:
        if col.endswith("_date"):
            df[col] = pd.to_datetime(df[col]).dt.date
    return df


def gravar_mensal(df: pd.DataFrame, conjunto: str, pasta_dados: Path) -> list[Path]:
    """Mescla df nos arquivos AAAA-MM.parquet do conjunto.

    Em caso de chave repetida, a linha nova substitui a antiga (reexecutar a coleta
    no mesmo dia é seguro). Retorna os arquivos gravados.
    """
    esquema = CONJUNTOS[conjunto]
    pasta = Path(pasta_dados) / conjunto
    pasta.mkdir(parents=True, exist_ok=True)

    df = _normalizar_datas(df)
    meses = pd.to_datetime(df["extraction_date"]).dt.strftime("%Y-%m")
    gravados = []

    for mes, novos in df.groupby(meses):
        arquivo = pasta / f"{mes}.parquet"
        if arquivo.exists():
            existentes = _normalizar_datas(pd.read_parquet(arquivo))
            novos = pd.concat([existentes, novos], ignore_index=True)

        novos = (novos.drop_duplicates(subset=esquema["chave"], keep="last")
                      .sort_values(esquema["ordem"])
                      .reset_index(drop=True))

        # Grava em arquivo temporário e troca no fim: uma falha no meio não corrompe o mês.
        temporario = arquivo.with_suffix(".parquet.tmp")
        novos.to_parquet(temporario, index=False, compression="zstd")
        os.replace(temporario, arquivo)
        gravados.append(arquivo)

    return gravados


def ler_conjunto(conjunto: str, pasta_dados: Path) -> pd.DataFrame:
    """Lê todos os meses de um conjunto em um único DataFrame."""
    arquivos = sorted((Path(pasta_dados) / conjunto).glob("*.parquet"))
    if not arquivos:
        return pd.DataFrame()
    return _normalizar_datas(pd.concat((pd.read_parquet(a) for a in arquivos), ignore_index=True))
