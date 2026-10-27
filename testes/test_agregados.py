from datetime import date, timedelta

import pandas as pd
import pytest

from coletor.agregados import calcular_historico, faixa_do_level, faixas_de_level
from coletor.config import carregar_config

INICIO = date(2026, 10, 1)


def _ranking(aparicoes):
    """aparicoes: lista de (nome, dia (1 = INICIO), xp, rank, level)."""
    return pd.DataFrame([
        {"extraction_date": INICIO + timedelta(days=d - 1), "rank": r, "name": n,
         "vocation": "Elite Knight", "level": lv, "value": xp}
        for n, d, xp, r, lv in aparicoes
    ])


def _linha(hist, nome, dia):
    data_ref = pd.Timestamp(INICIO + timedelta(days=dia - 2))  # referência = extração − 1
    return hist[(hist["nome"] == nome) & (hist["data_ref"] == data_ref)].iloc[0]


def test_primeira_aparicao_tem_xp_zero_e_sem_variacao_de_rank():
    hist = calcular_historico(_ranking([("A", 1, 1000, 5, 100)]), 10)
    linha = _linha(hist, "A", 1)
    assert linha["xp_dia"] == 0
    assert pd.isna(linha["var_rank"])


def test_xp_do_dia_e_variacao_de_rank():
    hist = calcular_historico(_ranking([("A", 1, 1000, 5, 100), ("A", 2, 1300, 3, 101)]), 10)
    linha = _linha(hist, "A", 2)
    assert linha["xp_dia"] == 300
    assert linha["var_rank"] == 2  # subiu de 5 para 3
    assert linha["lv_30"] == 1


def test_ausencia_de_10_dias_acumula_no_retorno():
    # Aparece no dia 1 e volta no dia 12: ausente nos dias 2 a 11 (10 dias).
    hist = calcular_historico(_ranking([("A", 1, 1000, 5, 100), ("A", 12, 5000, 4, 110)]), 10)
    assert _linha(hist, "A", 12)["xp_dia"] == 4000


def test_ausencia_de_mais_de_10_dias_inicia_nova_sessao():
    # Volta no dia 13: ausente nos dias 2 a 12 (11 dias) → troca de dono.
    hist = calcular_historico(_ranking([("A", 1, 1000, 5, 100), ("A", 13, 5000, 4, 110)]), 10)
    linha = _linha(hist, "A", 13)
    assert linha["xp_dia"] == 0
    assert linha["xp_30"] == 0
    assert pd.isna(linha["var_rank"])


def test_janela_de_7_dias_e_de_calendario():
    # XP de 100 por dia, do dia 1 ao 10.
    hist = calcular_historico(_ranking([("A", d, 1000 + 100 * d, 1, 100) for d in range(1, 11)]), 10)
    linha = _linha(hist, "A", 10)
    assert linha["xp_7"] == 700   # dias 4 a 10
    assert linha["xp_30"] == 900  # dias 2 a 10 (o dia 1 é a primeira aparição, XP 0)


def test_janela_nao_soma_sessao_anterior():
    aparicoes = [("A", d, 1000 + 100 * d, 1, 100) for d in range(1, 4)]
    aparicoes += [("A", d, 90_000 + 50 * d, 1, 300) for d in range(20, 23)]
    hist = calcular_historico(_ranking(aparicoes), 10)
    assert _linha(hist, "A", 22)["xp_30"] == 100  # só dias 21 e 22 da nova sessão


@pytest.mark.parametrize("level,faixa", [
    (8, "2 - 199"), (199, "2 - 199"), (200, "200 - 299"), (850, "800 - 899"),
    (1999, "1900 - 1999"), (2000, "2000+"), (2515, "2000+"),
])
def test_faixa_do_level(level, faixa):
    assert faixa_do_level(level, carregar_config()) == faixa


def test_lista_de_faixas():
    faixas = faixas_de_level(carregar_config())
    assert faixas[0] == "2 - 199" and faixas[1] == "200 - 299"
    assert faixas[-2:] == ["1900 - 1999", "2000+"]
    assert len(faixas) == 20
