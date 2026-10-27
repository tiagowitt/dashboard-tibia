"""Cliente HTTP com retry/backoff, timeout e User-Agent próprio."""

import time
from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_TIBIADATA = "https://api.tibiadata.com/v4"


class ErroAPI(Exception):
    """Falha definitiva ao consultar a API (depois de esgotar as tentativas)."""


class ClienteAPI:
    def __init__(self, user_agent: str, timeout: float = 30, tentativas: int = 5,
                 pausa_entre_chamadas: float = 0.5):
        self.timeout = timeout
        self.pausa = pausa_entre_chamadas
        self.sessao = requests.Session()
        self.sessao.headers.update({"User-Agent": user_agent, "Accept": "application/json"})
        retry = Retry(
            total=tentativas,
            backoff_factor=2,  # esperas de 0, 4, 8, 16, 32 s...
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
            respect_retry_after_header=True,
        )
        self.sessao.mount("https://", HTTPAdapter(max_retries=retry))

    def get_json(self, url: str, params: dict | None = None) -> dict:
        try:
            resp = self.sessao.get(url, params=params, timeout=self.timeout)
            resp.raise_for_status()
            dados = resp.json()
        except (requests.RequestException, ValueError) as e:
            raise ErroAPI(f"{url}: {e}") from e
        finally:
            time.sleep(self.pausa)

        # A TibiaData às vezes responde 200 com o erro descrito no corpo.
        status = dados.get("information", {}).get("status", {})
        if status.get("http_code", 200) != 200:
            raise ErroAPI(f"{url}: {status}")
        return dados

    # --- Endpoints da TibiaData ---

    def highscore_pagina(self, mundo: str, pagina: int) -> dict:
        url = f"{BASE_TIBIADATA}/highscores/{quote(mundo)}/experience/all/{pagina}"
        return self.get_json(url)["highscores"]

    def kill_statistics(self, mundo: str) -> dict:
        url = f"{BASE_TIBIADATA}/killstatistics/{quote(mundo)}"
        return self.get_json(url)["killstatistics"]

    def guild(self, nome: str) -> dict:
        url = f"{BASE_TIBIADATA}/guild/{quote(nome)}"
        return self.get_json(url)["guild"]
