#  Sistema RR Rural Fermentation - Monitoramento de Fermentação Ruminal

## 🎯 Objetivo do Projeto

Este projeto implementa um sistema IoT completo para monitoramento de fermentação ruminal in vitro, inspirado nos equipamentos ANKOM RF. O sistema permite acompanhamento em tempo real de parâmetros como pressão e temperatura, com análises cinéticas baseadas no modelo Gompertz.

## 📋 Arquitetura do Sistema

```
┌─────────────────┐     ┌─────────────────┐    ┌─────────────────┐
│   Simulador     │     │   Backend       │    │   Dashboard     │
│   Python +      │───▶│   Node.js +     │───▶│   React +       │
│   Gompertz      │     │   MQTT + SQLite │    │   Recharts      │
└─────────────────┘     └─────────────────┘    └─────────────────┘
```

## 🚀 Componentes Implementados

### 1. Simulador Python com Modelo Gompertz ✅
- **Localização**: `simulator/`
- **Funcionalidades**:
  - Modelo cinético Gompertz para produção de gás
  - Simulação de múltiplos frascos simultaneamente
  - Publicação MQTT de dados de telemetria
  - Geração de alertas para sobrepressão
  - Exportação de dados em CSV

### 2. Sistema MQTT com ESP32 Simulado ✅
- **Protocolo**: MQTT sobre TCP/IP
- **Tópicos**:
  - `rumen/{assay_id}/{flask_id}/telemetry` - Dados de telemetria
  - `rumen/{assay_id}/{flask_id}/alert` - Alertas
  - `rumen/{assay_id}/{flask_id}/config` - Configurações
  - `rumen/{assay_id}/control/start` - Iniciar ensaio
  - `rumen/{assay_id}/control/stop` - Parar ensaio

### 3. Backend Node.js/Express ✅
- **Localização**: `api/`
- **Funcionalidades**:
  - Processamento de dados MQTT
  - Persistência em SQLite
  - API REST completa
  - WebSocket para atualizações em tempo real
  - Sistema de alertas
  - Análises cinéticas

### 4. Dashboard React ✅
- **Localização**: `dashboard/`
- **Funcionalidades**:
  - Visualização em tempo real de dados
  - Gráficos interativos com Recharts
  - Gestão de ensaios
  - Sistema de alertas visual
  - Configurações do sistema
  - Exportação de dados

## 📊 Funcionalidades Principais

### Monitoramento em Tempo Real
- **Pressão absoluta**: 0-2.0 bar
- **Temperatura**: 38-40°C (ideal para fermentação ruminal)
- **Pressão normalizada**: Corrigida para 39°C
- **Taxa de acumulação**: Derivada temporal
- **Eventos**: Alívio de pressão, anomalias

### Sistema de Alertas Inteligente
- **Sobrepressão**: > 1.5 bar (configurável)
- **Temperatura fora do range**: < 38°C ou > 40°C
- **Eventos de alívio**: Registro automático
- **Notificações**: Visuais e sonoras
- **Histórico**: Log completo de alertas

### Análises Cinéticas
- **Modelo Gompertz**: Ajuste automático dos dados
- **Parâmetros estimados**:
  - Produção assintótica (A)
  - Taxa máxima de produção (μ)
  - Tempo de latência (λ)
- **Qualidade do ajuste**: R² e erro padrão
- **Comparação entre frascos**: Análise estatística

### Exportação de Dados
- **Formatos disponíveis**: CSV, JSON, Excel
- **Dados exportáveis**:
  - Telemetria completa
  - Eventos e alertas
  - Parâmetros cinéticos
  - Resumo por ensaio

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js 18+**: Runtime JavaScript
- **Express.js**: Framework web
- **SQLite3**: Banco de dados local
- **MQTT.js**: Cliente MQTT
- **Socket.IO**: Comunicação em tempo real
- **Winston**: Sistema de logging
- **CORS/Helmet**: Segurança e CORS

### Frontend
- **React 18+**: Biblioteca UI
- **TypeScript**: Tipagem estática
- **Vite**: Build tool e dev server
- **Tailwind CSS**: Estilização utilitária
- **Recharts**: Gráficos e visualizações
- **Zustand**: Gerenciamento de estado
- **Lucide React**: Ícones SVG
- **Sonner**: Notificações toast

### Simulador
- **Python 3.8+**: Linguagem de programação
- **NumPy/Pandas**: Processamento de dados
- **SciPy**: Modelagem matemática
- **Matplotlib/Seaborn**: Visualização
- **Paho MQTT**: Cliente MQTT

## 📦 Instalação e Configuração

