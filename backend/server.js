/**
 * RR Rural Fermentation System - Backend Server
 * Sistema de fermentação rural com controle de vasos e ensaios
 */

require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

// Configuração do logger simples
const logger = {
    info: (message) => console.log(`[INFO] ${new Date().toISOString()}: ${message}`),
    error: (message) => console.error(`[ERROR] ${new Date().toISOString()}: ${message}`),
    warn: (message) => console.warn(`[WARN] ${new Date().toISOString()}: ${message}`)
};

// Configuração do servidor
const app = express();
const PORT = process.env.API_PORT || 3003;
const MQTT_BROKER = process.env.MQTT_BROKER || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || 1883;

// Estado global do sistema
const systemState = {
    isRunning: false,
    currentAssay: null,
    temperatureUnit: 'celsius', // 'celsius' ou 'kelvin'
    vessels: new Map(),
    assays: new Map()
};

let telemetryCaptureEnabled = false;
let currentCaptureSessionId = null;
let alertConfig = {
    pressureReliefThreshold: 1.5,
    pressureWarningThreshold: 2.5,
    temperatureRange: { min: 30, max: 45 }
};

function openCaptureSession(trigger, assayId) {
    const startedAt = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO capture_sessions (status, started_at, trigger, assay_id)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run('enabled', startedAt, trigger || null, assayId || null, function(err) {
        if (!err) {
            currentCaptureSessionId = this.lastID;
        }
    });
    stmt.finalize();
    telemetryCaptureEnabled = true;
}

function closeCaptureSession(trigger) {
    const stoppedAt = new Date().toISOString();
    if (currentCaptureSessionId) {
        const stmt = db.prepare(`
            UPDATE capture_sessions SET status = ?, stopped_at = ?, trigger = ? WHERE id = ?
        `);
        stmt.run('disabled', stoppedAt, trigger || null, currentCaptureSessionId);
        stmt.finalize();
        currentCaptureSessionId = null;
    }
    telemetryCaptureEnabled = false;
}

// Configurações
const RELIEF_THRESHOLD = 1.5; // bar
const GAS_CONSTANT = 8.314; // J/(mol·K)
const VESSEL_VOLUME = 0.5; // Litros (500ml)
const ATMOSPHERIC_PRESSURE = 1.013; // bar
const MAX_PRESSURE = 2.0; // bar
const TEMPERATURE_RANGE = { min: 30, max: 45 }; // °C

// Middleware
app.use(cors());
app.use(express.json());

// Servir dashboard estático (prioriza Vite dist, fallback para build)
const dashboardDistPath = path.resolve(__dirname, '..', 'dashboard', 'dist');
const dashboardBuildPath = path.resolve(__dirname, '..', 'dashboard', 'build');
const staticDashboardPath = fs.existsSync(dashboardDistPath)
    ? dashboardDistPath
    : (fs.existsSync(dashboardBuildPath) ? dashboardBuildPath : null);

if (staticDashboardPath) {
    app.use(express.static(staticDashboardPath));
}

// Banco de dados SQLite
const db = new sqlite3.Database('./data/ankom_rf.db');

// WebSocket para real-time
const WS_PORT = process.env.WS_PORT || 8080;
const wss = new WebSocket.Server({ port: WS_PORT });

// Cliente MQTT
let mqttClient;
// Processo do simulador Python
let simulatorProcess = null;

// Estado dos frascos
const flaskStates = new Map();

// Logs e alertas
const alerts = [];
// Diretório para exportação CSV automática
const CSV_EXPORT_DIR = path.resolve(__dirname, 'data', 'csv');
let lastCsvExportAt = null;

