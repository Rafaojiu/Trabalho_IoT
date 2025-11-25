# Guia de Funcionamento — Projeto RR Simulator IoT

## Objetivo
Sistema IoT para simulação e monitoramento da fermentação ruminal: um simulador Python publica telemetria via MQTT, o backend Node.js consome, valida e persiste em SQLite, fornece APIs e WebSocket, e o dashboard web apresenta os dados.

## Arquitetura Resumida
- Backend principal (`backend`): API REST, WebSocket, integração MQTT, SQLite.
- Simulador (`simulator`): Python com modelo Gompertz publicando telemetria.
- Dashboard (`dashboard`): React (dev e build) consumindo API/WS.
- Broker MQTT: Mosquitto ou Aedes Node.

## Pré‑requisitos
- Node.js 18+ e npm
- Python 3.10+
- Broker MQTT acessível (`localhost:1883` por padrão)

## Configuração
- Variáveis de ambiente no backend (`backend/.env`):
  - `API_PORT` (default `3003`)
  - `WS_PORT` (default `8080`)
  - `MQTT_BROKER` (default `localhost`)
  - `MQTT_PORT` (default `1883`)
- Opcional (API alternativo): `api/.env` com `PORT`, `MQTT_BROKER`, `MQTT_PORT`, `DB_PATH`.

## Instalação
1. Instalar dependências Node:
   - `npm run setup`
2. Instalar dependências Python do simulador:
   - `pip install -r simulator/requirements.txt`
3. Iniciar um broker MQTT:
   - Mosquitto: configure `mosquitto/config/mosquitto.conf` e execute o serviço
   - Aedes (Node): `node broker.js`

## Inicialização Rápida
- Orquestrar tudo pela raiz:
  - `star_all.ps1`
- Ou iniciar módulos individualmente:
  - Backend dev: `cd backend && npm run dev`
  - Dashboard dev: `cd dashboard && npm start`
  - Simulador direto: `cd simulator && python simulator.py --flasks 4 --interval 15 --duration 48`

## Fluxo de Dados
1. Simulador gera leituras com modelo Gompertz e ruído controlado.
2. Publica telemetria via MQTT no tópico `ankom/{assay_id}/flask{flask_id}/telemetry` (`simulator/simulator.py:411`).
3. Backend se inscreve em tópicos `ankom/+/+/telemetry` e normaliza payloads (`backend/server.js:160`, `backend/server.js:317`).
4. Valida e persiste em SQLite (`backend/server.js:289`, `backend/server.js:351`).
5. Emite atualizações via WebSocket (`backend/server.js:1566`) e disponibiliza APIs REST.
6. Exporta CSVs automaticamente e sob demanda.

## Operação do Simulador
- CLI do simulador:
  - `python simulator.py --flasks <n> --interval <min> --duration <h> --relief-threshold <bar> --mqtt-broker <host> --mqtt-port <port>`
  - Referência: `simulator/simulator.py:492–499`
- Payload de telemetria (exemplo):
  ```json
  {
    "schema_version": 1,
    "msg_id": "uuid",
    "assay_id": "SAQMMDD",
    "flask_id": 1,
    "ts": "2025-11-18T10:00:00Z",
    "P_bar_abs": 1.234,
    "T_C": 39.1,
    "P_bar_std": 1.210,
    "accum_bar_per_h": 0.0123,
    "relief_count": 0,
    "time_elapsed_h": 0.25,
    "event": "relief"
  }
  ```

## API Backend (principais)
- Saúde e metadados:
  - `GET /` retorna JSON com estado quando `Accept: application/json` (`backend/server.js:631–645`)
  - `GET /api/mqtt/info` dados de broker e tópicos base (`backend/server.js:1508–1526`)
  - `GET /api/mqtt/status` conectado e último recebimento (`backend/server.js:1529–1534`)