### Pré-requisitos
- Node.js 18+ instalado
- Python 3.8+ instalado
- MQTT Broker (Mosquitto recomendado)

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/ankom-rf-iot.git
cd ankom-rf-iot
```

### 2. Configure o Backend
```bash
cd api
npm install
cp .env.example .env
# Configure as variáveis no .env
npm run dev
```

### 3. Configure o Dashboard
```bash
cd dashboard
npm install
npm run dev
```

### 4. Configure o Simulador
```bash
cd simulator
pip install -r requirements.txt
python mqtt_publisher.py --assay RF001 --flasks 4
```

## 🔧 Configuração do Sistema

### Variáveis de Ambiente (Backend)
```env
PORT=3003
MQTT_BROKER=localhost
MQTT_PORT=1883
DB_PATH=./data/ankom_rf.db
LOG_LEVEL=info
```

### Parâmetros do Simulador
```bash
python mqtt_publisher.py \
  --assay RF001 \
  --flasks 4 \
  --duration 48 \
  --interval 300 \
  --pressure-limit 1.5
```

## 📈 Uso do Sistema

### Iniciar um Ensaio
1. Acesse o dashboard em http://localhost:3002
2. Clique em "Novo Ensaio"
3. Configure os parâmetros (número de frascos, duração)
4. Inicie o simulador Python
5. Acompanhe os dados em tempo real

### Monitorar Dados
- **Dashboard Principal**: Visão geral de todos os ensaios
- **Detalhes do Ensaio**: Análise detalhada por frasco
- **Gráficos**: Evolução temporal de pressão e temperatura
- **Alertas**: Notificações visuais e sonoras

### Exportar Dados
1. Acesse a página do ensaio desejado
2. Clique em "Exportar Dados"
3. Selecione o formato desejado (CSV, JSON, Excel)
4. Configure o período de dados
5. Baixe o arquivo

## 🔍 Análise dos Dados

### Modelo Gompertz
O sistema utiliza o modelo Gompertz para descrever a cinética de produção de gás:

```
P(t) = A * exp(-exp((μ * e / A) * (λ - t) + 1))
```

Onde:
- **P(t)**: Produção acumulada no tempo t
- **A**: Produção assintótica máxima
- **μ**: Taxa máxima de produção
- **λ**: Tempo de latência
- **e**: Constante de Euler (~2.718)

### Interpretação dos Parâmetros
- **A**: Capacidade total de produção de gás
- **μ**: Velocidade máxima de fermentação
- **λ**: Tempo necessário para iniciar a fermentação
- **R²**: Qualidade do ajuste do modelo

## 🚨 Tratamento de Erros

### Erros Comuns e Soluções

1. **"ECONNREFUSED" no MQTT**
   - Verifique se o broker MQTT está rodando
   - Confirme as configurações de host e porta
   - Teste a conexão com um cliente MQTT

2. **"SQLITE_CANTOPEN"**
   - Crie o diretório `data/` manualmente
   - Verifique permissões de escrita
   - Confirme o caminho do banco de dados

3. **Porta já em uso**
   - Altere a porta no arquivo `.env`
   - Verifique processos em execução
   - Use `netstat` para identificar conflitos

4. **Erros de CORS**
   - Configure corretamente o middleware CORS
   - Verifique as origens permitidas
   - Teste a API diretamente

## 🔐 Segurança

### Medidas Implementadas
- **Validação de entrada**: Todos os dados são validados
- **Sanitização SQL**: Prevenção contra SQL injection
- **CORS configurado**: Controle de origens permitidas
- **Helmet**: Headers de segurança HTTP
- **Rate limiting**: Prevenção contra abuso (implementar)

### Recomendações Adicionais
- Use HTTPS em produção
- Implemente autenticação JWT
- Configure firewall apropriadamente
- Mantenha dependências atualizadas

## 📚 Documentação Adicional

### Arquivos de Documentação
- `docs/technical.md`: Documentação técnica detalhada
- `docs/user-manual.md`: Manual do usuário
- `docs/mqtt-spec.md`: Especificação do protocolo MQTT
- `docs/kinetic-models.md`: Detalhes dos modelos cinéticos

### Recursos Externos
- [Documentação ANKOM RF Original](https://www.ankom.com)
- [Protocolo MQTT](https://mqtt.org/)
- [Modelo Gompertz](https://en.wikipedia.org/wiki/Gompertz_function)

## 🤝 Contribuição

### Como Contribuir
1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

### Diretrizes de Desenvolvimento
- Siga o padrão de código existente
- Adicione testes para novas funcionalidades
- Atualize a documentação conforme necessário
- Mantenha o código limpo e comentado

## 📄 Licença

Este projeto está licenciado sob a MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

Para suporte e dúvidas:
- **Email**: suporte@ankom-rf-iot.com
- **Issues**: Use a aba Issues do GitHub
- **Documentação**: Consulte os arquivos em `docs/`

## 📞 Contato

**Equipe de Desenvolvimento ANKOM RF IoT**
- **Email**: contato@ankom-rf-iot.com
- **Website**: https://ankom-rf-iot.com
- **LinkedIn**: [ANKOM RF IoT](https://linkedin.com/company/ankom-rf-iot)

---

**Nota Importante**: Este é um sistema de simulação para fins educacionais e de demonstração, baseado nos equipamentos ANKOM RF reais. Os dados gerados são simulados e não devem ser usados para pesquisa científica sem validação apropriada.
