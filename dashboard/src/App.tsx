import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { AlertTriangle, Thermometer, Activity, Download, Play, Pause, CheckCircle } from 'lucide-react';
import Alerts from './pages/Alerts';
import AssaySelector from './components/AssaySelector';
import TemperatureSwitch from './components/TemperatureSwitch';
import FlaskConfig from './components/FlaskConfig';
import PressureControl from './components/PressureControl';
import AssayControl from './components/AssayControl';
import './App.css';

interface TelemetryData {
  msg_id: string;
  assay_id: string;
  flask_id: number;
  ts: string;
  P_bar_abs: number;
  T_C: number;
  P_bar_std?: number;
  accum_bar_per_h?: number;
  relief_count?: number;
  event?: string;
}

interface FlaskState {
  flask_id: number;
  assay_id: string;
  last_pressure: number;
  last_temperature: number;
  last_timestamp: string;
  relief_count: number;
  status: string;
}

interface Alert {
  id: number;
  flask_id: number;
  type: string;
  message: string;
  severity: string;
  acknowledged: boolean;
  created_at: string;
}

interface FlaskConfigData {
  accumulatedPressure: number;
  volume: number;
  solutionVolume: number;
  moles: number;
  temperature: number;
}

function App() {
  const [flasks, setFlasks] = useState<FlaskState[]>([]);
  const [telemetryData, setTelemetryData] = useState<TelemetryData[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedFlask, setSelectedFlask] = useState<number | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Estado do sistema
  
  
  // Novos estados para funcionalidades
  const [selectedAssay, setSelectedAssay] = useState('Todos os frascos');
  const [isCelsius, setIsCelsius] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [flaskConfigs, setFlaskConfigs] = useState<{[key: number]: FlaskConfigData}>({
    1: { accumulatedPressure: 0, volume: 0.35, solutionVolume: 250, moles: 0, temperature: 39.0 },
    2: { accumulatedPressure: 0, volume: 0.35, solutionVolume: 250, moles: 0, temperature: 39.0 },
    3: { accumulatedPressure: 0, volume: 0.35, solutionVolume: 250, moles: 0, temperature: 39.0 },
    4: { accumulatedPressure: 0, volume: 0.35, solutionVolume: 250, moles: 0, temperature: 39.0 }
  });
  const [reliefPressure, setReliefPressure] = useState(2.0);
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [captureDuration, setCaptureDuration] = useState<number | null>(null);
  

  // Conectar ao WebSocket
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // Tenta conectar na porta configurada pelo backend (env WS_PORT) com fallback
        const tryPorts = [8081, 8080];
        let ws: WebSocket | null = null;

        for (const port of tryPorts) {
          try {
            ws = new WebSocket(`ws://localhost:${port}`);
            break;
          } catch (err) {
            console.warn(`Falha ao conectar WS na porta ${port}, tentando próxima...`);
          }
        }

        if (!ws) throw new Error('Não foi possível inicializar WebSocket');
        
        ws.onopen = () => {
          console.log('✅ Conectado ao WebSocket');
          setIsConnected(true);
          
          // Solicitar estado inicial
          ws.send(JSON.stringify({ type: 'request_initial_state' }));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            // Suporta mensagens telemetria com ou sem envelope { type, data }
            const isEnveloped = message && message.type && message.data;
            const payload = isEnveloped ? message.data : message;
            const msgType = isEnveloped ? message.type : 'telemetry';
            console.log('📡 Mensagem WebSocket recebida:', msgType);

            if (msgType === 'telemetry') {
              handleTelemetryUpdate(payload);
            } else if (message.type === 'initial_state') {
              setFlasks(message.data.flasks || []);
              setAlerts(message.data.alerts || []);
            } else if (message.type === 'new_alert') {
              setAlerts(prev => [message.alert, ...prev].slice(0, 10));
            }
          } catch (error) {
            console.error('❌ Erro ao processar mensagem WebSocket:', error);
          }
        };

        ws.onclose = () => {
          console.log('📡 Desconectado do WebSocket');
          setIsConnected(false);
          setTimeout(() => {
            console.log('🔄 Tentando reconectar ao WebSocket...');
            connectWebSocket();
          }, 5000);
        };

        ws.onerror = (error) => {
          console.error('❌ Erro WebSocket:', error);
          setIsConnected(false);
        };

        return ws;
      } catch (error) {
        console.error('❌ Erro ao conectar WebSocket:', error);
        return null;
      }
    };

    const ws = connectWebSocket();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Removido fetch inicial de API: o dashboard agora depende apenas de WebSocket/MQTT

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const resp = await fetch('http://localhost:3003/api/system/capture-status');
        if (!resp.ok) return;
        const data = await resp.json();
        setCaptureEnabled(Boolean(data.enabled));
        setCaptureDuration(typeof data.duration_seconds === 'number' ? data.duration_seconds : null);
      } catch {}
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => { clearInterval(t); };
  }, []);

  const handleTelemetryUpdate = (data: TelemetryData) => {
    setLastUpdate(new Date());
    
    setTelemetryData(prev => {
      const newData = [data, ...prev].slice(0, 1000);
      return newData;
    });

    // Atualiza frasco existente ou cria um novo cartão se ainda não existir
    setFlasks(prev => {
      const index = prev.findIndex(f => f.flask_id === data.flask_id);
      if (index === -1) {
        return [
          ...prev,
          {
            flask_id: data.flask_id,
            assay_id: data.assay_id,
            last_pressure: data.P_bar_abs,
            last_temperature: data.T_C,
            last_timestamp: data.ts,
            relief_count: data.relief_count || 0,
            status: 'active'
          }
        ];
      }
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        last_pressure: data.P_bar_abs,
        last_temperature: data.T_C,
        last_timestamp: data.ts,
        relief_count: data.relief_count ?? updated[index].relief_count
      };
      return updated;
    });
  };

  // Função para reconhecer alerta
  const acknowledgeAlert = async (alertId: number) => {
    try {
      const response = await fetch(`http://localhost:3003/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      }
    } catch (error) {
      console.error('Erro ao reconhecer alerta:', error);
    }
  };

  // Funções de controle de tempo

  // Novas funções de controle
  const handleStartAssay = async (options: any) => {
    try {
      const response = await fetch('http://localhost:3003/api/assay/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options)
      });

      if (response.ok) {
        setIsSimulating(true);
        console.log('✅ Ensaio iniciado com delay de 10s');
      }
    } catch (error) {
      console.error('❌ Erro ao iniciar ensaio:', error);
    }
  };

  const handleStopAssay = async (flaskId: number, duration: number) => {
    try {
      const response = await fetch(`http://localhost:3003/api/assay/stop/${flaskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ duration })
      });

      if (response.ok) {
        console.log(`✅ Ensaio ${flaskId} parado após ${duration}h`);
      }
    } catch (error) {
      console.error('❌ Erro ao parar ensaio:', error);
    }
  };

  const handleShutdown = async () => {
    try {
      const response = await fetch('http://localhost:3003/api/assay/shutdown', {
        method: 'POST'
      });

      if (response.ok) {
        setIsSimulating(false);
        console.log('✅ Shutdown de emergência executado');
      }
    } catch (error) {
      console.error('❌ Erro no shutdown:', error);
    }
  };

  const handleFlaskConfigChange = (flaskId: number, config: FlaskConfigData) => {
    setFlaskConfigs(prev => ({
      ...prev,
      [flaskId]: config
    }));
  };

  // Efeito para atualizar tempo decorrido
  

  const startSimulation = async () => {
    try {
      const response = await fetch('http://localhost:3003/api/simulation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          num_flasks: 4,
          duration_hours: 48,
          sampling_interval_minutes: 15
        })
      });

      if (response.ok) {
        setIsSimulating(true);
        console.log('✅ Simulação iniciada');
      }
    } catch (error) {
      console.error('❌ Erro ao iniciar simulação:', error);
    }
  };

  const stopSimulation = async () => {
    try {
      const response = await fetch('http://localhost:3003/api/simulation/stop', {
        method: 'POST'
      });
      if (response.ok) {
        setIsSimulating(false);
        console.log('✅ Simulação parada');
      } else {
        // Fallback: executar shutdown via MQTT quando processo local não está controlado
        const resp2 = await fetch('http://localhost:3003/api/assay/shutdown', { method: 'POST' });
        if (resp2.ok) {
          setIsSimulating(false);
          console.log('✅ Shutdown de emergência executado (fallback)');
        }
      }
    } catch (error) {
      console.error('❌ Erro ao parar simulação:', error);
    }
  };

  const exportData = async () => {
    try {
      const query = selectedFlask ? `?flask_id=${selectedFlask}` : '';
      const response = await fetch(`http://localhost:3003/api/export/csv${query}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rr_rural_fermentation_${selectedFlask ? 'flask'+selectedFlask+'_': ''}${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('❌ Erro ao exportar dados:', error);
    }
  };

  const getPressureStatus = (pressure: number) => {
    if (pressure > 1.5) return 'danger';
    if (pressure > 1.2) return 'warning';
    return 'normal';
  };

  const getTemperatureStatus = (temperature: number) => {
    if (temperature < 30 || temperature > 45) return 'danger';
    if (temperature < 35 || temperature > 42) return 'warning';
    return 'normal';
  };

  const getFlaskData = (flaskId: number) => {
    return telemetryData.filter(data => data.flask_id === flaskId);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  // Filtrar dados baseado no ensaio selecionado
  const filteredData = selectedAssay === 'Todos os frascos'
    ? telemetryData
    : telemetryData.filter(data => data.flask_id === parseInt(selectedAssay.replace('Frasco ', '')));

  // Converter temperatura se necessário
  const convertTemperature = (tempC: number) => {
    return isCelsius ? tempC : tempC + 273.15;
  };

  const getTemperatureUnit = () => {
    return isCelsius ? '°C' : 'K';
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>🧪 RR Rural Fermentation - Monitoramento de fermentação ruminal em tempo real</h1>
          <div className="header-controls">
            <button 
              onClick={exportData} 
              className="btn btn-secondary"
              disabled={!isConnected}
            >
              <Download size={16} />
              Exportar CSV
            </button>
            {isSimulating ? (
              <button onClick={stopSimulation} className="btn btn-danger">
                <Pause size={16} />
                Parar Simulação
              </button>
            ) : (
              <button onClick={startSimulation} className="btn btn-primary">
                <Play size={16} />
                Iniciar Simulação
              </button>
            )}
            <div className="connection-status">
              <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></div>
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>
            <div className="connection-status">
              <div className={`status-indicator ${captureEnabled ? 'connected' : 'disconnected'}`}></div>
              {captureEnabled ? `Captura: Ativa • ${formatDuration(captureDuration)}` : `Captura: Desativada${captureDuration ? ' • '+formatDuration(captureDuration) : ''}`}
            </div>
          </div>
        </div>
      </header>

      {/* Navegação por Abas */}
      <nav className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={`tab-button ${activeTab === 'ensaios' ? 'active' : ''}`}
          onClick={() => setActiveTab('ensaios')}
        >
          Ensaios
        </button>
        <button 
          className={`tab-button ${activeTab === 'configuracoes' ? 'active' : ''}`}
          onClick={() => setActiveTab('configuracoes')}
        >
          Configurações
        </button>
        <button 
          className={`tab-button ${activeTab === 'alertas' ? 'active' : ''}`}
          onClick={() => setActiveTab('alertas')}
        >
          Alertas
        </button>
      </nav>

      <main className="main-content">
        

        {/* Aba Dashboard */}
        {activeTab === 'dashboard' && (
          <>
            {/* Seletor de Ensaios */}
            <section className="assay-selector-section">
              <div className="section-header">
                <h2>Seleção de Ensaios</h2>
                <AssaySelector 
                  selectedAssay={selectedAssay}
                  onAssayChange={(value) => {
                    setSelectedAssay(value);
                    if (value !== 'Todos os frascos') {
                      const n = parseInt(value.replace('Frasco ', ''));
                      setSelectedFlask(n);
                    } else {
                      setSelectedFlask(null);
                    }
                  }}
                />
              </div>
            </section>

            {/* Cards de Status dos Frascos */}
            <section className="flask-cards">
              {flasks.map((flask) => (
                <div 
                  key={flask.flask_id} 
                  className={`flask-card ${selectedFlask === flask.flask_id ? 'selected' : ''}`}
                  onClick={() => setSelectedFlask(selectedFlask === flask.flask_id ? null : flask.flask_id)}
                >
                  <div className="card-header">
                    <h3>Frasco {flask.flask_id}</h3>
                    <div className={`status-badge ${flask.status}`}>
                      {flask.status}
                    </div>
                  </div>
                  
                  <div className="card-metrics">
                    <div className={`metric ${getPressureStatus(flask.last_pressure)}`}>
                      <Activity size={20} />
                      <div>
                        <span className="metric-label">Pressão</span>
                        <span className="metric-value">{flask.last_pressure.toFixed(2)} bar</span>
                      </div>
                    </div>
                    
                    <div className={`metric ${getTemperatureStatus(flask.last_temperature)}`}>
                      <Thermometer size={20} />
                      <div>
                        <span className="metric-label">Temperatura</span>
                        <span className="metric-value">
                          {convertTemperature(flask.last_temperature).toFixed(1)}{getTemperatureUnit()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="card-footer">
                    <span className="last-update">
                      Última atualização: {formatTimestamp(flask.last_timestamp)}
                    </span>
                    <span className="relief-count">
                      Alívios: {flask.relief_count}
                    </span>
                  </div>
                </div>
              ))}
            </section>

            {/* Gráficos de Pressão e Temperatura */}
            <section className="charts-section">
              <div className="chart-container">
                <h2>📊 Pressão ao Longo do Tempo</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={selectedFlask ? getFlaskData(selectedFlask) : filteredData.slice(0, 100)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="ts" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('pt-BR')}
                    />
                    <YAxis yAxisId="pressure" orientation="left" />
                    <YAxis yAxisId="temperature" orientation="right" />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleString('pt-BR')}
                      formatter={(value, name) => {
                        if (name === 'P_bar_abs') return [`${value} bar`, 'Pressão'];
                        if (name === 'T_C') return [`${convertTemperature(value as number)}${getTemperatureUnit()}`, 'Temperatura'];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Line 
                      yAxisId="pressure"
                      type="monotone" 
                      dataKey="P_bar_abs" 
                      stroke="#2563eb" 
                      strokeWidth={2}
                      name="Pressão (bar)"
                      dot={false}
                    />
                    <Line 
                      yAxisId="temperature"
                      type="monotone" 
                      dataKey="T_C" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      name={`Temperatura (${getTemperatureUnit()})`}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-container">
                <h2>📈 Taxa de Produção de Gás</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={filteredData.slice(0, 50)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="ts" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('pt-BR')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleString('pt-BR')}
                      formatter={(value) => [`${value} bar/h`, 'Taxa de Produção']}
                    />
                    <Bar dataKey="accum_bar_per_h" fill="#16a34a" name="Taxa de Produção (bar/h)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Alertas */}
            <section className="alerts-section">
              <h2>🚨 Alertas Recentes</h2>
              <div className="alerts-list">
                {alerts.length === 0 ? (
                  <div className="no-alerts">
                    <AlertTriangle size={32} />
                    <p>Nenhum alerta recente</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className={`alert alert-${alert.severity}`}>
                      <AlertTriangle size={16} />
                      <div className="alert-content">
                        <strong>Frasco {alert.flask_id}</strong>
                        <span>{alert.message}</span>
                        <small>{formatTimestamp(alert.created_at)}</small>
                      </div>
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="btn btn-small btn-success"
                        title="Reconhecer alerta"
                      >
                        <CheckCircle size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {/* Aba Ensaios */}
        {activeTab === 'ensaios' && (
          <>
            <section className="temperature-control-section">
              <div className="section-header">
                <TemperatureSwitch 
                  isCelsius={isCelsius}
                  onToggle={setIsCelsius}
                />
              </div>
            </section>

            <section className="assay-control-section">
              <AssayControl
                onStart={handleStartAssay}
                onStop={handleStopAssay}
                onShutdown={handleShutdown}
              />
            </section>
          </>
        )}

        {/* Aba Configurações */}
        {activeTab === 'configuracoes' && (
          <>
            <section className="pressure-control-section">
              <PressureControl
                reliefPressure={reliefPressure}
                onChange={setReliefPressure}
              />
            </section>

            <section className="flask-config-section">
              <h2>Configuração dos Vasos de Ensaio</h2>
              {[1, 2, 3, 4].map((flaskId) => (
                <FlaskConfig
                  key={flaskId}
                  flaskId={flaskId}
                  initialData={flaskConfigs[flaskId]}
                  onChange={(config) => handleFlaskConfigChange(flaskId, config)}
                />
              ))}
            </section>
          </>
        )}

        {activeTab === 'alertas' && (
          <Alerts
            alerts={alerts}
            onCreate={async (data) => {
              try {
                const resp = await fetch('http://localhost:3003/api/alerts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                })
                if (resp.ok) {
                  const json = await resp.json()
                  setAlerts(prev => [json.alert, ...prev])
                }
              } catch {}
            }}
            onAcknowledge={acknowledgeAlert}
          />
        )}

        {/* Informações do Sistema */}
        <section className="system-info">
          <div className="info-card">
            <h3>ℹ️ Informações do Sistema</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Conexão:</span>
                <span className={`info-value ${isConnected ? 'connected' : 'disconnected'}`}>
                  {isConnected ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Última Atualização:</span>
                <span className="info-value">
                  {lastUpdate ? lastUpdate.toLocaleTimeString('pt-BR') : 'Nunca'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Total de Dados:</span>
                <span className="info-value">{filteredData.length} registros</span>
              </div>
              <div className="info-item">
                <span className="info-label">Frascos Ativos:</span>
                <span className="info-value">{flasks.length}</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <p>© 2024 RR Rural Fermentation - Monitoramento de fermentação ruminal em tempo real</p>
      </footer>
    </div>
  );
}

export default App;
