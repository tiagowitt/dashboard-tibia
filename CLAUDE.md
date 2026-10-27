# Collabra XP — projeto novo (substitui o tibia-dados-dashboard)

Projeto pessoal do Tiago: coletar diariamente dados do Tibia (mundo Collabra) pela TibiaData API e analisá-los em um dashboard interativo. Este repositório é um recomeço do zero. O repositório antigo `tiagowitt/tibia-dados-dashboard` será apagado ao final.

## Requisitos

- **Custo zero.** Nada de hospedagem paga.
- **Nenhum segredo guardado.** Sem chaves de API, tokens ou JSON de service account em código, histórico ou Secrets. Se for preciso um segredo, pare e discuta alternativas antes.
- Ambiente do Tiago: Windows 10/11, VS Code, Python 3.13. Ele prefere receber scripts completos (não trechos) e ver opções com prós e contras antes de decisões de implementação.
- Textos, comentários e interface em português do Brasil.

## Arquitetura decidida

1. **Coleta:** GitHub Actions em Python, 1x por dia às **06:30 de Brasília = 09:30 UTC** (cron do GitHub em UTC: `30 9 * * *`; o Brasil não tem horário de verão, então não muda ao longo do ano). O GitHub pode atrasar execuções agendadas em alguns minutos. Grava com o `GITHUB_TOKEN` automático do workflow (`permissions: contents: write`), sem nenhum Secret.
2. **Armazenamento:** arquivos Parquet no próprio repositório, **consolidados por mês** (ex.: `dados/ranking/2026-10.parquet`), com deduplicação por chave na escrita. Nada de um arquivo por dia.
3. **Cálculo:** o mesmo workflow gera agregados prontos para o dashboard (XP diária, 7 e 30 dias, etc.), para o navegador não processar tudo.
4. **Dashboard:** site estático (HTML/JS, DuckDB-WASM se precisar de SQL no navegador) publicado na **Cloudflare Pages**, ligado ao repositório pela integração oficial. Acesso restrito com **Cloudflare Access** (login por e-mail, plano Zero Trust grátis até 50 usuários).
5. **Sem BigQuery, sem Google Sheets, sem Apps Script.**

Repositório público (Actions ilimitado; os dados já são públicos no Tibia). A restrição de acesso fica no site, via Cloudflare Access.

## Decisões de implementação (27/10/2026)

