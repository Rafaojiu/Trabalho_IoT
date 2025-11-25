import { useState } from 'react'

interface AlertItem {
  id: number
  flask_id: number
  type: string
  message: string
  severity: string
  acknowledged: boolean
  created_at: string
}

interface CreateAlertData {
  flask_id: number
  type: string
  message: string
  severity: string
}

interface Props {
  alerts: AlertItem[]
  onCreate: (data: CreateAlertData) => Promise<void>
  onAcknowledge: (id: number) => Promise<void>
}

export default function Alerts({ alerts, onCreate, onAcknowledge }: Props) {
  const [form, setForm] = useState<CreateAlertData>({ flask_id: 1, type: 'warning', message: '', severity: 'medium' })
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!form.message) return
    setBusy(true)
    try {
      await onCreate(form)
      setForm({ flask_id: 1, type: 'warning', message: '', severity: 'medium' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Criar Alerta</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Frasco</label>
            <select value={form.flask_id} onChange={(e) => setForm({ ...form, flask_id: parseInt(e.target.value) })} className="input">
              {[1,2,3,4].map(n => (
                <option key={n} value={n}>Frasco {n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              <option value="warning">warning</option>
              <option value="info">info</option>
              <option value="pressure_relief">pressure_relief</option>
              <option value="temperature_extreme">temperature_extreme</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severidade</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="input">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="md:col-span-1"></div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem</label>
            <input type="text" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="input" placeholder="Descreva o alerta" />
          </div>
        </div>
        <div className="mt-4">
          <button onClick={submit} disabled={busy || !form.message} className="btn btn-primary">
            {busy ? 'Enviando...' : 'Criar Alerta'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Alertas Recentes</h2>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-gray-600">Nenhum alerta</div>
          ) : (
            alerts.slice(0, 20).map(alert => (
              <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Frasco {alert.flask_id} • {alert.type} • {alert.severity}</div>
                  <div className="text-xs text-gray-500">{alert.message}</div>
                </div>
                {!alert.acknowledged && (
                  <button onClick={() => onAcknowledge(alert.id)} className="btn btn-small btn-success">Reconhecer</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}