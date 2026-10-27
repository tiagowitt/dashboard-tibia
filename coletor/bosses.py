"""Atualização semanal da lista de bosses (TibiaWiki/Fandom) → dados/bosses.json.

Uso:
    python -m coletor.bosses

Gera um dicionário {nome do boss: tipo}, com tipo Bane, Archfoe ou Nemesis, a partir das
categorias configuradas em config.toml ([bosses] categorias).
"""

import argparse
import json
import sys
from pathlib import Path

from coletor.api import ClienteAPI, ErroAPI
from coletor.config import PASTA_DADOS, carregar_config

URL_FANDOM = "https://tibia.fandom.com/api.php"

# Se a wiki devolver muito menos que isso, provavelmente é falha dela: não sobrescreve.
MINIMO_DE_BOSSES = 100


def membros_da_categoria(api: ClienteAPI, categoria: str) -> list[str]:
    """Títulos das páginas da categoria, seguindo a paginação (cmcontinue)."""
    params = {"action": "query", "list": "categorymembers", "cmtitle": f"Category:{categoria}",
              "cmtype": "page", "cmlimit": "500", "format": "json"}
    titulos = []
    while True:
        dados = api.get_json(URL_FANDOM, params=params)
        titulos += [m["title"] for m in dados["query"]["categorymembers"]]
        if "continue" not in dados:
            return titulos
        params["cmcontinue"] = dados["continue"]["cmcontinue"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pasta-dados", type=Path, default=PASTA_DADOS)
    args = parser.parse_args()

    cfg = carregar_config()
    api = ClienteAPI(user_agent=cfg["coleta"]["user_agent"],
                     timeout=cfg["coleta"]["timeout_segundos"],
                     tentativas=cfg["coleta"]["tentativas"], pausa_entre_chamadas=1)

    bosses = {}
    try:
        for categoria in cfg["bosses"]["categorias"]:
            tipo = categoria.removesuffix("_Bosses")
            titulos = membros_da_categoria(api, categoria)
            print(f"  {tipo}: {len(titulos)} bosses", flush=True)
            bosses.update({titulo: tipo for titulo in titulos})
    except (ErroAPI, KeyError) as e:
        print(f"ERRO ao consultar a wiki: {e}", file=sys.stderr)
        return 1

    if len(bosses) < MINIMO_DE_BOSSES:
        print(f"ERRO: só {len(bosses)} bosses; mantendo o arquivo atual.", file=sys.stderr)
        return 1

    destino = args.pasta_dados / "bosses.json"
    anterior = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else {}
    novos = sorted(set(bosses) - set(anterior))
    removidos = sorted(set(anterior) - set(bosses))

    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(dict(sorted(bosses.items())), ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    print(f"{len(bosses)} bosses gravados em {destino}")
    if novos:
        print(f"  novos: {', '.join(novos)}")
    if removidos:
        print(f"  removidos: {', '.join(removidos)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
