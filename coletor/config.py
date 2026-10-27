"""Leitura do config.toml e caminhos padrão do projeto."""

import tomllib
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PASTA_DADOS = RAIZ / "dados"
PASTA_SITE_DADOS = RAIZ / "site" / "dados"

# O Brasil não tem horário de verão: UTC-3 fixo evita depender do pacote tzdata no Windows.
FUSO_BRASILIA = timezone(timedelta(hours=-3), "BRT")


def carregar_config(caminho: Path | None = None) -> dict:
    caminho = caminho or RAIZ / "config.toml"
    with open(caminho, "rb") as f:
        return tomllib.load(f)


def hoje_brasilia() -> date:
    """Data de extração: o dia corrente no horário de Brasília."""
    return datetime.now(FUSO_BRASILIA).date()
