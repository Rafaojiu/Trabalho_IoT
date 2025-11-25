# RR Rural Fermentation - Especificações Técnicas de Implementação

## 1. Visão Geral do Sistema

**Nome do Sistema:** RR Rural Fermentation - Monitoramento de fermentação ruminal em tempo real

**Objetivo:** Sistema IoT completo para monitoramento e controle de fermentação ruminal in vitro com cálculos termodinâmicos precisos e controle de segurança automatizado.

## 2. Arquitetura do Sistema

### 2.1 Componentes Principais
- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + Socket.io
- **Banco de Dados:** SQLite
- **MQTT Broker:** Aedes (Node.js) ou Mosquitto
- **Simulador:** Python com modelo Gompertz
- **Protocolo:** MQTT + WebSocket + REST API

### 2.2 Estrutura de Abas
1. **Dashboard:** Visualização principal com gráficos e controles
2. **Ensaios:** Interface de controle dos vasos de ensaio
3. **Configurações:** Parâmetros e cálculos por vaso

## 3. Funcionalidades Detalhadas

### 3.1 Dashboard

#### 3.1.1 Dropdown de Seleção de Ensaios
```typescript
interface AssaySelectorProps {
  selectedAssay: string;
  onAssayChange: (assay: string) => void;
  assays: string[];
}

// Opções do dropdown:
// - "Todos os ensaios"
// - "Ensaio 1"
// - "Ensaio 2"
// - "Ensaio 3"
// - "Ensaio 4"
```

#### 3.1.2 Filtros e Visualização
- Filtro por ensaio afeta todos os gráficos
- Dados agregados quando "Todos os ensaios" selecionado
- Cores diferentes para cada ensaio

### 3.2 Aba Ensaios

#### 3.2.1 Switch Celsius/Kelvin
```typescript
interface TemperatureUnitSwitchProps {
  unit: 'celsius' | 'kelvin';
  onUnitChange: (unit: 'celsius' | 'kelvin') => void;
}

// Conversão: K = °C + 273.15
// Display ao lado de cada tubo de ensaio
```

#### 3.2.2 Visualização dos Tubos
- 4 vasos de ensaio visuais
- Indicadores de temperatura com unidade switchable
- Pressão acumulada em tempo real
- Status de solenoide (aberto/fechado)

### 3.3 Aba Configurações

#### 3.3.1 Parâmetros por Vaso de Ensaio

**Formulário por Vaso (4 vasos):**
```typescript
interface FlaskConfig {
  flaskId: number;
  initialPressure: number; // P: pressão acumulada (bar abs)
  solutionVolume: number; // Volume da solução (mL)
  reliefPressure: number; // Pressão de alívio (bar)
  maxDuration: number; // Duração máxima (horas)
}
```

#### 3.3.2 Cálculos Automáticos

**Volume Headspace:**
```
Volume_Headspace_L = (350 - Volume_Solucao_mL) / 1000
```

**Número de Mols (PV = nRT):**
```
n = (P × V) / (R × T)

Onde:
- P = pressão acumulada (bar)
- V = volume headspace (L)
- R = 0.08314 L·bar/mol·K
- T = temperatura em Kelvin (°C + 273.15)
```

#### 3.3.3 Alertas de Segurança
- Aviso vermelho para pressão > 5 bar: "RISCO DE CRASH DOS VASOS DE PRESSÃO"
- Alerta amarelo para pressão > 3 bar: "Pressão elevada - Monitorar"

### 3.4 Controles de Ensaio

#### 3.4.1 Função START
```typescript
interface StartAssayParams {
  flasks: number[]; // Vasos a iniciar
  equalizationDelay: number; // Delay de equalização (10s padrão)
  targetPressure: number; // Pressão alvo após equalização (1 bar)
}

// Processo:
1. Abrir solenoides por 10s
2. Aguardar equalização de pressão
3. Fechar solenoides quando pressão = 1 bar
4. Iniciar registro de dados
```

#### 3.4.2 Função STOP Individual
```typescript
interface StopFlaskParams {
  flaskId: number;
  maxDuration: number; // Opções: 12h, 24h, 36h, 48h, 60h, 72h
  autoPurge: boolean; // true = abrir solenoide após tempo
}

// Processo:
1. Parar registro de dados após tempo selecionado
2. Abrir solenoide permanentemente
3. Realizar purga de pressão remanescente
```

#### 3.4.3 Função SHUTDOWN (Emergência)
```typescript
interface EmergencyShutdownParams {
  reason: string;
  openAllSolenoids: boolean; // true = abrir todos solenoides
}

// Processo:
1. Parar todos os registros imediatamente
2. Abrir todos os solenoides permanentemente
3. Registrar evento de emergência
4. Notificar operador
```

### 3.5 Exportação de Dados