/**
 * Inicializar banco de dados
 */
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Tabela de telemetria
            db.run(`
                CREATE TABLE IF NOT EXISTS telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    msg_id TEXT UNIQUE,
                    assay_id TEXT,
                    flask_id INTEGER,
                    timestamp TEXT,
                    pressure_abs REAL,
                    temperature REAL,
                    pressure_std REAL,
                    production_rate REAL,
                    relief_count INTEGER DEFAULT 0,
                    event TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Tabela de configurações
            db.run(`
                CREATE TABLE IF NOT EXISTS flask_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    flask_id INTEGER UNIQUE,
                    assay_id TEXT,
                    relief_threshold REAL DEFAULT 1.5,
                    sampling_interval INTEGER DEFAULT 15,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Tabela de alertas
            db.run(`
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    flask_id INTEGER,
                    type TEXT,
                    message TEXT,
                    severity TEXT,
                    acknowledged BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS capture_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT,
                    started_at TEXT,
                    stopped_at TEXT,
                    trigger TEXT,
                    assay_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS alert_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    pressure_relief_threshold REAL,
                    pressure_warning_threshold REAL,
                    temp_min REAL,
                    temp_max REAL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Índices para performance
            db.run(`CREATE INDEX IF NOT EXISTS idx_telemetry_flask_time ON telemetry(flask_id, timestamp)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_telemetry_assay ON telemetry(assay_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_flask ON alerts(flask_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_capture_sessions_time ON capture_sessions(started_at)`);

            console.log('✅ Banco de dados inicializado');
            resolve();
        });
    });
}

function loadAlertConfig() {
    return new Promise((resolve) => {
        db.get('SELECT * FROM alert_config WHERE id = 1', [], (err, row) => {
            if (err) return resolve();
            if (!row) {
                const stmt = db.prepare('INSERT INTO alert_config (id, pressure_relief_threshold, pressure_warning_threshold, temp_min, temp_max) VALUES (1, ?, ?, ?, ?)');
                stmt.run(alertConfig.pressureReliefThreshold, alertConfig.pressureWarningThreshold, alertConfig.temperatureRange.min, alertConfig.temperatureRange.max, () => resolve());
                stmt.finalize();
            } else {
                alertConfig.pressureReliefThreshold = row.pressure_relief_threshold ?? alertConfig.pressureReliefThreshold;
                alertConfig.pressureWarningThreshold = row.pressure_warning_threshold ?? alertConfig.pressureWarningThreshold;
                alertConfig.temperatureRange = { min: row.temp_min ?? alertConfig.temperatureRange.min, max: row.temp_max ?? alertConfig.temperatureRange.max };
                resolve();
            }
        });
    });
}

/**
 * Configurar cliente MQTT
 */
function setupMQTT() {
    mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`, {
        clientId: 'ankom-rf-backend',
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
    });

  mqttClient.on('connect', () => {
    console.log('✅ Conectado ao broker MQTT');
    mqttConnected = true;
    
    // Inscrever em tópicos
    // Espaço de nomes ANKOM
    mqttClient.subscribe('ankom/+/+/telemetry', { qos: 1 });
    mqttClient.subscribe('ankom/config/+/set', { qos: 1 });
    mqttClient.subscribe('ankom/status', { qos: 1 });
    mqttClient.subscribe('ankom/control/#', { qos: 1 });

    // Espaço de nomes RUMEN (usado pelo seu simulador MQTTX)
    mqttClient.subscribe('rumen/+/+/telemetry', { qos: 1 });
    mqttClient.subscribe('rumen/+/+/alert', { qos: 1 });
    mqttClient.subscribe('rumen/+/+/config', { qos: 1 });
  });

    mqttClient.on('message', (topic, message) => {
        mqttLastMessageAt = new Date().toISOString();
        handleMQTTMessage(topic, message);
    });

    mqttClient.on('error', (error) => {
        console.error('❌ Erro MQTT:', error);
    });

    mqttClient.on('disconnect', () => {
        console.log('📡 Desconectado do broker MQTT');
        mqttConnected = false;
    });
}

/**
 * Processar mensagens MQTT
 */
function handleMQTTMessage(topic, message) {
    try {
        const raw = JSON.parse(message.toString());
        const data = normalizeTelemetryPayload(raw);
        console.log(`📨 Mensagem recebida no tópico ${topic}:`, data);
        const topicParts = topic.split('/');
        const namespace = topicParts[0]; // 'ankom' ou 'rumen'

        if (topic.includes('/telemetry')) {
            processTelemetryData(data, namespace);
            
            // Broadcast para WebSocket
            broadcastToWebSocket({
                type: 'telemetry',
                data: data
            });
            
            // Verificar alertas de pressão
            if (data.P_bar_abs > 2.5) {
                const alert = {
                    flask_id: data.flask_id,
                    type: 'pressure_warning',
                    message: `Pressão alta detectada: ${data.P_bar_abs.toFixed(2)} bar`,
                    severity: 'high',
                    acknowledged: false,
                    created_at: new Date().toISOString()
                };
                
                saveAlert(alert);
                
                // Broadcast alerta para WebSocket
                broadcastToWebSocket({
                    type: 'new_alert',
                    alert: alert
                });

                // Publicar alerta via MQTT no mesmo namespace
                const alertTopic = namespace === 'rumen'
                  ? `rumen/${data.assay_id}/${data.flask_id}/alert`
                  : `ankom/${data.assay_id}/flask${data.flask_id}/alert`;
                mqttClient.publish(alertTopic, JSON.stringify({
                    ...alert,
                    timestamp: new Date().toISOString()
                }), { qos: 1 });
            }
        } else if (topic.includes('/config/')) {
            processConfigUpdate(data);
        } else if (topic === 'ankom/status') {
            processStatusMessage(data);
        } else if (topic === 'ankom/control/speed') {
            processSpeedControl(data);
        } else if (topic === 'ankom/control/pause') {
            processPauseControl(data);
        } else if (topic === 'ankom/control/resume') {
            processResumeControl(data);
        }
    } catch (error) {
        console.error('❌ Erro ao processar mensagem MQTT:', error);
    }
}

/**
 * Processar dados de telemetria
 */
function processTelemetryData(data, namespace = 'ankom') {
    // Validar dados
    if (!validateTelemetryData(data)) {
        console.error('❌ Dados de telemetria inválidos:', data);
        return;
    }

    if (telemetryCaptureEnabled) {
        saveTelemetryData(data);
    }

    // Atualizar estado do frasco
    updateFlaskState(data);

    // Verificar alertas
    checkAlerts(data);

    // Enviar para WebSocket clients com envelope padronizado
    broadcastToWebSocket({
        type: 'telemetry',
        data: data
    });

    // Publicar confirmação
    const responseTopic = namespace === 'rumen'
        ? `rumen/${data.assay_id}/${data.flask_id}/ack`
        : `ankom/${data.assay_id}/flask${data.flask_id}/ack`;
    mqttClient.publish(responseTopic, JSON.stringify({
        msg_id: data.msg_id,
        status: 'received',
        timestamp: new Date().toISOString()
    }), { qos: 1 });
}

/**
 * Validar dados de telemetria
 */
function validateTelemetryData(data) {
    const requiredFields = ['msg_id', 'assay_id', 'flask_id', 'ts', 'P_bar_abs', 'T_C'];
    
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null) {
            console.error(`❌ Campo obrigatório ausente: ${field}`);
            return false;
        }
    }

    // Validar ranges
    if (data.P_bar_abs < 0.5 || data.P_bar_abs > MAX_PRESSURE) {
        console.error(`❌ Pressão fora do range: ${data.P_bar_abs} bar`);
        return false;
    }

    if (data.T_C < (alertConfig.temperatureRange?.min ?? TEMPERATURE_RANGE.min) || data.T_C > (alertConfig.temperatureRange?.max ?? TEMPERATURE_RANGE.max)) {
        console.error(`❌ Temperatura fora do range: ${data.T_C}°C`);
        return false;
    }

    return true;
}

/**
 * Normalizar payloads vindos de diferentes simuladores
 * - Converte chaves alternativas para o formato interno
 */
function normalizeTelemetryPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const normalized = { ...payload };

    // Temperatura pode vir como 'T_C', 'C', '°C'
    if (normalized.T_C === undefined) {
        if (normalized.C !== undefined) normalized.T_C = normalized.C;
        else if (normalized['°C'] !== undefined) normalized.T_C = normalized['°C'];
    }

    // Timestamp pode vir como 'timestamp'
    if (normalized.ts === undefined && normalized.timestamp !== undefined) {
        normalized.ts = normalized.timestamp;
    }

    // Taxa de acumulação: 'accum_bar_per_hr' → 'accum_bar_per_h'
    if (normalized.accum_bar_per_h === undefined && normalized.accum_bar_per_hr !== undefined) {
        normalized.accum_bar_per_h = normalized.accum_bar_per_hr;
    }

    // Padrões para campos opcionais
    if (normalized.P_bar_std === undefined && normalized.P_bar_abs !== undefined) {
        normalized.P_bar_std = normalized.P_bar_abs;
    }
    if (normalized.relief_count === undefined) normalized.relief_count = 0;
    if (normalized.event === undefined) normalized.event = null;

    return normalized;
}

