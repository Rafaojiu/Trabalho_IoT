import { useState } from 'react'
import { Settings as SettingsIcon, Save, AlertTriangle, Info } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const [mqttConfig, setMqttConfig] = useState({
    broker: 'localhost',
    port: 1883,
    username: '',
    password: ''
  })

  const [alertConfig, setAlertConfig] = useState({
    pressureReliefThreshold: 1.5,
    pressureWarningThreshold: 2.5,
    temperatureMin: 30.0,
    temperatureMax: 45.0
  })

  const [dataConfig, setDataConfig] = useState({
    retentionDays: 30,
    exportFormat: 'csv',
    autoBackup: true
  })

  const handleSaveMqttConfig = () => {
    // Simula salvamento
    toast.success('Configurações MQTT salvas com sucesso!')
  }

  const handleSaveAlertConfig = async () => {
    try {
      const resp = await fetch('http://localhost:3003/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pressure_relief_threshold: alertConfig.pressureReliefThreshold,
          pressure_warning_threshold: alertConfig.pressureWarningThreshold,
          temp_min: alertConfig.temperatureMin,
          temp_max: alertConfig.temperatureMax
        })
      })
      if (resp.ok) toast.success('Configurações de alerta salvas com sucesso!')
    } catch (e) {
      toast.error('Erro ao salvar configurações de alerta')
    }
  }

  const loadAlertConfig = async () => {
    try {
      const resp = await fetch('http://localhost:3003/api/alerts/config')
      if (!resp.ok) return
      const data = await resp.json()
      setAlertConfig({
        pressureReliefThreshold: data.pressure_relief_threshold,
        pressureWarningThreshold: data.pressure_warning_threshold,
        temperatureMin: data.temp_min,
        temperatureMax: data.temp_max
      })
    } catch {}
  }

  // inicializar
  useState(() => { loadAlertConfig() })

  const handleSaveDataConfig = () => {
    toast.success('Configurações de dados salvas com sucesso!')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <SettingsIcon className="h-8 w-8 text-primary-600 mr-3" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-600 mt-1">Configure o sistema ANKOM RF IoT</p>
        </div>
      </div>

      {/* Configurações MQTT */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Configurações MQTT</h2>
          <button onClick={handleSaveMqttConfig} className="btn btn-primary">
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Broker MQTT
            </label>
            <input
              type="text"
              value={mqttConfig.broker}
              onChange={(e) => setMqttConfig({...mqttConfig, broker: e.target.value})}
              className="input"
              placeholder="localhost"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Porta
            </label>
            <input
              type="number"
              value={mqttConfig.port}
              onChange={(e) => setMqttConfig({...mqttConfig, port: parseInt(e.target.value)})}
              className="input"
              placeholder="1883"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Porta
            </label>
            <input
              type="number"
              value={mqttConfig.port}
              onChange={(e) => setMqttConfig({...mqttConfig, port: parseInt(e.target.value)})}
              className="input"
              placeholder="1883"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuário (opcional)
            </label>
            <input
              type="text"
              value={mqttConfig.username}
              onChange={(e) => setMqttConfig({...mqttConfig, username: e.target.value})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha (opcional)
            </label>
            <input
              type="password"
              value={mqttConfig.password}
              onChange={(e) => setMqttConfig({...mqttConfig, password: e.target.value})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuário (opcional)
            </label>
            <input
              type="text"
              value={mqttConfig.username}
              onChange={(e) => setMqttConfig({...mqttConfig, username: e.target.value})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha (opcional)
            </label>
            <input
              type="password"
              value={mqttConfig.password}
              onChange={(e) => setMqttConfig({...mqttConfig, password: e.target.value})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Senha (opcional)
            </label>
            <input
              type="password"
              value={mqttConfig.password}
              onChange={(e) => setMqttConfig({...mqttConfig, password: e.target.value})}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Configurações de Alertas */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Configurações de Alertas</h2>
          <button onClick={handleSaveAlertConfig} className="btn btn-primary">
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Limite de Pressão (bar)
            </label>
            <input
              type="number"
              step="0.1"
              value={alertConfig.pressureReliefThreshold}
              onChange={(e) => setAlertConfig({...alertConfig, pressureReliefThreshold: parseFloat(e.target.value)})}
              className="input"
            />
            <div className="mt-1 flex items-center text-sm text-gray-500">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Alerta acima deste valor
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperatura Mínima (°C)
            </label>
            <input
              type="number"
              step="0.1"
              value={alertConfig.temperatureMin}
              onChange={(e) => setAlertConfig({...alertConfig, temperatureMin: parseFloat(e.target.value)})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperatura Máxima (°C)
            </label>
            <input
              type="number"
              step="0.1"
              value={alertConfig.temperatureMax}
              onChange={(e) => setAlertConfig({...alertConfig, temperatureMax: parseFloat(e.target.value)})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Limite de Aviso de Pressão (bar)
            </label>
            <input
              type="number"
              step="0.1"
              value={alertConfig.pressureWarningThreshold}
              onChange={(e) => setAlertConfig({...alertConfig, pressureWarningThreshold: parseFloat(e.target.value)})}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notificações
            </label>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={alertConfig.emailNotifications}
                  onChange={(e) => setAlertConfig({...alertConfig, emailNotifications: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Notificações por email</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={alertConfig.soundAlerts}
                  onChange={(e) => setAlertConfig({...alertConfig, soundAlerts: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Alertas sonoros</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Configurações de Dados */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Configurações de Dados</h2>
          <button onClick={handleSaveDataConfig} className="btn btn-primary">
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Retenção de Dados (dias)
            </label>
            <input
              type="number"
              value={dataConfig.retentionDays}
              onChange={(e) => setDataConfig({...dataConfig, retentionDays: parseInt(e.target.value)})}
              className="input"
              min="1"
              max="365"
            />
            <div className="mt-1 flex items-center text-sm text-gray-500">
              <Info className="h-4 w-4 mr-1" />
              Dados mais antigos serão automaticamente removidos
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Formato de Exportação
            </label>
            <select
              value={dataConfig.exportFormat}
              onChange={(e) => setDataConfig({...dataConfig, exportFormat: e.target.value})}
              className="input"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Backup Automático
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={dataConfig.autoBackup}
                onChange={(e) => setDataConfig({...dataConfig, autoBackup: e.target.checked})}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-sm text-gray-700">Ativar backup automático diário</span>
            </label>
          </div>
        </div>
      </div>

      {/* Informações do Sistema */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Informações do Sistema</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Versão</h3>
            <p className="text-gray-900">ANKOM RF IoT v1.0.0</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Última Atualização</h3>
            <p className="text-gray-900">{new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Status do Backend</h3>
            <div className="flex items-center">
              <div className="h-2 w-2 bg-success-500 rounded-full mr-2"></div>
              <span className="text-success-700">Conectado</span>
            </div>
          </div>
          
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Status do MQTT</h3>
            <div className="flex items-center">
              <div className="h-2 w-2 bg-success-500 rounded-full mr-2"></div>
              <span className="text-success-700">Conectado</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}