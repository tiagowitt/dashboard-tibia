"""Gera os JSON que o dashboard consome, a partir dos Parquet em dados/.

Uso:
    python -m coletor.agregados                    # lê dados/ e grava em site/dados/
    python -m coletor.agregados --saida C:\\tmp     # grava em outra pasta (testes)

Arquivos gerados:
    resumo.json              datas disponíveis, PT padrão, guild de cada membro, médias por faixa
    historico/AAAA-MM.json   uma linha por jogador e dia de referência (telas Ranking, Jogador e PT)
    guild.json               membros por dia, composição, entradas e saídas
    kills.json               criaturas mais mortas, quem mais matou jogadores, bosses mortos

Regras (validadas contra a planilha antiga):
    - dia de referência = data da extração − 1 dia;
    - XP do dia = XP total − XP total da aparição anterior do mesmo nome;
    - mais de N dias ausente do top 1000 (config: regras.dias_troca_de_dono) = nova sessão,
      com XP 0 na primeira aparição; ausências menores acumulam no dia de retorno;
    - XP 7/30 dias = soma da XP do dia nos últimos 7/30 dias de calendário, na mesma sessão;
    - variação de rank = rank anterior − rank atual (positivo = subiu).
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from coletor.armazenamento import ler_conjunto
from coletor.config import PASTA_DADOS, PASTA_SITE_DADOS, carregar_config

SIGLAS_VOCACAO = {
    "Elite Knight": "EK", "Knight": "EK",
    "Royal Paladin": "RP", "Paladin": "RP",
    "Elder Druid": "ED", "Druid": "ED",
    "Master Sorcerer": "MS", "Sorcerer": "MS",
    "Exalted Monk": "EM", "Monk": "EM",
}

COLUNAS_HISTORICO = ["data", "rank", "nome", "voc", "level", "xp", "xp_dia", "xp_7",
                     "xp_30", "lv_30", "var_rank"]


# --- Regras de negócio ---

def faixas_de_level(cfg: dict) -> list[str]:
    f = cfg["regras"]["faixas"]
    faixas = [f"2 - {f['primeira_ate']}"]
    for inicio in range(f["primeira_ate"] + 1, f["ultima_a_partir"], f["passo"]):
        faixas.append(f"{inicio} - {inicio + f['passo'] - 1}")
    return faixas + [f"{f['ultima_a_partir']}+"]


def faixa_do_level(level: int, cfg: dict) -> str:
    f = cfg["regras"]["faixas"]
    if level <= f["primeira_ate"]:
        return f"2 - {f['primeira_ate']}"
    if level >= f["ultima_a_partir"]:
        return f"{f['ultima_a_partir']}+"
    inicio = f["primeira_ate"] + 1 + (level - f["primeira_ate"] - 1) // f["passo"] * f["passo"]
    return f"{inicio} - {inicio + f['passo'] - 1}"


def calcular_historico(ranking: pd.DataFrame, dias_troca_de_dono: int) -> pd.DataFrame:
    """Uma linha por nome e dia de referência, com XP dia/7/30, levels em 30 dias e variação de rank."""
    df = ranking.copy()
    df["extraction_date"] = pd.to_datetime(df["extraction_date"])
    df["data_ref"] = df["extraction_date"] - pd.Timedelta(days=1)
    df = df.sort_values(["name", "extraction_date"]).reset_index(drop=True)

    anterior = df.groupby("name")[["extraction_date", "value", "rank", "level"]].shift()
    dias_ausente = (df["extraction_date"] - anterior["extraction_date"]).dt.days - 1
    nova_sessao = anterior["extraction_date"].isna() | (dias_ausente > dias_troca_de_dono)

    df["sessao"] = nova_sessao.astype(int).groupby(df["name"]).cumsum()
    df["xp_dia"] = (df["value"] - anterior["value"]).where(~nova_sessao, 0).astype("int64")
    df["lv_dia"] = (df["level"] - anterior["level"]).where(~nova_sessao, 0).astype("int64")
    df["var_rank"] = (anterior["rank"] - df["rank"]).where(~nova_sessao).astype("Int64")

    # Janelas de calendário (7D = D-6 até D) dentro de cada sessão do mesmo nome.
    # O resultado do rolling vem na ordem dos grupos, que é a mesma do df (ordenado por
    # nome e data, e a sessão só cresce com a data), então dá para atribuir pela posição.
    grupos = df.groupby(["name", "sessao"], sort=False)
    for dias, colunas in ((7, {"xp_dia": "xp_7"}), (30, {"xp_dia": "xp_30", "lv_dia": "lv_30"})):
        janela = grupos.rolling(f"{dias}D", on="data_ref")[list(colunas)].sum()
        for origem, destino in colunas.items():
            df[destino] = janela[origem].to_numpy().round().astype("int64")

    df["voc"] = df["vocation"].map(SIGLAS_VOCACAO).fillna("-")
    return df.rename(columns={"name": "nome", "value": "xp"})


def medias_por_faixa(hist_dia: pd.DataFrame, membros: pd.DataFrame, cfg: dict) -> dict:
    """Média da XP 30 dias por faixa, só com membros que estão no top 1000 no último dia."""
    base = hist_dia.merge(membros[["character_name", "guild_name"]],
                          left_on="nome", right_on="character_name")
    base["faixa"] = base["level"].map(lambda l: faixa_do_level(l, cfg))
    resultado = {}
    for guild, grupo in [*base.groupby("guild_name"), ("Todas", base)]:
        stats = grupo.groupby("faixa")["xp_30"].agg(["mean", "count"])
        resultado[guild] = {faixa: {"media": round(linha["mean"]), "n": int(linha["count"])}
                            for faixa, linha in stats.iterrows()}
    return resultado


# --- Geração dos arquivos ---

def _linhas(df: pd.DataFrame, colunas: list[str]) -> list[list]:
    """Converte para listas JSON (datas em ISO, nulos do pandas viram None)."""
    saida = df[colunas].astype(object).where(df[colunas].notna(), None)
    for col in colunas:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            saida[col] = df[col].dt.strftime("%Y-%m-%d")
    return saida.values.tolist()


def _gravar_json(dados: dict, caminho: Path) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))


def gerar_historico(hist: pd.DataFrame, saida: Path) -> list[str]:
    hist = hist.rename(columns={"data_ref": "data"})
    meses = hist["data"].dt.strftime("%Y-%m")
    for mes, grupo in hist.groupby(meses):
        grupo = grupo.sort_values(["data", "rank"])
        _gravar_json({"colunas": COLUNAS_HISTORICO, "linhas": _linhas(grupo, COLUNAS_HISTORICO)},
                     saida / "historico" / f"{mes}.json")
    return sorted(meses.unique())


def gerar_guild(guild: pd.DataFrame, hist_dia: pd.DataFrame, cfg: dict) -> tuple[dict, pd.DataFrame]:
    guild = guild.copy()
    guild["extraction_date"] = pd.to_datetime(guild["extraction_date"])
    guild["joined_date"] = pd.to_datetime(guild["joined_date"])
    guild["voc"] = guild["vocation"].map(SIGLAS_VOCACAO).fillna("-")
    ultima = guild["extraction_date"].max()
    atuais = guild[guild["extraction_date"] == ultima].copy()
    atuais["faixa"] = atuais["level"].map(lambda l: faixa_do_level(l, cfg))

    # Membros atuais, com a XP 30 dias de quem está no top 1000.
    no_top = hist_dia[["nome", "xp_30", "rank"]].rename(
        columns={"nome": "character_name", "rank": "rank_hs"})
    membros = atuais.merge(no_top, how="left", on="character_name").rename(columns={
        "guild_name": "guild", "character_name": "nome", "rank": "cargo",
        "rank_hs": "rank", "joined_date": "entrou"})
    membros["xp_30"] = membros["xp_30"].astype("Int64")
    membros["rank"] = membros["rank"].astype("Int64")

    inicio_30 = ultima - pd.Timedelta(days=29)
    entradas = atuais[atuais["joined_date"] >= inicio_30].sort_values("joined_date", ascending=False)

    # Saídas: estava na guild em algum dia da janela e não está no último dia.
    janela = guild[guild["extraction_date"] >= inicio_30]
    visto_por_ultimo = (janela.sort_values("extraction_date")
                              .groupby(["guild_name", "character_name"]).tail(1))
    chave_atual = set(zip(atuais["guild_name"], atuais["character_name"]))
    saidas = visto_por_ultimo[[(g, n) not in chave_atual for g, n in
                               zip(visto_por_ultimo["guild_name"], visto_por_ultimo["character_name"])]]
    saidas = saidas.sort_values("extraction_date", ascending=False)

    por_dia = guild.groupby(["extraction_date", "guild_name"]).size().reset_index(name="n")
    composicao = atuais.groupby(["guild_name", "faixa", "voc"]).size().reset_index(name="n")

    dados = {
        "data": ultima.strftime("%Y-%m-%d"),
        "inicio_historico": guild["extraction_date"].min().strftime("%Y-%m-%d"),
        "membros": {
            "colunas": ["guild", "nome", "cargo", "voc", "level", "faixa", "entrou", "xp_30", "rank"],
            "linhas": _linhas(membros, ["guild", "nome", "cargo", "voc", "level", "faixa", "entrou",
                                        "xp_30", "rank"]),
        },
        "membros_por_dia": {"colunas": ["data", "guild", "n"],
                            "linhas": _linhas(por_dia, ["extraction_date", "guild_name", "n"])},
        "composicao": {"colunas": ["guild", "faixa", "voc", "n"],
                       "linhas": _linhas(composicao, ["guild_name", "faixa", "voc", "n"])},
        "entradas_30": {"colunas": ["guild", "nome", "voc", "level", "data"],
                        "linhas": _linhas(entradas, ["guild_name", "character_name", "voc", "level",
                                                     "joined_date"])},
        "saidas_30": {"colunas": ["guild", "nome", "voc", "level", "visto_por_ultimo"],
                      "linhas": _linhas(saidas.assign(voc=saidas["vocation"].map(SIGLAS_VOCACAO)),
                                        ["guild_name", "character_name", "voc", "level",
                                         "extraction_date"])},
    }
    return dados, atuais


def gerar_kills(kills: pd.DataFrame, bosses: dict) -> dict:
    k = kills.copy()
    k["data"] = pd.to_datetime(k["extraction_date"]) - pd.Timedelta(days=1)
    ultima = k["data"].max()

    def top(coluna: str, dias: int, n: int) -> list:
        janela = k[k["data"] > ultima - pd.Timedelta(days=dias)]
        soma = janela.groupby("race")[coluna].sum()
        soma = soma[soma > 0].sort_values(ascending=False).head(n)
        return [[raca, int(v)] for raca, v in soma.items()]

    tipo_boss = {nome.lower(): tipo for nome, tipo in bosses.items()}
    k["tipo_boss"] = k["race"].str.lower().map(tipo_boss)
    mortos = k[k["tipo_boss"].notna() & (k["last_day_killed"] > 0)]

    def bosses_no_periodo(dias: int) -> list:
        janela = mortos[mortos["data"] > ultima - pd.Timedelta(days=dias)]
        soma = (janela.groupby(["race", "tipo_boss"])["last_day_killed"].sum()
                      .reset_index().sort_values(["tipo_boss", "last_day_killed"],
                                                 ascending=[True, False]))
        return _linhas(soma, ["race", "tipo_boss", "last_day_killed"])

    # Archfoe e Bane morrem centenas de vezes por dia: só totais por período.
    # Nemesis é raro, então guarda o histórico completo (dia a dia).
    nemesis = mortos[mortos["tipo_boss"] == "Nemesis"].sort_values(["data", "race"], ascending=[False, True])

    return {
        "data": ultima.strftime("%Y-%m-%d"),
        "criaturas": {str(d): top("last_day_killed", d, 50) for d in (1, 7, 30)},
        "matadores": {str(d): top("last_day_players_killed", d, 30) for d in (1, 7, 30)},
        "bosses": {"colunas": ["boss", "tipo", "mortes"],
                   "periodos": {str(d): bosses_no_periodo(d) for d in (1, 7, 30)}},
        "nemesis_historico": {"colunas": ["data", "boss", "mortes"],
                              "linhas": _linhas(nemesis, ["data", "race", "last_day_killed"])},
    }


def gerar_tudo(pasta_dados: Path, saida: Path, cfg: dict) -> None:
    hist = calcular_historico(ler_conjunto("ranking", pasta_dados),
                              cfg["regras"]["dias_troca_de_dono"])
    meses = gerar_historico(hist, saida)
    ultima = hist["data_ref"].max()
    hist_dia = hist[hist["data_ref"] == ultima]
    print(f"  historico: {len(hist)} linhas em {len(meses)} meses (último dia {ultima:%Y-%m-%d})")

    guild = ler_conjunto("guild", pasta_dados)
    dados_guild, atuais = gerar_guild(guild, hist_dia, cfg)
    _gravar_json(dados_guild, saida / "guild.json")
    print(f"  guild: {len(atuais)} membros em {dados_guild['data']}")

    bosses_json = pasta_dados / "bosses.json"
    bosses = json.loads(bosses_json.read_text(encoding="utf-8")) if bosses_json.exists() else {}
    dados_kills = gerar_kills(ler_conjunto("kills", pasta_dados), bosses)
    _gravar_json(dados_kills, saida / "kills.json")
    print(f"  kills: {len(dados_kills['nemesis_historico']['linhas'])} registros de Nemesis mortos")

    _gravar_json({
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mundo": cfg["coleta"]["mundo"],
        "guilds": cfg["coleta"]["guilds"],
        "data_ref": ultima.strftime("%Y-%m-%d"),
        "datas": sorted(hist["data_ref"].dt.strftime("%Y-%m-%d").unique().tolist()),
        "meses": meses,
        "faixas": faixas_de_level(cfg),
        "pt_padrao": cfg["pt_padrao"],
        "data_meta_anual": cfg["regras"]["data_meta_anual"],
        "guild_de": dict(zip(atuais["character_name"], atuais["guild_name"])),
        "medias_faixa": medias_por_faixa(hist_dia, atuais, cfg),
    }, saida / "resumo.json")
    print("  resumo.json gravado")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pasta-dados", type=Path, default=PASTA_DADOS)
    parser.add_argument("--saida", type=Path, default=PASTA_SITE_DADOS)
    args = parser.parse_args()
    print("Gerando agregados...", flush=True)
    gerar_tudo(args.pasta_dados, args.saida, carregar_config())
    print("Agregados concluídos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