/**
 * Salvar dados de telemetria no banco
 */
function saveTelemetryData(data) {
    const stmt = db.prepare(`
        INSERT INTO telemetry (
            msg_id, assay_id, flask_id, timestamp, pressure_abs, 
            temperature, pressure_std, production_rate, relief_count, event
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        data.msg_id,
        data.assay_id,
        data.flask_id,
        data.ts,
        data.P_bar_abs,
        data.T_C,
        data.P_bar_std || data.P_bar_abs,
        data.accum_bar_per_h || 0,
        data.relief_count || 0,
        data.event || null,
        (err) => {
            if (err) {
                console.error('❌ Erro ao salvar telemetria:', err);
            } else {
                console.log(`💾 Dados salvos: Frasco ${data.flask_id} - Pressão: ${data.P_bar_abs} bar`);
            }
        }
    );

    stmt.finalize();
}

/**
 * Exportar telemetria para CSV em janela de tempo
 */
function exportTelemetryWindowToCSV(startISO, endISO) {
    return new Promise((resolve, reject) => {
        const headers = ['timestamp', 'flask_id', 'assay_id', 'pressure_abs', 'temperature', 'pressure_std', 'production_rate', 'relief_count'];
        const query = `SELECT timestamp, flask_id, assay_id, pressure_abs, temperature, pressure_std, production_rate, relief_count
                       FROM telemetry WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`;
        db.all(query, [startISO, endISO], (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar dados para CSV automático:', err);
                return reject(err);
            }
            if (!rows || rows.length === 0) return resolve(null);
            const csvContent = [
                headers.join(','),
                ...rows.map(row => [
                    row.timestamp,
                    row.flask_id,
                    row.assay_id,
                    row.pressure_abs,
                    row.temperature,
                    row.pressure_std,
                    row.production_rate,
                    row.relief_count
                ].join(','))
            ].join('\n');
            try {
                if (!fs.existsSync(CSV_EXPORT_DIR)) {
                    fs.mkdirSync(CSV_EXPORT_DIR, { recursive: true });
                }
                const filename = `telemetry_${startISO.replace(/[:]/g,'-')}_to_${endISO.replace(/[:]/g,'-')}.csv`;
                const filePath = path.join(CSV_EXPORT_DIR, filename);
                fs.writeFileSync(filePath, csvContent, 'utf8');
                console.log(`📦 CSV automático salvo: ${filePath} (${rows.length} registros)`);
                resolve(filePath);
            } catch (e) {
                console.error('❌ Erro ao salvar CSV automático:', e);
                reject(e);
            }
        });
    });
}

/**
 * Agendar exportação automática a cada 5 minutos
 */
function scheduleCsvAutoExport() {
    // Inicializa tempo inicial para 5 minutos atrás
    if (!lastCsvExportAt) {
        lastCsvExportAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    }
    setInterval(async () => {
        try {
            const startISO = lastCsvExportAt;
            const endISO = new Date().toISOString();
            await exportTelemetryWindowToCSV(startISO, endISO);
            lastCsvExportAt = endISO;
        } catch (e) {
            // já logado em função
        }
    }, 5 * 60 * 1000);
}

/**
 * Atualizar estado do frasco
 */
function updateFlaskState(data) {
    const flaskId = data.flask_id;
    
    if (!flaskStates.has(flaskId)) {
        flaskStates.set(flaskId, {
            flask_id: flaskId,
            assay_id: data.assay_id,
            last_pressure: data.P_bar_abs,
            last_temperature: data.T_C,
            last_timestamp: data.ts,
            relief_count: data.relief_count || 0,
            status: 'active'
        });
    } else {
        const state = flaskStates.get(flaskId);
        state.last_pressure = data.P_bar_abs;
        state.last_temperature = data.T_C;
        state.last_timestamp = data.ts;
        state.relief_count = data.relief_count || 0;
    }
}

/**
 * Verificar e gerar alertas
 */
function checkAlerts(data) {
    const alerts = [];

    if (data.P_bar_abs > (alertConfig.pressureReliefThreshold ?? RELIEF_THRESHOLD)) {
        alerts.push({
            flask_id: data.flask_id,
            type: 'high_pressure',
            message: `Pressão alta: ${data.P_bar_abs.toFixed(2)} bar`,
            severity: 'warning'
        });
    }

    if (data.T_C < (alertConfig.temperatureRange?.min ?? TEMPERATURE_RANGE.min) || data.T_C > (alertConfig.temperatureRange?.max ?? TEMPERATURE_RANGE.max)) {
        alerts.push({
            flask_id: data.flask_id,
            type: 'temperature_extreme',
            message: `Temperatura extrema: ${data.T_C}°C`,
            severity: 'warning'
        });
    }

    // Alerta de alívio
    if (data.event === 'relief') {
        alerts.push({
            flask_id: data.flask_id,
            type: 'pressure_relief',
            message: `Alívio de pressão ativado`,
            severity: 'info'
        });
    }

    alerts.forEach(alert => {
        saveAlert(alert);
        const alertTopic = `ankom/${data.assay_id}/flask${data.flask_id}/alert`;
        mqttClient.publish(alertTopic, JSON.stringify({
            ...alert,
            timestamp: new Date().toISOString()
        }), { qos: 1 });
    });
}

/**
 * Salvar alerta no banco
 */
function saveAlert(alert) {
    const stmt = db.prepare(`
        INSERT INTO alerts (flask_id, type, message, severity)
        VALUES (?, ?, ?, ?)
    `);

    stmt.run(alert.flask_id, alert.type, alert.message, alert.severity, function(err) {
        if (err) {
            console.error('❌ Erro ao salvar alerta:', err);
        } else {
            const saved = { id: this.lastID, ...alert };
            alerts.push(saved);
            if (alerts.length > 100) alerts.splice(0, alerts.length - 100);
            broadcastToWebSocket({ type: 'new_alert', alert: saved, timestamp: new Date().toISOString() });
        }
    });

    stmt.finalize();
}

/**
 * Broadcast para WebSocket clients
 */
// removido duplicado

/**
 * Processar atualizações de configuração
 */
function processConfigUpdate(data) {
    console.log('⚙️ Configuração atualizada:', data);
    
    // Atualizar no banco de dados
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO flask_configs (flask_id, assay_id, relief_threshold, sampling_interval, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(data.flask_id, data.assay_id, data.relief_threshold, data.sampling_interval, (err) => {
        if (err) {
            console.error('❌ Erro ao salvar configuração:', err);
        } else {
            console.log(`✅ Configuração salva: Frasco ${data.flask_id}`);
        }
    });

    stmt.finalize();
}

/**
 * Processar mensagens de status
 */
function processStatusMessage(data) {
    console.log('📊 Status recebido:', data);
    // Implementar processamento de status conforme necessário
}

/**
 * Processar comando de controle de velocidade
 */
function processSpeedControl(data) {
    console.log('⚡ Comando de velocidade recebido:', data);
    if (data.speed) {
        console.log(`🚀 Velocidade de simulação alterada para ${data.speed}x`);
        // Broadcast para clientes WebSocket
        broadcastToWebSocket({
            type: 'speed_control',
            speed: data.speed,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Processar comando de pausa
 */
function processPauseControl(data) {
    console.log('⏸️ Comando de pausa recebido:', data);
    // Broadcast para clientes WebSocket
    broadcastToWebSocket({
        type: 'pause_control',
        command: 'pause',
        timestamp: new Date().toISOString()
    });
}

/**
 * Processar comando de retomada
 */
function processResumeControl(data) {
    console.log('▶️ Comando de retomada recebido:', data);
    // Broadcast para clientes WebSocket
    broadcastToWebSocket({
        type: 'resume_control',
        command: 'resume',
        timestamp: new Date().toISOString()
    });
}

/**
 * Rotas da API REST
 */

// Rota raiz: serve dashboard se disponível; mantém JSON quando solicitado
app.get('/', (req, res) => {
    const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
    if (wantsJson || !staticDashboardPath) {
        return res.json({
            name: 'RR Rural Fermentation System',
            version: '2.0.0',
            status: systemState.isRunning ? 'running' : 'stopped',
            temperatureUnit: systemState.temperatureUnit,
            currentAssay: systemState.currentAssay,
            timestamp: new Date().toISOString()
        });
    }
    return res.sendFile(path.join(staticDashboardPath, 'index.html'));
});

// Fallback SPA: qualquer rota não-API serve index.html (quando build presente)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (staticDashboardPath) {
        return res.sendFile(path.join(staticDashboardPath, 'index.html'));
    }
    next();
});

// Iniciar simulador Python
app.post('/api/simulation/start', (req, res) => {
    const { num_flasks = 4, duration_hours = 48, sampling_interval_minutes = 15, relief_threshold = RELIEF_THRESHOLD } = req.body || {};

    if (simulatorProcess) {
        openCaptureSession('simulation_start');
        systemState.isRunning = true;
        return res.json({ message: 'Captura habilitada; simulador já em execução' });
    }

    const simulatorPath = path.resolve(__dirname, '..', 'simulator', 'simulator.py');
    const cwd = path.dirname(simulatorPath);

    const args = [
        simulatorPath,
        '--flasks', String(num_flasks),
        '--interval', String(sampling_interval_minutes),
        '--duration', String(duration_hours),
        '--relief-threshold', String(relief_threshold),
        '--mqtt-broker', String(MQTT_BROKER),
        '--mqtt-port', String(MQTT_PORT)
    ];

    try {
        simulatorProcess = spawn('python', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

        simulatorProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            console.log(`🟢 [SIM] ${msg.trim()}`);
        });

        simulatorProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            console.error(`🔴 [SIM] ${msg.trim()}`);
        });

        simulatorProcess.on('exit', (code) => {
            console.log(`📥 Simulador finalizado com código ${code}`);
            simulatorProcess = null;
        });

        openCaptureSession('simulation_start');
        systemState.isRunning = true;
        res.json({ message: 'Simulação iniciada', params: { num_flasks, duration_hours, sampling_interval_minutes } });
    } catch (error) {
        console.error('❌ Erro ao iniciar simulador:', error);
        res.status(500).json({ error: 'Falha ao iniciar simulador' });
    }
});

// Parar simulador Python
app.post('/api/simulation/stop', (req, res) => {
    if (!simulatorProcess) {
        return res.status(400).json({ message: 'Simulador não está em execução' });
    }
    try {
        const pid = simulatorProcess.pid;
        if (process.platform === 'win32') {
            exec(`taskkill /PID ${pid} /T /F`, (error) => {
                simulatorProcess = null;
                closeCaptureSession('simulation_stop');
                systemState.isRunning = false;
                if (error) return res.status(500).json({ error: 'Falha ao parar simulador' });
                res.json({ message: 'Simulação parada' });
            });
        } else {
            simulatorProcess.kill('SIGTERM');
            simulatorProcess = null;
            closeCaptureSession('simulation_stop');
            systemState.isRunning = false;
            res.json({ message: 'Simulação parada' });
        }
    } catch (error) {
        console.error('❌ Erro ao parar simulador:', error);
        res.status(500).json({ error: 'Falha ao parar simulador' });
    }
});

// Alterar velocidade de simulação
app.post('/api/simulation/speed', (req, res) => {
    const { speed } = req.body || {};
    if (!speed || speed <= 0) {
        return res.status(400).json({ error: 'Velocidade inválida' });
    }
    const data = { speed, timestamp: new Date().toISOString() };
    mqttClient.publish('ankom/control/speed', JSON.stringify(data), { qos: 1 }, (err) => {
        if (err) {
            console.error('❌ Erro ao publicar comando de velocidade:', err);
            return res.status(500).json({ error: 'Falha ao enviar comando de velocidade' });
        }
        // Broadcast para clientes WebSocket
        broadcastToWebSocket({ type: 'speed_control', speed, timestamp: data.timestamp });
        res.json({ message: 'Velocidade alterada', speed });
    });
});

// Pausar simulação
app.post('/api/simulation/pause', (req, res) => {
    const data = { command: 'pause', timestamp: new Date().toISOString() };
    mqttClient.publish('ankom/control/pause', JSON.stringify(data), { qos: 1 }, (err) => {
        if (err) {
            console.error('❌ Erro ao publicar comando de pausa:', err);
            return res.status(500).json({ error: 'Falha ao enviar pausa' });
        }
        broadcastToWebSocket({ type: 'pause_control', command: 'pause', timestamp: data.timestamp });
        res.json({ message: 'Simulação pausada' });
    });
});

// Retomar simulação
app.post('/api/simulation/resume', (req, res) => {
    const data = { command: 'resume', timestamp: new Date().toISOString() };
    mqttClient.publish('ankom/control/resume', JSON.stringify(data), { qos: 1 }, (err) => {
        if (err) {
            console.error('❌ Erro ao publicar comando de retomada:', err);
            return res.status(500).json({ error: 'Falha ao enviar retomada' });
        }
        broadcastToWebSocket({ type: 'resume_control', command: 'resume', timestamp: data.timestamp });
        res.json({ message: 'Simulação retomada' });
    });
});

// Obter estado dos vasos (frascos)
app.get('/api/vessels', (req, res) => {
    const states = Array.from(flaskStates.values());
    res.json(states);
});

// Obter ensaios ativos
app.get('/api/assays', (req, res) => {
    const assays = Array.from(systemState.assays.values());
    res.json(assays);
});

// Criar novo ensaio
app.post('/api/assays', (req, res) => {
    const { id, name, description, vesselCount, duration } = req.body;
    
    if (!id || !name) {
        return res.status(400).json({ error: 'ID e nome do ensaio são obrigatórios' });
    }
    
    const assay = {
        id,
        name,
        description: description || '',
        vesselCount: vesselCount || 4,
        duration: duration || 48,
        status: 'created',
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null
    };
    
    systemState.assays.set(id, assay);
    logger.info(`Ensaio criado: ${id} - ${name}`);
    
    res.json({ message: 'Ensaio criado com sucesso', assay });
});

// Iniciar ensaio
app.post('/api/assays/:id/start', (req, res) => {
    const { id } = req.params;
    const assay = systemState.assays.get(id);
    
    if (!assay) {
        return res.status(404).json({ error: 'Ensaio não encontrado' });
    }
    
    if (assay.status === 'running') {
        return res.status(400).json({ error: 'Ensaio já está em execução' });
    }
    
    assay.status = 'running';
    assay.startedAt = new Date().toISOString();
    systemState.currentAssay = id;
    systemState.isRunning = true;
    openCaptureSession('assay_start', id);
    telemetryCaptureEnabled = true;
    
    // Publicar comando de início via MQTT
    const startTopic = 'rr_fermentation/control/start';
    const startData = {
        assayId: id,
        vesselCount: assay.vesselCount,
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(startTopic, JSON.stringify(startData), { qos: 1 });
    
    logger.info(`Ensaio iniciado: ${id}`);
    res.json({ message: 'Ensaio iniciado com sucesso', assay });
});

// Parar ensaio
app.post('/api/assays/:id/stop', (req, res) => {
    const { id } = req.params;
    const assay = systemState.assays.get(id);
    
    if (!assay) {
        return res.status(404).json({ error: 'Ensaio não encontrado' });
    }
    
    assay.status = 'stopped';
    assay.completedAt = new Date().toISOString();
    
    if (systemState.currentAssay === id) {
        systemState.currentAssay = null;
        systemState.isRunning = false;
    }
    closeCaptureSession('assay_stop');
    telemetryCaptureEnabled = false;
    
    // Publicar comando de parada via MQTT
    const stopTopic = 'rr_fermentation/control/stop';
    const stopData = {
        assayId: id,
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(stopTopic, JSON.stringify(stopData), { qos: 1 });
    
    logger.info(`Ensaio parado: ${id}`);
    res.json({ message: 'Ensaio parado com sucesso', assay });
});

// Alternar unidade de temperatura
app.post('/api/system/temperature-unit', (req, res) => {
    const { unit } = req.body;
    
    if (!['celsius', 'kelvin'].includes(unit)) {
        return res.status(400).json({ error: 'Unidade deve ser celsius ou kelvin' });
    }
    
    systemState.temperatureUnit = unit;
    
    // Broadcast para todos os clientes
    broadcastToWebSocket({
        type: 'temperature_unit_changed',
        unit: unit,
        timestamp: new Date().toISOString()
    });
    
    logger.info(`Unidade de temperatura alterada para: ${unit}`);
    res.json({ message: 'Unidade de temperatura alterada', unit });
});

// Função para calcular PV=nRT
function calculateGasLaw(pressure, temperature, volume = VESSEL_VOLUME) {
    // P = pressão em bar, V = volume em L, T = temperatura em Kelvin
    const pressurePa = pressure * 100000; // Converter bar para Pa
    const volumeM3 = volume / 1000; // Converter L para m³
    const temperatureK = temperature + 273.15; // Converter Celsius para Kelvin
    
    // n = PV/RT
    const nMoles = (pressurePa * volumeM3) / (GAS_CONSTANT * temperatureK);
    
    return {
        pressure: pressure,
        temperature: temperature,
        temperatureK: temperatureK,
        volume: volume,
        moles: nMoles,
        gasConstant: GAS_CONSTANT
    };
}

// Configurar vaso com cálculos PV=nRT
app.post('/api/vessels/:id/configure', (req, res) => {
    const { id } = req.params;
    const { volume, maxPressure, reliefThreshold, gasType } = req.body;
    
    const flask = flaskStates.get(id);
    if (!flask) {
        return res.status(404).json({ error: 'Vaso não encontrado' });
    }
    
    // Configurações do vaso
    flask.configuration = {
        volume: volume || VESSEL_VOLUME,
        maxPressure: maxPressure || MAX_PRESSURE,
        reliefThreshold: reliefThreshold || RELIEF_THRESHOLD,
        gasType: gasType || 'CO2',
        lastCalculation: null
    };
    
    // Calcular PV=nRT com valores atuais
    const gasLaw = calculateGasLaw(
        flask.pressure || ATMOSPHERIC_PRESSURE,
        flask.temperature || 39
    );
    
    flask.configuration.lastCalculation = gasLaw;
    
    logger.info(`Vaso ${id} configurado: Volume=${flask.configuration.volume}L, MaxPressão=${flask.configuration.maxPressure}bar`);
    
    res.json({
        message: 'Vaso configurado com sucesso',
        configuration: flask.configuration,
        gasLawCalculation: gasLaw
    });
});

// Obter cálculo PV=nRT para vaso
app.get('/api/vessels/:id/gas-law', (req, res) => {
    const { id } = req.params;
    const flask = flaskStates.get(id);
    
    if (!flask) {
        return res.status(404).json({ error: 'Vaso não encontrado' });
    }
    
    if (!flask.pressure || !flask.temperature) {
        return res.status(400).json({ error: 'Dados insuficientes para cálculo' });
    }
    
    const gasLaw = calculateGasLaw(flask.pressure, flask.temperature);
    
    // Verificar alertas de pressão
    const alerts = [];
    const reliefThreshold = flask.configuration?.reliefThreshold || RELIEF_THRESHOLD;
    
    if (flask.pressure > reliefThreshold) {
        alerts.push({
            type: 'warning',
            message: `Pressão próxima ao limite de alívio: ${flask.pressure.toFixed(2)} bar`,
            threshold: reliefThreshold
        });
    }
    
    if (flask.pressure > (flask.configuration?.maxPressure || MAX_PRESSURE)) {
        alerts.push({
            type: 'critical',
            message: `Pressão crítica excedida: ${flask.pressure.toFixed(2)} bar`,
            threshold: flask.configuration?.maxPressure || MAX_PRESSURE
        });
    }
    
    res.json({
        vesselId: id,
        calculation: gasLaw,
        alerts: alerts,
        timestamp: new Date().toISOString()
    });
});

// Acionamento de alívio de pressão
app.post('/api/vessels/:id/pressure-relief', (req, res) => {
    const { id } = req.params;
    const { duration = 5000, reason } = req.body; // duração em ms
    
    const flask = flaskStates.get(id);
    if (!flask) {
        return res.status(404).json({ error: 'Vaso não encontrado' });
    }
    
    // Publicar comando de alívio via MQTT
    const reliefTopic = `rr_fermentation/vessel/${id}/pressure_relief`;
    const reliefData = {
        vesselId: id,
        duration: duration,
        reason: reason || 'Controle manual',
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(reliefTopic, JSON.stringify(reliefData), { qos: 1 });
    
    // Registrar ação
    flask.lastRelief = {
        timestamp: new Date().toISOString(),
        duration: duration,
        reason: reliefData.reason
    };
    
    logger.info(`Alívio de pressão acionado para vaso ${id}: ${reason || 'Controle manual'}`);
    
    res.json({
        message: 'Alívio de pressão acionado',
        vesselId: id,
        duration: duration,
        timestamp: reliefData.timestamp
    });
});

// Função para converter temperatura
function convertTemperature(tempCelsius, targetUnit) {
    if (targetUnit === 'kelvin') {
        return tempCelsius + 273.15;
    }
    return tempCelsius;
}

// Exportar dados em CSV com intervalos de 5 minutos

// Obter dados de telemetria
app.get('/api/telemetry', (req, res) => {
    const { limit = 100, flask_id, assay_id } = req.query;
    
    let query = 'SELECT * FROM telemetry WHERE 1=1';
    const params = [];
    
    if (flask_id) {
        query += ' AND flask_id = ?';
        params.push(flask_id);
    }
    
    if (assay_id) {
        query += ' AND assay_id = ?';
        params.push(assay_id);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit));
    
    db.all(query, params, (err, rows) => {
        if (err) {
            logger.error('Erro ao buscar telemetria:', err);
            res.status(500).json({ error: 'Erro ao buscar dados de telemetria' });
            return;
        }
        res.json(rows);
    });
});

// Obter alertas
app.get('/api/alerts', (req, res) => {
    const { limit = 10, acknowledged = false } = req.query;
    
    let query = 'SELECT * FROM alerts WHERE acknowledged = ? ORDER BY created_at DESC LIMIT ?';
    const params = [acknowledged === 'true' ? 1 : 0, parseInt(limit)];
    
    db.all(query, params, (err, rows) => {
        if (err) {
            logger.error('Erro ao buscar alertas:', err);
            res.status(500).json({ error: 'Erro ao buscar alertas' });
            return;
        }
        res.json(rows);
    });
});

// Criar novo alerta
app.post('/api/alerts', (req, res) => {
    const { flask_id, type, message, severity } = req.body;
    
    if (!flask_id || !type || !message) {
        return res.status(400).json({ error: 'Campos obrigatórios: flask_id, type, message' });
    }
    
    const alert = {
        flask_id,
        type: type || 'warning',
        message,
        severity: severity || 'medium',
        acknowledged: false,
        created_at: new Date().toISOString()
    };
    
    const query = 'INSERT INTO alerts (flask_id, type, message, severity, acknowledged, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    const params = [alert.flask_id, alert.type, alert.message, alert.severity, alert.acknowledged, alert.created_at];
    
    db.run(query, params, function(err) {
        if (err) {
            logger.error('Erro ao criar alerta:', err);
            res.status(500).json({ error: 'Erro ao criar alerta' });
            return;
        }
        
        alert.id = this.lastID;
        
        // Broadcast para WebSocket
        broadcastToWebSocket({
            type: 'new_alert',
            alert: alert,
            timestamp: new Date().toISOString()
        });
        
        logger.info(`Alerta criado: ${alert.type} - ${alert.message}`);
        res.json({ message: 'Alerta criado com sucesso', alert });
    });
});

// Marcar alerta como reconhecido
app.post('/api/alerts/:id/acknowledge', (req, res) => {
    const { id } = req.params;
    
    const query = 'UPDATE alerts SET acknowledged = 1 WHERE id = ?';
    
    db.run(query, [id], function(err) {
        if (err) {
            logger.error('Erro ao reconhecer alerta:', err);
            res.status(500).json({ error: 'Erro ao reconhecer alerta' });
            return;
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Alerta não encontrado' });
        }
        
        logger.info(`Alerta ${id} reconhecido`);
        res.json({ message: 'Alerta reconhecido com sucesso' });
    });
});

// Controladores de simulação
app.post('/api/simulation/start', (req, res) => {
    const { num_flasks, duration_hours, sampling_interval_minutes } = req.body;
    
    // Publicar comando de início via MQTT
    const startTopic = 'rr_fermentation/simulation/start';
    const startData = {
        num_flasks: num_flasks || 4,
        duration_hours: duration_hours || 48,
        sampling_interval_minutes: sampling_interval_minutes || 15,
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(startTopic, JSON.stringify(startData), { qos: 1 });
    
    logger.info('Simulação iniciada via API');
    res.json({ message: 'Comando de início de simulação enviado', data: startData });
});

app.post('/api/simulation/stop', (req, res) => {
    // Publicar comando de parada via MQTT
    const stopTopic = 'rr_fermentation/simulation/stop';
    const stopData = {
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(stopTopic, JSON.stringify(stopData), { qos: 1 });
    
    logger.info('Simulação parada via API');
    res.json({ message: 'Comando de parada de simulação enviado' });
});

// removido duplicado

// removido duplicado

// removido duplicado

// Rotas para ensaios (assays)
app.post('/api/assay/start', (req, res) => {
    const { assay_id, num_flasks, duration_hours } = req.body;
    
    // Publicar comando de início de ensaio via MQTT
    const assayStartTopic = 'rr_fermentation/assay/start';
    const assayStartData = {
        assay_id: assay_id || 'RR001',
        num_flasks: num_flasks || 4,
        duration_hours: duration_hours || 48,
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(assayStartTopic, JSON.stringify(assayStartData), { qos: 1 });
    
    logger.info(`Ensaio iniciado: ${assayStartData.assay_id}`);
    openCaptureSession('assay_start', assayStartData.assay_id);
    systemState.isRunning = true;
    res.json({ message: 'Comando de início de ensaio enviado', data: assayStartData });
});

app.post('/api/assay/stop/:flaskId', (req, res) => {
    const { flaskId } = req.params;
    const { duration } = req.body;
    
    // Publicar comando de parada de ensaio via MQTT
    const assayStopTopic = 'rr_fermentation/assay/stop';
    const assayStopData = {
        flask_id: parseInt(flaskId),
        duration: duration || 48,
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(assayStopTopic, JSON.stringify(assayStopData), { qos: 1 });
    
    logger.info(`Ensaio do frasco ${flaskId} parado`);
    res.json({ message: 'Comando de parada de ensaio enviado', data: assayStopData });
});

app.post('/api/assay/shutdown', (req, res) => {
    // Publicar comando de shutdown de emergência via MQTT
    const shutdownTopic = 'rr_fermentation/assay/shutdown';
    const shutdownData = {
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(shutdownTopic, JSON.stringify(shutdownData), { qos: 1 });
    
    logger.info('Shutdown de emergência executado via API');
    closeCaptureSession('shutdown');
    systemState.isRunning = false;
    res.json({ message: 'Comando de shutdown de emergência enviado' });
});

// Obter alertas
// removido duplicado de /api/alerts

// Exportar dados CSV
app.get('/api/export/csv', (req, res) => {
    const { assay_id, flask_id } = req.query;
    
    let query = 'SELECT * FROM telemetry WHERE 1=1';
    const params = [];
    
    if (assay_id) {
        query += ' AND assay_id = ?';
        params.push(assay_id);
    }
    
    if (flask_id) {
        query += ' AND flask_id = ?';
        params.push(flask_id);
    }
    
    query += ' ORDER BY timestamp';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('❌ Erro ao exportar dados:', err);
            res.status(500).json({ error: 'Erro ao exportar dados' });
            return;
        }
        
        const headers = ['timestamp', 'flask_id', 'assay_id', 'pressure_abs', 'temperature', 'pressure_std', 'production_rate', 'relief_count'];
        const esc = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            const e = s.replace(/"/g, '""');
            return /[",\n]/.test(e) ? '"' + e + '"' : e;
        };
        const prefix = 'sep=,\r\n';
        const csvBody = [
            headers.join(','),
            ...rows.map(row => [
                esc(row.timestamp),
                esc(row.flask_id),
                esc(row.assay_id),
                esc(row.pressure_abs),
                esc(row.temperature),
                esc(row.pressure_std),
                esc(row.production_rate),
                esc(row.relief_count)
            ].join(','))
        ].join('\n');
        const csvContent = prefix + csvBody;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ankom_data_${assay_id || 'all'}_${Date.now()}.csv"`);
        res.send(csvContent);
    });
});