- Simulação (processo Python):
  - `POST /api/simulation/start` com `{ num_flasks, duration_hours, sampling_interval_minutes, relief_threshold }` (`backend/server.js:656–699`)
  - `POST /api/simulation/stop` (`backend/server.js:703–715`)
  - `POST /api/simulation/speed` com `{ speed }` (também publica comando e broadcast WS) (`backend/server.js:718–733`)
  - `POST /api/simulation/pause` e `POST /api/simulation/resume` (`backend/server.js:736–759`)
- Telemetria e alertas:
  - `GET /api/telemetry?flask_id=&assay_id=&limit=` (`backend/server.js:1142–1170`)
  - `GET /api/alerts?acknowledged=&limit=` (`backend/server.js:1172–1187`)
  - `POST /api/alerts` cria alerta (`backend/server.js:1189–1228`)
  - `POST /api/alerts/:id/acknowledge` reconhece alerta (`backend/server.js:1231–1250`)
- Vasos (frascos):
  - `GET /api/vessels` estado atual (`backend/server.js:761–765`)
  - `POST /api/vessels/:id/configure` aplica config e calcula PV=nRT (`backend/server.js:903–936`)
  - `GET /api/vessels/:id/gas-law` cálculo PV=nRT + avisos (`backend/server.js:939–979`)
  - `POST /api/vessels/:id/pressure-relief` aciona alívio (`backend/server.js:982–1017`)
- Exportação CSV:
  - `GET /api/export/csv?assay_id=&flask_id=` gera CSV a partir de `telemetry` (`backend/server.js:1410–1454`)
  - Export automático (janela de 5 min) salva em `backend/data/csv` (`backend/server.js:385–423`, `backend/server.js:429–444`)

## WebSocket
- Servidor WS na porta `WS_PORT` (default `8080`) (`backend/server.js:65–67`, `backend/server.js:1566`).
- Ao conectar, recebe `initial_state` com `flasks` e últimos `alerts`.
- Eventos de controle são broadcast para clientes (ex.: `speed_control`, `pause_control`, `resume_control`).

## Dashboard
- Desenvolvimento: `cd dashboard && npm start`
- Build: `react-scripts build` e servir com `npx serve -s build -l 3000` ou via backend estático (`backend/server.js:51–59`).
- Proxy padrão aponta para `http://localhost:3003` no dev.

## Passo a Passo Recomendado
1. Preparar broker MQTT (`localhost:1883`).
2. Instalar dependências (`npm run setup` e `pip install -r simulator/requirements.txt`).
3. Configurar `.env` no `backend` se necessário.
4. Iniciar backend (`npm start` na raiz ou `cd backend && npm run dev`).
5. Iniciar simulador: via `POST /api/simulation/start` ou pelo CLI do Python.
6. Verificar dados:
   - `GET /api/telemetry` para últimas leituras
   - Conectar ao WebSocket para real‑time
   - Abrir dashboard em `http://localhost:3003`
7. Controlar simulação:
   - `POST /api/simulation/speed` com `{ "speed": 2 }`
   - `POST /api/simulation/pause` e `resume`
8. Exportar CSV:
   - `GET /api/export/csv?assay_id=SAQMMDD`
9. Encerrar:
   - `POST /api/simulation/stop`

## Troubleshooting
- MQTT não conecta: checar `MQTT_BROKER`/`MQTT_PORT`; iniciar Mosquitto ou `node broker.js`.
- CSV vazio: confirmar `assay_id` e se há dados em `telemetry`; verificar diretório `backend/data/csv`.
- Dashboard vazio: conferir se o backend está servindo estático (`dist` ou `build`) ou rodar `dashboard` em dev.

## Referências de Código
- Backend: `backend/server.js:24`, inicialização `backend/server.js:1605`
- Simulador: CLI `simulator/simulator.py:492–499`, publicação MQTT `simulator/simulator.py:411`
- WebSocket: `backend/server.js:1566`
- Export CSV: `backend/server.js:1410–1454`