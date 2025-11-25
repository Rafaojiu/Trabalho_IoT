import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'

interface TelemetryData {
  schema_version: number
  msg_id: string
  assay_id: string
  flask_id: number
  timestamp: string
  P_bar_abs: number
  T_C: number
  P_bar_std: number
  accum_bar_per_h: number
  event: string
}

interface Alert {
  id: number
  msg_id: string
  assay_id: string
  flask_id: number
  timestamp: string
  alert_type: string
  message: string
  severity: 'low' | 'medium' | 'high'
  resolved: boolean
}

interface Assay {
  id: number
  assay_id: string
  description: string
  start_time: string
  end_time?: string
  status: 'running' | 'completed' | 'stopped'
  num_flasks: number
  created_at: string
}

interface DashboardState {
  // Estado geral
  assays: Assay[]
  currentAssay: string | null
  telemetryData: TelemetryData[]
  alerts: Alert[]
  
  // Estado de conexão
  isConnected: boolean
  socket: Socket | null
  
  // Ações
  setCurrentAssay: (assayId: string | null) => void
  addTelemetryData: (data: TelemetryData) => void
  addAlert: (alert: Alert) => void
  updateAssays: (assays: Assay[]) => void
  
  // Socket.IO
  connectSocket: () => void
  disconnectSocket: () => void
  joinAssay: (assayId: string) => void
  leaveAssay: (assayId: string) => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Estado inicial
  assays: [],
  currentAssay: null,
  telemetryData: [],
  alerts: [],
  isConnected: false,
  socket: null,

  // Ações
  setCurrentAssay: (assayId) => set({ currentAssay: assayId }),
  
  addTelemetryData: (data) => {
    set((state) => ({
      telemetryData: [...state.telemetryData, data].slice(-1000) // Mantém últimos 1000 dados
    }))
  },
  
  addAlert: (alert) => {
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(-100) // Mantém últimos 100 alertas
    }))
  },
  
  updateAssays: (assays) => set({ assays }),

  // Socket.IO
  connectSocket: () => {
    const socket = io('http://localhost:3000')
    
    socket.on('connect', () => {
      set({ isConnected: true })
      console.log('Conectado ao servidor WebSocket')
    })

    socket.on('disconnect', () => {
      set({ isConnected: false })
      console.log('Desconectado do servidor WebSocket')
    })

    socket.on('telemetry_update', (data: TelemetryData) => {
      get().addTelemetryData(data)
    })

    socket.on('alert_update', (alert: Alert) => {
      get().addAlert(alert)
    })

    set({ socket })
  },

  disconnectSocket: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, isConnected: false })
    }
  },

  joinAssay: (assayId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('join_assay', assayId)
    }
  },

  leaveAssay: (assayId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('leave_assay', assayId)
    }
  },
}))