// Atualizar configuração de frasco
app.post('/api/flasks/:id/config', (req, res) => {
    const flaskId = parseInt(req.params.id);
    const { relief_threshold, sampling_interval } = req.body;
    
    // Validar dados
    if (relief_threshold && (relief_threshold < 0.5 || relief_threshold > 2.0)) {
        return res.status(400).json({ error: 'Threshold deve estar entre 0.5 e 2.0 bar' });
    }
    
    if (sampling_interval && (sampling_interval < 1 || sampling_interval > 120)) {
        return res.status(400).json({ error: 'Intervalo deve estar entre 1 e 120 minutos' });
    }
    
    // Publicar configuração via MQTT
    const configTopic = `ankom/config/flask${flaskId}/set`;
    const configData = {
        flask_id: flaskId,
        relief_threshold: relief_threshold || RELIEF_THRESHOLD,
        sampling_interval: sampling_interval || 15,
        timestamp: new Date().toISOString()
    };
    
    mqttClient.publish(configTopic, JSON.stringify(configData), { qos: 1 }, (err) => {
        if (err) {
            console.error('❌ Erro ao enviar configuração:', err);
            res.status(500).json({ error: 'Erro ao enviar configuração' });
        } else {
            res.json({ message: 'Configuração enviada com sucesso', data: configData });
        }
    });
});