- **Python 3.13** em `.venv` (criado com `py -3.13 -m venv .venv`; o `python` do PATH do Tiago é 3.11). Rodar módulos com `.venv\Scripts\python -m coletor.coletar`.
- **pandas + pyarrow** para processamento; **config em TOML** (`config.toml`, lido com `tomllib`); **agregados em JSON pronto por tela** em `site/dados/` (sem DuckDB-WASM).
- Parquet mensal em `dados/{ranking,kills,guild}/AAAA-MM.parquet`, particionado pelo mês de `extraction_date` (tipo date32), compressão zstd. Na regravação, chave repetida → a linha nova substitui a antiga.
- Colunas mantêm os nomes de origem para facilitar a migração: ranking `extraction_date, rank, name, vocation, level, value`; kills `extraction_date, race, last_day_killed, last_day_players_killed, last_week_killed, last_week_players_killed`; guild `extraction_date, guild_name, rank, character_name, vocation, level, joined_date, status`. `world` e `type` do formato antigo foram descartados.
- Data de extração = data em Brasília (UTC−3 fixo, sem depender de tzdata).
- **Migração de ranking e kills feita em 27/10/2026** (`python -m migracao.migrar_antigo`): 312 dias de 15/12/2025 a 27/10/2026, 312.000 linhas de ranking e 417.578 de kills, além do `bosses.json`. Faltam 23 a 27/12/2025 nos dois conjuntos (a regra dos 10 dias cobre). Em 11/05 e 14/05 alguns ranks se repetem porque as duplicatas vinham de dois estados do highscore; em 10/01 há um empate real de XP. Burtantan 26/10 conferido (dia, 7 e 30 dias batem).
- **Histórico de guild começa em 27/10/2026** (decisão do Tiago: o histórico antigo é irrelevante e não será migrado). O primeiro dia veio de uma coleta manual às ~13h de Brasília; a partir daí é o workflow diário. Telas como "entradas e saídas em 30 dias" só ficam completas depois de 30 dias de coleta.
- **Agregados** (`python -m coletor.agregados`, ~4 s) → `site/dados/`: `resumo.json` (datas, meses, faixas, PT padrão, `guild_de` nome→guild, `medias_faixa` por guild e "Todas"), `historico/AAAA-MM.json` (por mês do dia de referência; colunas `data, rank, nome, voc, level, xp, xp_dia, xp_7, xp_30, lv_30, var_rank`; ~2 MB, ~800 KB gzip por mês), `guild.json` (membros atuais, membros por dia, composição faixa × vocação, entradas e saídas 30 dias) e `kills.json` (top criaturas e matadores em 1/7/30 dias, bosses por período, histórico diário só de Nemesis). Tabelas em JSON vão como `{"colunas": [...], "linhas": [[...]]}`. Vocações viram siglas EK/RP/ED/MS/EM (promovida ou não). Contas de meta ficam no navegador.
- **Comparação da PT (decidido em 27/10/2026):** usa a média da faixa **da guild do próprio jogador** (`medias_faixa[guild_de[nome]][faixa]`), não a das duas guilds juntas. Jogador sem guild, ou faixa sem média, mostra "—".
- **Regra de sessão implementada:** nova sessão quando os dias **ausentes** entre duas aparições (diferença de datas − 1) passam de `dias_troca_de_dono` (10). Volta após 10 dias ausente = mesma sessão; após 11 = nova. Validado: Burtantan 26/10 e XP 30 dias igual à conta direta para os 921 jogadores presentes nos 30 dias.
- **Atenção:** o highscore da TibiaData muda ao longo do dia (não é só 1x/dia). A coleta antiga rodava sempre às ~09:01 UTC. Manter o horário fixo para os números serem comparáveis. 09:30 UTC fica depois do server save tanto no horário de verão europeu (08:00 UTC) quanto no de inverno (09:00 UTC).

## Coleta (TibiaData API v4)

Sempre usar sessão com retry/backoff (429/5xx), timeout e `User-Agent` próprio.

| Dado | Endpoint | Observações |
|---|---|---|
| Highscore de XP | `https://api.tibiadata.com/v4/highscores/Collabra/experience/all/{page}` | Páginas 1 a 20 (50 por página = top 1000). Campos: rank, name, vocation, world, level, value |
| Kill statistics | `https://api.tibiadata.com/v4/killstatistics/Collabra` | race, last_day_killed, last_day_players_killed, last_week_killed, last_week_players_killed |
| Guilds | `https://api.tibiadata.com/v4/guild/{nome}` | "Digit One" e "Digit One Academy". Campos: name, rank, vocation, level, joined, status |
| Bosses (semanal) | `https://tibia.fandom.com/api.php` (categorymembers) | Categorias Bane_Bosses, Archfoe_Bosses, Nemesis_Bosses → `dados/bosses.json` |

Mundo e guilds devem ficar em um arquivo de configuração único, não fixos no código.

## Lógica de negócio (validada contra a planilha antiga — os números bateram)

- **Dia de referência = data da extração − 1 dia.** O highscore extraído hoje reflete a XP de ontem; o kill statistics `last_day_*` também.
- **XP ganha no dia** = XP total do dia − XP total da aparição anterior do mesmo nome.
- **Troca de dono:** se o nome ficar mais de 10 dias sem aparecer no top 1000, começa uma nova "sessão" e a XP da primeira aparição é 0 (evita somar o histórico de outra pessoa). Dias ausentes até 10 acumulam no dia de retorno.
- **XP 7 / 30 dias** = soma da XP ganha nos últimos 7 / 30 dias de calendário, dentro da mesma sessão.
- **Variação de rank** = rank anterior − rank atual (positivo = subiu).
- **Fórmula de XP por level (Tibia):** XP(L) = 50/3·L³ − 100·L² + 850/3·L − 200.
- **Meta de level:** XP que falta = XP(meta) − XP atual; dias no ritmo atual = falta ÷ (XP 30 dias ÷ 30); XP/dia necessária até 31/12 = falta ÷ dias até 31/12.
- **Média da guild por faixa de level:** faixas "2 - 199", "200 - 299" … "1900 - 1999", "2000+". Média da XP 30 dias apenas dos membros da guild que estão no top 1000 no último dia. Comparação de um jogador = XP 30 dias dele ÷ média da faixa dele − 1.

