require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const cron = require('node-cron');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuração de logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ankom-rf-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Configurações
const PORT = process.env.PORT || 3000;
const MQTT_BROKER = process.env.MQTT_BROKER || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || 1883;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Banco de dados SQLite
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'ankom_rf.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Erro ao conectar ao banco de dados:', err);
  } else {
    logger.info('Conectado ao banco de dados SQLite');
    initializeDatabase();
  }
});

// Inicialização do banco de dados
function initializeDatabase() {
  const createTables = `
    CREATE TABLE IF NOT EXISTS fermentation_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schema_version INTEGER,
      msg_id TEXT UNIQUE,
      assay_id TEXT,
      flask_id INTEGER,
      timestamp TEXT,
      P_bar_abs REAL,
      T_C REAL,
      P_bar_std REAL,
      accum_bar_per_h REAL,
      event TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      msg_id TEXT,
      assay_id TEXT,
      flask_id INTEGER,
      timestamp TEXT,
      alert_type TEXT,
      message TEXT,
      severity TEXT,
      resolved BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assay_id TEXT UNIQUE,
      description TEXT,
      start_time DATETIME,
      end_time DATETIME,
      status TEXT DEFAULT 'running',
      num_flasks INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flask_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assay_id TEXT,
      flask_id INTEGER,
      interval_minutes INTEGER DEFAULT 15,
      relief_threshold REAL DEFAULT 1.5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  db.exec(createTables, (err) => {
    if (err) {
      logger.error('Erro ao criar tabelas:', err);
    } else {
      logger.info('Tabelas do banco de dados criadas com sucesso');
    }
  });
}

// Cliente MQTT
const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`, {
  clientId: `ankom-rf-backend-${uuidv4()}`,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000
});

mqttClient.on('connect', () => {
  logger.info(`Conectado ao broker MQTT em ${MQTT_BROKER}:${MQTT_PORT}`);
  
  // Se inscreve em todos os tópicos relevantes
  const topics = [
    'rumen/+/+/telemetry',
    'rumen/+/+/alert',
    'rumen/+/+/config'
  ];
  
  topics.forEach(topic => {
    mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`Erro ao se inscrever em ${topic}:`, err);
      } else {
        logger.info(`Inscrito em: ${topic}`);
      }
    });
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    logger.info(`Mensagem recebida no tópico ${topic}:`, data);
    
    const topicParts = topic.split('/');
    const messageType = topicParts[3];
    
    switch (messageType) {
      case 'telemetry':
        handleTelemetryData(data);
        break;
      case 'alert':
        handleAlertData(data);
        break;
      case 'config':
        handleConfigData(data);
        break;
      default:
        logger.warn(`Tipo de mensagem desconhecido: ${messageType}`);
    }
    
  } catch (error) {
    logger.error('Erro ao processar mensagem MQTT:', error);
  }
});

mqttClient.on('error', (error) => {
  logger.error('Erro MQTT:', error);
});