// --- MQTTX: Endpoints de informação e publicação ---
let mqttLastMessageAt = null;
let mqttConnected = false;

// Atualiza status de conexão MQTT
if (mqttClient) {
    mqttClient.on('connect', () => {
        mqttConnected = true;
    });
    mqttClient.on('disconnect', () => {
        mqttConnected = false;
    });
    mqttClient.on('message', () => {
        mqttLastMessageAt = new Date().toISOString();
    });
}

// Informações do MQTT (broker, porta, namespaces e tópicos-base)
app.get('/api/mqtt/info', (req, res) => {
    res.json({
        broker: MQTT_BROKER,
        port: MQTT_PORT,
        namespaces: ['ankom', 'rumen'],
        topics: {
            ankom: {
                config_set: 'ankom/config/flask{N}/set',
                telemetry: 'ankom/{assay_id}/flask{N}/telemetry',
                ack: 'ankom/{assay_id}/flask{N}/ack'
            },
            rumen: {
                config: 'rumen/{assay_id}/{flask_id}/config',
                telemetry: 'rumen/{assay_id}/{flask_id}/telemetry',
                ack: 'rumen/{assay_id}/{flask_id}/ack'
            }
        }
    });
});

// Status do MQTT (conectado, último recebimento)
app.get('/api/mqtt/status', (req, res) => {
    res.json({
        connected: mqttConnected,
        last_message_at: mqttLastMessageAt
    });
});

