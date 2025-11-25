#  Sistema RR Rural Fermentation - Monitoramento de Fermentação Ruminal

Sistema completo para monitoramento de fermentação ruminal in vitro.

## 📋 Descrição

Este sistema implementa uma solução IoT para monitoramento de fermentação ruminal in vitro, incluindo:
- Simulação de dados com modelo Gompertz
- Comunicação via MQTT
- Dashboard em tempo real
- Sistema de alertas para sobrepressão
- Normalização térmica dos dados
- Exportação de dados CSV

## 🏗️ Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Simulador     │    │   Backend       │    │   Dashboard     │
│   Python        │───▶│   Node.js       │───▶│   React         │
│   (Dados)       │    │   (MQTT/API)    │    │   (Visualização)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   SQLite        │
                       │   (Dados)       │
                       └─────────────────┘
```

## 🚀 Instalação

### Pré-requisitos
- Node.js (v16+)
- Python (v3.8+)
- npm ou yarn

### Instalação Rápida
```bash
# Instalar dependências principais
npm run setup

# Iniciar sistema completo
npm start
```

### Instalação Manual
```bash
# Backend
cd backend
npm install

# Dashboard
cd ../dashboard
npm install

# Simulador
pip install numpy scipy pandas paho-mqtt
```

## 📊 Funcionalidades

- **Monitoramento em Tempo Real**: Visualização de pressão e temperatura
- **Simulação Realista**: Modelo Gompertz para dados de fermentação
- **Alertas Automáticos**: Notificações para sobrepressão (>1.5 bar)
- **Normalização Térmica**: Correção de pressão por temperatura
- **Exportação CSV**: Dados para análise externa
- **Multi-frascos**: Suporte para até 30 frascos simultâneos

## 🔧 Configuração

### Variáveis de Ambiente
```env
# Backend
MQTT_BROKER=localhost
MQTT_PORT=1883
API_PORT=3003

# Dashboard
REACT_APP_API_URL=http://localhost:3003
REACT_APP_MQTT_BROKER=localhost
```

### Parâmetros do Sistema
- Intervalo de amostragem: 1-120 minutos (padrão: 15 min)
- Pressão de alívio: 1.5 bar
- Temperatura base: 39°C
- Volume headspace: 0.16 L

## 📈 Uso

1. **Iniciar o Backend**: `npm run backend`
2. **Iniciar o Simulador**: `npm run simulator`
3. **Iniciar o Dashboard**: `npm run dashboard`
4. **Acessar Dashboard**: http://localhost:3002

## 📚 Documentação

- [Documentação Técnica](docs/technical.md)
- [Manual do Usuário](docs/user-manual.md)
- [Protocolo MQTT](docs/mqtt-spec.md)
- [Modelos Cinéticos](docs/kinetic-models.md)

## 🔒 Segurança

- Comunicação MQTT com TLS
- Validação de dados de entrada
- Limites de pressão para segurança
- Logs de auditoria

## 🧪 Testes

```bash
# Testar backend
npm run test

# Testar dashboard
npm run test
```

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 👥 Autores

Sistema desenvolvido baseado no roteiro ANKOM RF IoT.
