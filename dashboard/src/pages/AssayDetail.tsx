import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useDashboardStore } from '../stores/dashboardStore'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { 
  Activity, 
  FlaskConical, 
  Thermometer, 
  Gauge, 
  AlertTriangle, 
  Play,
  Square,
  Settings,
  CheckCircle
} from 'lucide-react'

export default function AssayDetail() {
  const { assayId } = useParams<{ assayId: string }>()
  const { 
    telemetryData, 
    alerts,
    joinAssay,
    leaveAssay 
  } = useDashboardStore()

  const [assayData, setAssayData] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (assayId) {
      joinAssay(assayId)
      fetchAssayData(assayId)
      fetchAnalytics(assayId)
      
      return () => {
        leaveAssay(assayId)
      }
    }
  }, [assayId])

  const fetchAssayData = async (assayId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/telemetry/${assayId}?limit=1000`)
      const data = await response.json()
      setAssayData(data)
    } catch (error) {
      console.error('Erro ao buscar dados do ensaio:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async (assayId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/analytics/${assayId}`)
      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Erro ao buscar análises:', error)
    }
  }

  // Filtra dados do ensaio atual
  const currentAssayData = telemetryData.filter(d => d.assay_id === assayId)
  const currentAlerts = alerts.filter(a => a.assay_id === assayId)

  // Dados para gráficos
  const pressureData = currentAssayData.map(data => ({
    time: format(new Date(data.timestamp), 'dd/MM HH:mm', { locale: ptBR }),
    pressure: data.P_bar_abs,
    temperature: data.T_C,
    flask: data.flask_id
  }))

  // Estatísticas por frasco
  const flaskStats = analytics || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Activity className="h-12 w-12 text-primary-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Carregando detalhes do ensaio...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ensaio {assayId}</h1>
          <p className="text-gray-600 mt-1">Detalhes do monitoramento de fermentação</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button className="btn btn-primary">
            <Play className="h-4 w-4 mr-2" />
            Iniciar
          </button>
          <button className="btn btn-secondary">
            <Square className="h-4 w-4 mr-2" />
            Parar
          </button>
          <button className="btn btn-secondary">
            <Settings className="h-4 w-4 mr-2" />
            Configurar
          </button>
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
              <p className="text-sm font-medium text-gray-500">Total de Leituras</p>
              <p className="text-2xl font-semibold text-gray-900">
                {assayData?.length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Gauge className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pressão Máxima</p>
              <p className="text-2xl font-semibold text-gray-900">
                {flaskStats.length > 0 ? `${Math.max(...flaskStats.map((f: any) => f.max_pressure)).toFixed(3)} bar` : 'N/A'}
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
              <p className="text-sm font-medium text-gray-500">Temp. Média</p>
              <p className="text-2xl font-semibold text-gray-900">
                {flaskStats.length > 0 ? `${(flaskStats.reduce((acc: number, f: any) => acc + f.avg_temperature, 0) / flaskStats.length).toFixed(1)} °C` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-danger-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Eventos de Alívio</p>
              <p className="text-2xl font-semibold text-gray-900">
                {flaskStats.reduce((acc: number, f: any) => acc + f.relief_count, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução da Pressão */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Evolução da Pressão</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={pressureData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="pressure" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Evolução da Temperatura */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Evolução da Temperatura</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={pressureData}>
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

      {/* Análise por frasco */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estatísticas por frasco */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Análise por Frasco</h3>
          <div className="space-y-4">
            {flaskStats.map((flask: any) => (
              <div key={flask.flask_id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">Frasco {flask.flask_id}</h4>
                  <span className="badge badge-success">Ativo</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Leituras</p>
                    <p className="font-medium">{flask.total_readings}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Pressão Média</p>
                    <p className="font-medium">{flask.avg_pressure.toFixed(3)} bar</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Temperatura Média</p>
                    <p className="font-medium">{flask.avg_temperature.toFixed(1)} °C</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Alívios</p>
                    <p className="font-medium">{flask.relief_count}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas recentes */}
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Alertas Recentes</h3>
          {currentAlerts.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">Nenhum alerta recente</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {currentAlerts.map(alert => (
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
    </div>
  )
}