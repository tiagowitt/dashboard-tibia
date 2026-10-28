from datetime import date

import pandas as pd

from coletor.armazenamento import gravar_mensal, ler_conjunto


def _ranking(data, linhas):
    return pd.DataFrame(
        [{"extraction_date": data, "rank": r, "name": n, "vocation": "Elite Knight",
          "level": 500, "value": v} for r, n, v in linhas]
    )


def test_separa_por_mes(tmp_path):
    df = pd.concat([
        _ranking(date(2026, 9, 30), [(1, "A", 100)]),
        _ranking(date(2026, 10, 1), [(1, "A", 200)]),
    ])
    arquivos = gravar_mensal(df, "ranking", tmp_path)
    assert sorted(a.name for a in arquivos) == ["2026-09.parquet", "2026-10.parquet"]


def test_reexecutar_no_mesmo_dia_substitui(tmp_path):
    gravar_mensal(_ranking(date(2026, 10, 27), [(1, "A", 100), (2, "B", 50)]), "ranking", tmp_path)
    gravar_mensal(_ranking(date(2026, 10, 27), [(1, "A", 110)]), "ranking", tmp_path)

    df = ler_conjunto("ranking", tmp_path)
    assert len(df) == 2
    assert df.loc[df["name"] == "A", "value"].item() == 110


def test_acumula_dias_diferentes_e_mantem_tipo_data(tmp_path):
    gravar_mensal(_ranking(date(2026, 10, 26), [(1, "A", 100)]), "ranking", tmp_path)
    gravar_mensal(_ranking(date(2026, 10, 27), [(1, "A", 150)]), "ranking", tmp_path)

    df = ler_conjunto("ranking", tmp_path)
    assert list(df["extraction_date"]) == [date(2026, 10, 26), date(2026, 10, 27)]


def test_ja_coletados_identifica_conjuntos_do_dia(tmp_path):
    from coletor.coletar import ja_coletados

    gravar_mensal(_ranking(date(2026, 10, 28), [(1, "A", 100)]), "ranking", tmp_path)
    assert ja_coletados(tmp_path, date(2026, 10, 28)) == {"ranking"}
    assert ja_coletados(tmp_path, date(2026, 10, 29)) == set()
