from datetime import date, timedelta

import pandas as pd

from coletor import renomeacoes
from coletor.agregados import aplicar_renomeacoes, calcular_historico

INICIO = date(2026, 11, 1)


def test_mapa_final_resolve_cadeias():
    df = pd.DataFrame({"data": ["2026-11-02", "2026-11-05"], "antigo": ["A", "B"], "novo": ["B", "C"]})
    assert renomeacoes.mapa_final(df) == {"A": "C", "B": "C"}


def test_mapa_final_nao_trava_com_ciclo():
    df = pd.DataFrame({"data": ["1", "2"], "antigo": ["A", "B"], "novo": ["B", "A"]})
    assert set(renomeacoes.mapa_final(df)) <= {"A", "B"}  # só não pode entrar em laço infinito


def test_historico_continua_no_nome_novo():
    # "Xar" some no dia 3 e reaparece como "Raz" no dia 4, com um dia de XP a mais.
    linhas = [(d, "Xar", 1000 + 100 * d) for d in (1, 2, 3)] + [(4, "Raz", 1450)]
    ranking = pd.DataFrame([{"extraction_date": INICIO + timedelta(days=d - 1), "rank": 1, "name": n,
                             "vocation": "Elder Druid", "level": 700, "value": xp} for d, n, xp in linhas])
    junto = aplicar_renomeacoes(ranking, {"Xar": "Raz"}, "name", ["extraction_date", "name"], maior="value")
    hist = calcular_historico(junto, 10)
    raz = hist[hist["nome"] == "Raz"].sort_values("data_ref")
    assert len(raz) == 4
    assert raz["xp_dia"].tolist() == [0, 100, 100, 150]  # o dia da troca não vira "primeira aparição"


class ApiFalsa:
    def __init__(self, respostas):
        self.respostas = respostas

    def personagem(self, nome):
        return self.respostas.get(nome)


def test_conferir_nomes_usa_former_names_do_mesmo_mundo():
    api = ApiFalsa({
        "Raz Comportado": {"name": "Raz Comportado", "world": "Collabra", "former_names": ["Xar Lovinhu"]},
        "Outro Mundo": {"name": "Outro Mundo", "world": "Descubra", "former_names": ["Alguem"]},
        "Sem Historico": {"name": "Sem Historico", "world": "Collabra", "former_names": ["Nunca Visto"]},
        "Novato": {"name": "Novato", "world": "Collabra", "former_names": []},
    })
    nomes = {n: date(2026, 11, 4) for n in ["Raz Comportado", "Outro Mundo", "Sem Historico", "Novato", "Apagado"]}
    trocas = renomeacoes.conferir_nomes(api, "Collabra", nomes, {"Xar Lovinhu", "Alguem"})
    assert trocas == [{"data": "2026-11-04", "antigo": "Xar Lovinhu", "novo": "Raz Comportado"}]


def test_gravar_nao_duplica(tmp_path):
    t = {"data": "2026-11-04", "antigo": "Xar Lovinhu", "novo": "Raz Comportado"}
    assert renomeacoes.gravar(tmp_path, [t]) == 1
    assert renomeacoes.gravar(tmp_path, [t]) == 0
    assert len(renomeacoes.ler(tmp_path)) == 1