app.get('/api/alerts/config', (req, res) => {
    res.json({
        pressure_relief_threshold: alertConfig.pressureReliefThreshold,
        pressure_warning_threshold: alertConfig.pressureWarningThreshold,
        temp_min: alertConfig.temperatureRange.min,
        temp_max: alertConfig.temperatureRange.max
    });
});

app.post('/api/alerts/config', (req, res) => {
    const { pressure_relief_threshold, pressure_warning_threshold, temp_min, temp_max } = req.body || {};
    const pr = pressure_relief_threshold ?? alertConfig.pressureReliefThreshold;
    const pw = pressure_warning_threshold ?? alertConfig.pressureWarningThreshold;
    const tmin = temp_min ?? alertConfig.temperatureRange.min;
    const tmax = temp_max ?? alertConfig.temperatureRange.max;
    alertConfig = { pressureReliefThreshold: pr, pressureWarningThreshold: pw, temperatureRange: { min: tmin, max: tmax } };
    const stmt = db.prepare('INSERT OR REPLACE INTO alert_config (id, pressure_relief_threshold, pressure_warning_threshold, temp_min, temp_max, updated_at) VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    stmt.run(pr, pw, tmin, tmax, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao salvar configuração de alertas' });
        }
        res.json({ message: 'Configuração de alertas atualizada', config: alertConfig });
    });
    stmt.finalize();
});