#### 3.5.1 Formato CSV
```csv
timestamp,assay_id,flask_id,P_bar_abs,T_C,P_bar_std,accum_bar_per_h,n_mols,relief_count,event
2024-01-15T10:00:00Z,SAQ0101,1,1.234,39.2,1.198,0.015,0.0042,2,normal
2024-01-15T10:05:00Z,SAQ0101,1,1.245,39.1,1.209,0.016,0.0043,2,normal
```

#### 3.5.2 Intervalos de Exportação
- **Padrão:** 5 minutos
- **Disponível:** 1, 5, 10, 15, 30, 60 minutos
- **Individual por vaso:** Sim
- **Filtros por data/ensaios:** Sim

## 4. Modelo de Dados

### 4.1 Tabelas do Banco de Dados

```sql
-- Configurações de vasos
CREATE TABLE flask_configs (
  id INTEGER PRIMARY KEY,
  flask_id INTEGER NOT NULL,
  assay_id TEXT NOT NULL,
  initial_pressure REAL,
  solution_volume REAL,
  headspace_volume REAL,
  relief_pressure REAL DEFAULT 1.5,
  max_duration INTEGER DEFAULT 48,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dados de fermentação
CREATE TABLE fermentation_data (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  assay_id TEXT NOT NULL,
  flask_id INTEGER NOT NULL,
  P_bar_abs REAL NOT NULL,
  T_C REAL NOT NULL,
  P_bar_std REAL,
  accum_bar_per_h REAL,
  n_mols REAL,
  relief_count INTEGER DEFAULT 0,
  event TEXT DEFAULT 'normal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Eventos de controle
CREATE TABLE control_events (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'start', 'stop', 'shutdown', 'relief'
  flask_id INTEGER,
  assay_id TEXT,
  parameters TEXT, -- JSON com parâmetros do evento
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 5. Endpoints da API

### 5.1 Controle de Ensaios
```
POST /api/assays/start
POST /api/assays/stop
POST /api/assays/shutdown
POST /api/flasks/:id/start
POST /api/flasks/:id/stop
POST /api/flasks/:id/relief
```

### 5.2 Configurações
```
GET /api/flasks/:id/config
PUT /api/flasks/:id/config
POST /api/flasks/bulk-config
```

### 5.3 Exportação
```
GET /api/export/csv?assay_id=SAQ0101&flask_id=1&interval=5
GET /api/export/json?start_date=2024-01-15&end_date=2024-01-16
```

## 6. Segurança e Validações

### 6.1 Limites de Segurança
- Pressão máxima: 5 bar (alerta vermelho)
- Pressão de alívio padrão: 1.5 bar
- Temperatura operacional: 38-40°C
- Volume máximo da solução: 300 mL

### 6.2 Validações
- Pressão de alívio deve ser < 5 bar
- Volume da solução deve ser < 350 mL
- Temperatura deve ser entre 35-45°C
- Duração máxima deve ser entre 12-72 horas

## 7. Interface do Usuário

### 7.1 Componentes React Necessários
1. **FlaskConfigForm** - Formulário de configuração por vaso
2. **TemperatureUnitSwitch** - Switch Celsius/Kelvin
3. **AssaySelector** - Dropdown de seleção de ensaios
4. **PressureGauge** - Medidor de pressão visual
5. **ControlPanel** - Painel de controle start/stop/shutdown
6. **ExportDialog** - Modal de exportação de dados
7. **SafetyAlert** - Componente de alertas de segurança

### 7.2 Estilo Visual
- Tema: Rural/Agro com cores verdes e terra
- Fonte: Inter ou Roboto (moderna e legível)
- Ícones: Lucide React (conjunto consistente)
- Layout: Card-based com sombras suaves
- Animações: Transições suaves para estados de controle

## 8. Implementação Passo a Passo

### Fase 1: Backend e Banco de Dados
1. Atualizar schema do banco de dados
2. Implementar endpoints de configuração
3. Adicionar cálculos de PV=nRT
4. Implementar controle de solenoides

### Fase 2: Frontend - Configurações
1. Criar componente FlaskConfigForm
2. Implementar cálculos automáticos
3. Adicionar validações de segurança
4. Criar componentes de alerta

### Fase 3: Frontend - Controles
1. Implementar TemperatureUnitSwitch
2. Criar painel de controle de ensaios
3. Adicionar modais de confirmação
4. Implementar timers e delays

### Fase 4: Exportação e Dashboard
1. Criar sistema de exportação CSV
2. Atualizar dashboard com novo seletor
3. Implementar filtros por ensaio
4. Adicionar visualizações de cálculos

### Fase 5: Testes e Validação
1. Testar todos os cálculos termodinâmicos
2. Validar controles de segurança
3. Testar exportação de dados
4. Validar tempos de delay e timers