// Handlers de mensagens MQTT
function handleTelemetryData(data) {
  const { 
    schema_version, msg_id, assay_id, flask_id, timestamp,
    P_bar_abs, T_C, P_bar_std, accum_bar_per_h, event 
  } = data;
  
  // Valida dados obrigatórios
  if (!msg_id || !assay_id || !flask_id || !timestamp) {
    logger.warn('Dados de telemetria incompletos:', data);
    return;
  }
  
  // Insere no banco de dados
  const sql = `
    INSERT INTO fermentation_data 
    (schema_version, msg_id, assay_id, flask_id, timestamp,
     P_bar_abs, T_C, P_bar_std, accum_bar_per_h, event)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    schema_version || 1, msg_id, assay_id, flask_id, timestamp,
    P_bar_abs, T_C, P_bar_std, accum_bar_per_h, event
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        logger.warn(`Mensagem duplicada: ${msg_id}`);
      } else {
        logger.error('Erro ao inserir dados de telemetria:', err);
      }
    } else {
      logger.info(`Dados inseridos: ${assay_id}/Flask${flask_id} - P:${P_bar_abs}bar T:${T_C}°C`);
      
      // Emite evento via WebSocket
      io.emit('telemetry_update', data);
      
      // Verifica alertas
      checkAlerts(data);
    }
  });
}

function handleAlertData(data) {
  const { msg_id, assay_id, flask_id, timestamp, alert_type, message, severity } = data;
  
  const sql = `
    INSERT INTO alerts 
    (msg_id, assay_id, flask_id, timestamp, alert_type, message, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [msg_id, assay_id, flask_id, timestamp, alert_type, message, severity || 'medium'];
  
  db.run(sql, params, function(err) {
    if (err) {
      logger.error('Erro ao inserir alerta:', err);
    } else {
      logger.warn(`Alerta registrado: ${alert_type} - ${message}`);
      io.emit('alert_update', data);
    }
  });
}

function handleConfigData(data) {
  const { assay_id, flask_id, interval_minutes, relief_threshold } = data;
  
  const sql = `
    INSERT OR REPLACE INTO flask_config 
    (assay_id, flask_id, interval_minutes, relief_threshold, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  
  const params = [assay_id, flask_id, interval_minutes, relief_threshold];
  
  db.run(sql, params, function(err) {
    if (err) {
      logger.error('Erro ao atualizar configuração:', err);
    } else {
      logger.info(`Configuração atualizada: ${assay_id}/Flask${flask_id}`);
    }
  });
}

function checkAlerts(data) {
  const { assay_id, flask_id, P_bar_abs, T_C, event } = data;
  
  // Alerta de sobrepressão
  if (P_bar_abs >= 1.5) {
    const alertData = {
      msg_id: uuidv4(),
      assay_id: assay_id,
      flask_id: flask_id,
      timestamp: new Date().toISOString(),
      alert_type: 'pressure_critical',
      message: `Sobrepressão detectada: ${P_bar_abs.toFixed(3)} bar`,
      severity: 'high'
    };
    
    handleAlertData(alertData);
  }
  
  // Alerta de temperatura
  if (T_C < 38.0 || T_C > 40.0) {
    const alertData = {
      msg_id: uuidv4(),
      assay_id: assay_id,
      flask_id: flask_id,
      timestamp: new Date().toISOString(),
      alert_type: 'temperature_anomaly',
      message: `Temperatura fora do range: ${T_C.toFixed(1)} °C`,
      severity: 'medium'
    };
    
    handleAlertData(alertData);
  }
  
  // Alerta de evento de alívio
  if (event === 'relief') {
    const alertData = {
      msg_id: uuidv4(),
      assay_id: assay_id,
      flask_id: flask_id,
      timestamp: new Date().toISOString(),
      alert_type: 'pressure_relief',
      message: 'Válvula de alívio ativada',
      severity: 'high'
    };
    
    handleAlertData(alertData);
  }
}

// Rotas da API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mqtt_connected: mqttClient.connected
  });
});

app.get('/api/assays', (req, res) => {
  const sql = 'SELECT * FROM assays ORDER BY created_at DESC';
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      logger.error('Erro ao buscar ensaios:', err);
      res.status(500).json({ error: 'Erro ao buscar ensaios' });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/telemetry/:assay_id', (req, res) => {
  const { assay_id } = req.params;
  const { flask_id, limit = 1000 } = req.query;
  
  let sql = 'SELECT * FROM fermentation_data WHERE assay_id = ?';
  let params = [assay_id];
  
  if (flask_id) {
    sql += ' AND flask_id = ?';
    params.push(flask_id);
  }
  
  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('Erro ao buscar dados de telemetria:', err);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/alerts/:assay_id', (req, res) => {
  const { assay_id } = req.params;
  const { resolved } = req.query;
  
  let sql = 'SELECT * FROM alerts WHERE assay_id = ?';
  let params = [assay_id];
  
  if (resolved !== undefined) {
    sql += ' AND resolved = ?';
    params.push(resolved === 'true');
  }
  
  sql += ' ORDER BY created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      logger.error('Erro ao buscar alertas:', err);
      res.status(500).json({ error: 'Erro ao buscar alertas' });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/config/:assay_id/:flask_id', (req, res) => {
  const { assay_id, flask_id } = req.params;
  const { interval_minutes, relief_threshold } = req.body;
  
  // Publica configuração via MQTT
  const configTopic = `rumen/${assay_id}/${flask_id}/config`;
  const configData = {
    interval_minutes,
    relief_threshold
  };
  
  mqttClient.publish(configTopic, JSON.stringify(configData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar configuração MQTT:', err);
      res.status(500).json({ error: 'Erro ao enviar configuração' });
    } else {
      res.json({ message: 'Configuração enviada com sucesso' });
    }
  });
});

app.get('/api/analytics/:assay_id', (req, res) => {
  const { assay_id } = req.params;
  
  const sql = `
    SELECT 
      flask_id,
      COUNT(*) as total_readings,
      MIN(P_bar_abs) as min_pressure,
      MAX(P_bar_abs) as max_pressure,
      AVG(P_bar_abs) as avg_pressure,
      AVG(T_C) as avg_temperature,
      COUNT(CASE WHEN event = 'relief' THEN 1 END) as relief_count
    FROM fermentation_data 
    WHERE assay_id = ? 
    GROUP BY flask_id
    ORDER BY flask_id
  `;
  
  db.all(sql, [assay_id], (err, rows) => {
    if (err) {
      logger.error('Erro ao buscar análises:', err);
      res.status(500).json({ error: 'Erro ao buscar análises' });
    } else {
      res.json(rows);
    }
  });
});

// WebSocket para atualizações em tempo real
io.on('connection', (socket) => {
  logger.info('Cliente WebSocket conectado:', socket.id);
  
  socket.on('join_assay', (assay_id) => {
    socket.join(`assay_${assay_id}`);
    logger.info(`Cliente ${socket.id} entrou no ensaio ${assay_id}`);
  });
  
  socket.on('leave_assay', (assay_id) => {
    socket.leave(`assay_${assay_id}`);
    logger.info(`Cliente ${socket.id} saiu do ensaio ${assay_id}`);
  });
  
  socket.on('disconnect', () => {
    logger.info('Cliente WebSocket desconectado:', socket.id);
  });
});

// Tarefas agendadas
cron.schedule('*/5 * * * *', () => {
  logger.info('Executando verificação de integridade...');
  
  // Verifica ensaios ativos
  const sql = `
    SELECT assay_id, COUNT(*) as active_flasks
    FROM fermentation_data 
    WHERE timestamp > datetime('now', '-30 minutes')
    GROUP BY assay_id
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      logger.error('Erro na verificação de integridade:', err);
    } else {
      logger.info('Ensaios ativos:', rows);
    }
  });
});

// Inicialização do servidor
server.listen(PORT, () => {
  logger.info(`🚀 Servidor ANKOM RF rodando na porta ${PORT}`);
  logger.info(`📡 Conectando ao broker MQTT em ${MQTT_BROKER}:${MQTT_PORT}`);
});

// Tratamento de sinais de encerramento
process.on('SIGTERM', () => {
  logger.info('Recebido SIGTERM, encerrando...');
  
  mqttClient.end();
  db.close((err) => {
    if (err) {
      logger.error('Erro ao fechar banco de dados:', err);
    }
    server.close(() => {
      logger.info('Servidor encerrado');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('Recebido SIGINT, encerrando...');
  process.emit('SIGTERM');
});