app.get('/api/system/capture-status', (req, res) => {
    if (telemetryCaptureEnabled && currentCaptureSessionId) {
        db.get('SELECT * FROM capture_sessions WHERE id = ?', [currentCaptureSessionId], (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao buscar sessão atual' });
            }
            const started = row && row.started_at ? new Date(row.started_at) : null;
            const duration = started ? Math.floor((Date.now() - started.getTime()) / 1000) : null;
            res.json({ enabled: true, session: row, duration_seconds: duration });
        });
    } else {
        db.get('SELECT * FROM capture_sessions ORDER BY id DESC LIMIT 1', [], (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao buscar última sessão' });
            }
            let duration = null;
            if (row && row.started_at && row.stopped_at) {
                const s = new Date(row.started_at).getTime();
                const e = new Date(row.stopped_at).getTime();
                duration = Math.floor((e - s) / 1000);
            }
            res.json({ enabled: false, last_session: row || null, duration_seconds: duration });
        });
    }
});

app.get('/api/system/capture-sessions', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    db.all('SELECT * FROM capture_sessions ORDER BY id DESC LIMIT ?', [limit], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar sessões' });
        }
        res.json(rows);
    });
});

// Publicar mensagem MQTT genérica
app.post('/api/mqtt/publish', (req, res) => {
    const { topic, payload, qos = 1 } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'Topic é obrigatório' });
    const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    try {
        mqttClient.publish(topic, dataStr, { qos }, (err) => {
            if (err) {
                console.error('❌ Erro ao publicar MQTT:', err);
                return res.status(500).json({ error: 'Erro ao publicar MQTT' });
            }
            return res.json({ message: 'Publicado com sucesso', topic, payload: JSON.parse(dataStr) });
        });
    } catch (e) {
        console.error('❌ Exceção ao publicar MQTT:', e);
        return res.status(500).json({ error: 'Exceção ao publicar MQTT' });
    }
});