## Dashboard (telas)

1. **Ranking XP:** top por XP no dia / 7 dias / 30 dias, com seletor de data, busca, filtro por vocação e por guild, variação no highscore.
2. **Jogador:** KPIs (level, levels em 30 dias, XP dia/7/30, média diária, rank), gráficos de XP por dia (barras + média móvel 7d), level e posição no highscore, calculadora de meta, histórico diário.
3. **Análise PT:** escolher até 7 personagens (padrão: Burtantan 800, Xar Lovinhu 800, Kelvin Klein 900, Parametro Arda 900, Neevez Relajado 1000 — nome e meta), tabela comparativa, % vs média da guild na faixa, dias até a meta, tabela de XP/dia necessária até 31/12 por level, gráfico de XP dos últimos 30 dias.
4. **Guild & Kills:** membros por dia, composição por faixa × vocação, média de XP por faixa nas duas guilds, entradas e saídas em 30 dias; criaturas mais mortas, quem mais matou jogadores, bosses mortos (Nemesis/Archfoe/Bane).

Cores por vocação fixas (EK, RP, ED, MS, EM). Tema claro e escuro. Funcionar no celular.

## Migração dos dados antigos

Origem: repositório antigo (público), clonar com `git clone --depth 1 https://github.com/tiagowitt/tibia-dados-dashboard`.

- `dados/ranking/Collabra/*.parquet` → highscore desde 15/12/2025 (arquivos `highscores_*` até 23/01/2026 e `ranking_*` depois; mesmo esquema). **Atenção:** há 81 linhas duplicadas (mesmo nome e data) em 11/05 e 14/05/2026 — manter a de maior XP.
- `dados/kill_statistics/Collabra/*.parquet` → kills desde 15/12/2025 (`killstatistics_*` e `kill_statistics_*`).
- `dados/bosses.json`.
- **Descartar** as pastas dos outros 86 mundos (só têm dez/2025–jan/2026 e ninguém usa).
- **Histórico de guild:** não será migrado (decidido em 27/10/2026). O histórico começa com a coleta nova. O BigQuery não é usado para nada no projeto novo.

## Segurança — situação atual e limpeza

- No repositório antigo, um token do Apps Script ficou escrito no workflow de 19/05 a 16/09/2026 e continua visível no histórico. A chave JSON do Google (`GCP_SA_KEY`) nunca foi publicada.
- Até 27/10/2026, a planilha **principal** (Apps Script com URL `.../AKfycbz9Br7f.../exec`) ainda aceitava o token antigo. O Tiago não usa mais essa planilha. **Prioridade:** arquivar a implantação dela (Apps Script > Implantar > Gerenciar implantações > Arquivar) e apagar a planilha.
- A planilha "Controle PT 22h" fica sem Apps Script no novo fluxo: arquivar a implantação dela também.

Limpeza final, depois que o projeto novo rodar com sucesso por alguns dias:
1. Apagar o repositório `tiagowitt/tibia-dados-dashboard`.
2. No Google Cloud (projeto `tibia-analytics`): apagar a chave JSON da service account, ou o projeto inteiro.
3. Apagar arquivos `.json` de chave no computador.

## Ordem de trabalho sugerida

1. Arquivar as implantações do Apps Script (segurança, imediato).
2. Montar o repositório: configuração, coletor, agregados, testes locais.
3. Migrar os dados antigos para o formato mensal e validar contagens (ex.: Burtantan em 26/10/2026 = XP no dia 94.671.271; 7 dias 538.266.556; 30 dias 1.972.989.406).
4. Workflows (diário e semanal) com `permissions` mínimas e actions em versões atuais.
5. Dashboard.
6. Cloudflare Pages + Access (o Tiago faz os cliques; guiar passo a passo).
7. Ligar Secret scanning e Push protection no repositório novo.
8. Limpeza final.
