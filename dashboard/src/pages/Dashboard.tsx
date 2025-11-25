import { useEffect, useState } from 'react'
import { useDashboardStore } from '../stores/dashboardStore'
import { Activity, AlertTriangle, CheckCircle, Thermometer, Gauge, FlaskConical } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Dashboard() {
  const { 
    assays, 
    currentAssay, 
    telemetryData, 
    alerts, 
    isConnected,
    connectSocket,
    updateAssays,
    setCurrentAssay 
  } = useDashboardStore()

  const [loading, setLoading] = useState(true)

  // Conecta ao WebSocket ao montar o componente
  useEffect(() => {
    connectSocket()
    
    // Busca ensaios ativos
    fetchActiveAssays()
    
    return () => {
      // Cleanup ao desmontar
    }
  }, [])

  const fetchActiveAssays = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/assays')
      const data = await response.json()
      updateAssays(data)
      
      // Seleciona o primeiro ensaio ativo
      if (data.length > 0 && !currentAssay) {
        setCurrentAssay(data[0].assay_id)
      }
    } catch (error) {
      console.error('Erro ao buscar ensaios:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtra dados do ensaio atual
  const currentAssayData = telemetryData.filter(d => d.assay_id === currentAssay)
  const currentAlerts = alerts.filter(a => a.assay_id === currentAssay)

  // Dados para gráficos
  const chartData = currentAssayData.slice(-50).map(data => ({
    time: format(new Date(data.timestamp), 'HH:mm', { locale: ptBR }),
    pressure: data.P_bar_abs,
    temperature: data.T_C,
    pressure_std: data.P_bar_std
  }))

  // Estatísticas atuais
  const latestData = currentAssayData[currentAssayData.length - 1]
  const activeFlasks = currentAssayData.length > 0 ? Math.max(...currentAssayData.map(d => d.flask_id)) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 text-primary-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">RR Rural Fermentation</h1>
          <p className="text-gray-600 mt-1">Monitoramento de fermentação ruminal em tempo real</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Status de conexão */}
          <div className="flex items-center space-x-2">
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-success-500' : 'bg-danger-500'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          
          {/* Seletor de ensaio */}
          <select
            value={currentAssay || ''}
            onChange={(e) => setCurrentAssay(e.target.value)}
            className="input"
          >
            <option value="">Selecione um ensaio</option>
            {assays.map(assay => (
              <option key={assay.assay_id} value={assay.assay_id}>
                {assay.assay_id} - {assay.description}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <FlaskConical className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Frascos Ativos</p>
              <p className="text-2xl font-semibold text-gray-900">{activeFlasks}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Gauge className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pressão Atual</p>
              <p className="text-2xl font-semibold text-gray-900">
                {latestData ? `${latestData.P_bar_abs.toFixed(3)} bar` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Thermometer className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Temperatura</p>
              <p className="text-2xl font-semibold text-gray-900">
                {latestData ? `${latestData.T_C.toFixed(1)} °C` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className={`h-8 w-8 ${currentAlerts.length > 0 ? 'text-danger-600' : 'text-success-600'}`} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Alertas Ativos</p>
              <p className="text-2xl font-semibold text-gray-900">
                {currentAlerts.filter(a => !a.resolved).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Pressão */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Pressão (bar)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="pressure" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Temperatura */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Temperatura (°C)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[38, 41]} />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="temperature" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alertas recentes */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Alertas Recentes</h3>
        {currentAlerts.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-success-500 mx-auto mb-4" />
            <p className="text-gray-600">Nenhum alerta recente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentAlerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <AlertTriangle className={`h-5 w-5 ${
                  alert.severity === 'high' ? 'text-danger-500' :
                  alert.severity === 'medium' ? 'text-warning-500' :
                  'text-primary-500'
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                  <p className="text-xs text-gray-500">
                    Frasco {alert.flask_id} • {format(new Date(alert.timestamp), 'dd/MM HH:mm', { locale: ptBR })}
                  </p>
                </div>
                <span className={`badge ${
                  alert.severity === 'high' ? 'badge-danger' :
                  alert.severity === 'medium' ? 'badge-warning' :
                  'badge-info'
                }`}>
                  {alert.severity === 'high' ? 'Alto' : alert.severity === 'medium' ? 'Médio' : 'Baixo'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}