// Função para broadcast de mensagens WebSocket
function broadcastToWebSocket(message) {
    const messageStr = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('🔌 WebSocket client conectado');
    
    // Enviar estado atual
    const sendInitialState = () => {
        ws.send(JSON.stringify({
            type: 'initial_state',
            data: {
                flasks: Array.from(flaskStates.values()),
                alerts: alerts.slice(-10) // Últimos 10 alertas
            }
        }));
    };
    
    sendInitialState();
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'request_initial_state') {
                sendInitialState();
            }
        } catch (error) {
            console.error('❌ Erro ao processar mensagem WebSocket:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 WebSocket client desconectado');
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

/**
 * Inicializar servidor
 */
async function startServer() {
    try {
        // Criar diretório de dados se não existir
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        
        // Inicializar banco de dados
        await initializeDatabase();
        await loadAlertConfig();
        
        // Configurar MQTT
        setupMQTT();

        // Agendar CSV automático
        scheduleCsvAutoExport();
        
        // Iniciar servidor HTTP
        app.listen(PORT, () => {
            console.log(`🚀 Backend ANKOM RF rodando na porta ${PORT}`);
            console.log(`📡 WebSocket rodando na porta ${WS_PORT}`);
            console.log(`🌐 Dashboard disponível em: http://localhost:${PORT}`);
            console.log(`🗂️ CSV automático em: ${CSV_EXPORT_DIR}`);
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM, encerrando...');
    if (mqttClient) {
        mqttClient.end();
    }
    db.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Recebido SIGINT, encerrando...');
    if (mqttClient) {
        mqttClient.end();
    }
    db.close();
    process.exit(0);
});

// Iniciar servidor
startServer();
