"""Confere se o site publicado já está com os dados gerados nesta execução.

Uso (no workflow, depois do commit):
    python -m coletor.publicacao                 # espera o gerado_em local aparecer no site
    python -m coletor.publicacao --minutos 3     # espera menos

Compara o campo "gerado_em" de site/dados/resumo.json (local) com o do site no ar.
Termina com código 0 quando batem e 1 se o tempo acabar — aí o workflow reenvia.
Só lê o site público: não precisa de token.
"""

import argparse
import json
import sys
import time

import requests

from coletor.config import PASTA_SITE_DADOS, carregar_config

INTERVALO_SEGUNDOS = 20


def gerado_em_local() -> str:
    with open(PASTA_SITE_DADOS / "resumo.json", encoding="utf-8") as f:
        return json.load(f)["gerado_em"]


def gerado_em_no_ar(url_site: str, user_agent: str) -> str | None:
    """Lê o resumo publicado, sem cache. None se o site não respondeu direito."""
    try:
        resp = requests.get(f"{url_site}/dados/resumo.json", params={"t": time.time_ns()},
                            headers={"User-Agent": user_agent, "Cache-Control": "no-cache"}, timeout=20)
        resp.raise_for_status()
        return resp.json().get("gerado_em")
    except (requests.RequestException, ValueError):
        return None


def main() -> int:
    cfg = carregar_config()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--minutos", type=float, default=cfg["site"]["espera_minutos"])
    args = parser.parse_args()

    esperado = gerado_em_local()
    limite = time.monotonic() + args.minutos * 60
    print(f"Esperando o site publicar os dados gerados em {esperado} (até {args.minutos:g} min)...", flush=True)
    while True:
        no_ar = gerado_em_no_ar(cfg["site"]["url"], cfg["coleta"]["user_agent"])
        if no_ar == esperado:
            print("Site publicado com os dados novos.")
            return 0
        if time.monotonic() >= limite:
            print(f"Tempo esgotado: o site ainda mostra {no_ar}.", file=sys.stderr)
            return 1
        time.sleep(INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    sys.exit(main())
