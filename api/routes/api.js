const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const mqtt = require('mqtt');
const winston = require('winston');

const router = express.Router();

// Configuração de logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Cliente MQTT (compartilhado com o servidor principal)
const mqttClient = mqtt.connect(`mqtt://${process.env.MQTT_BROKER || 'localhost'}:${process.env.MQTT_PORT || 1883}`);

mqttClient.on('connect', () => {
  logger.info('Cliente MQTT das rotas conectado');
});

mqttClient.on('error', (error) => {
  logger.error('Erro no cliente MQTT das rotas:', error);
});

// Rotas de ensaios (assays)
router.post('/assays', [
  body('assay_id').isString().notEmpty(),
  body('description').optional().isString(),
  body('num_flasks').isInt({ min: 1, max: 100 }),
  body('start_time').optional().isISO8601()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { assay_id, description, num_flasks, start_time } = req.body;
  
  // Publica evento de início de ensaio
  const startTopic = `rumen/${assay_id}/control/start`;
  const startData = {
    assay_id,
    description,
    num_flasks,
    start_time: start_time || new Date().toISOString(),
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(startTopic, JSON.stringify(startData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar início de ensaio:', err);
      return res.status(500).json({ error: 'Erro ao iniciar ensaio' });
    }
    
    res.json({ 
      message: 'Ensaio iniciado com sucesso',
      assay_id,
      start_time: startData.start_time
    });
  });
});

router.post('/assays/:assay_id/stop', (req, res) => {
  const { assay_id } = req.params;
  
  // Publica evento de parada de ensaio
  const stopTopic = `rumen/${assay_id}/control/stop`;
  const stopData = {
    assay_id,
    end_time: new Date().toISOString(),
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(stopTopic, JSON.stringify(stopData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar parada de ensaio:', err);
      return res.status(500).json({ error: 'Erro ao parar ensaio' });
    }
    
    res.json({ 
      message: 'Ensaio finalizado com sucesso',
      assay_id,
      end_time: stopData.end_time
    });
  });
});

// Rotas de configuração de frascos
router.post('/flasks/:assay_id/:flask_id/config', [
  body('interval_minutes').optional().isInt({ min: 1, max: 60 }),
  body('relief_threshold').optional().isFloat({ min: 0.5, max: 3.0 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { assay_id, flask_id } = req.params;
  const { interval_minutes, relief_threshold } = req.body;
  
  // Publica configuração via MQTT
  const configTopic = `rumen/${assay_id}/${flask_id}/config`;
  const configData = {
    assay_id,
    flask_id: parseInt(flask_id),
    interval_minutes,
    relief_threshold,
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(configTopic, JSON.stringify(configData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar configuração:', err);
      return res.status(500).json({ error: 'Erro ao enviar configuração' });
    }
    
    res.json({ 
      message: 'Configuração enviada com sucesso',
      config: configData
    });
  });
});

// Rotas de controle de válvulas
router.post('/flasks/:assay_id/:flask_id/relief', (req, res) => {
  const { assay_id, flask_id } = req.params;
  
  // Publica comando de alívio de pressão
  const reliefTopic = `rumen/${assay_id}/${flask_id}/control/relief`;
  const reliefData = {
    assay_id,
    flask_id: parseInt(flask_id),
    command: 'relief',
    reason: 'manual',
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(reliefTopic, JSON.stringify(reliefData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando de alívio:', err);
      return res.status(500).json({ error: 'Erro ao enviar comando de alívio' });
    }
    
    res.json({ 
      message: 'Comando de alívio enviado com sucesso',
      command: reliefData
    });
  });
});

// Rotas de controle de tempo (Time Warp)
router.post('/simulation/speed', (req, res) => {
  const { speed } = req.body;
  
  if (!speed || speed <= 0) {
    return res.status(400).json({ error: 'Velocidade deve ser maior que zero' });
  }
  
  // Publicar comando de velocidade via MQTT
  const speedTopic = 'ankom/control/speed';
  const speedData = {
    speed: parseFloat(speed),
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(speedTopic, JSON.stringify(speedData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando de velocidade:', err);
      return res.status(500).json({ error: 'Erro ao enviar comando de velocidade' });
    }
    
    res.json({ 
      message: 'Velocidade de simulação alterada com sucesso',
      speed: speedData.speed
    });
  });
});

router.post('/simulation/pause', (req, res) => {
  // Publicar comando de pausa via MQTT
  const pauseTopic = 'ankom/control/pause';
  const pauseData = {
    command: 'pause',
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(pauseTopic, JSON.stringify(pauseData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando de pausa:', err);
      return res.status(500).json({ error: 'Erro ao enviar comando de pausa' });
    }
    
    res.json({ 
      message: 'Simulação pausada com sucesso',
      command: pauseData
    });
  });
});

router.post('/simulation/resume', (req, res) => {
  // Publicar comando de retomada via MQTT
  const resumeTopic = 'ankom/control/resume';
  const resumeData = {
    command: 'resume',
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(resumeTopic, JSON.stringify(resumeData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando de retomada:', err);
      return res.status(500).json({ error: 'Erro ao enviar comando de retomada' });
    }
    
    res.json({ 
      message: 'Simulação retomada com sucesso',
      command: resumeData
    });
  });
});
router.post('/flasks/:assay_id/:flask_id/relief', (req, res) => {
  const { assay_id, flask_id } = req.params;
  
  // Publica comando de alívio de pressão
  const reliefTopic = `rumen/${assay_id}/${flask_id}/control/relief`;
  const reliefData = {
    assay_id,
    flask_id: parseInt(flask_id),
    command: 'relief',
    reason: 'manual',
    timestamp: new Date().toISOString()
  };

  mqttClient.publish(reliefTopic, JSON.stringify(reliefData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando de alívio:', err);
      return res.status(500).json({ error: 'Erro ao enviar comando de alívio' });
    }
    
    res.json({ 
      message: 'Comando de alívio enviado com sucesso',
      command: reliefData
    });
  });
});

// Rotas de análise e relatórios
router.get('/analytics/:assay_id/kinetics', (req, res) => {
  const { assay_id } = req.params;
  const { flask_id } = req.query;
  
  // Simula cálculo de parâmetros cinéticos
  // Em produção, isso seria calculado com base nos dados reais
  const kinetics = {
    assay_id,
    flask_id: flask_id || 'all',
    gas_production_rate: 0.85, // mL/g DM/h
    lag_time: 2.3, // horas
    asymptotic_gas: 45.2, // mL/g DM
    model: 'Gompertz',
    r_squared: 0.987,
    calculated_at: new Date().toISOString()
  };
  
  res.json(kinetics);
});

router.get('/analytics/:assay_id/summary', (req, res) => {
  const { assay_id } = req.params;
  
  // Simula resumo do ensaio
  const summary = {
    assay_id,
    total_readings: 1440,
    duration_hours: 48,
    avg_pressure: 1.23, // bar
    max_pressure: 1.89, // bar
    relief_events: 3,
    temperature_variance: 0.8, // °C
    status: 'completed',
    generated_at: new Date().toISOString()
  };
  
  res.json(summary);
});

// Rotas de exportação
router.get('/export/:assay_id/csv', (req, res) => {
  const { assay_id } = req.params;
  
  // Simula exportação CSV
  const csvData = `timestamp,flask_id,P_bar_abs,T_C,P_bar_std,accum_bar_per_h,event
2024-01-15T10:00:00Z,1,1.023,39.2,1.000,0.023,normal
2024-01-15T10:15:00Z,1,1.045,39.1,1.000,0.022,normal
2024-01-15T10:30:00Z,1,1.067,39.0,1.000,0.022,normal
`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="ankom_rf_${assay_id}.csv"`);
  res.send(csvData);
});

// Novos endpoints para funcionalidades RR Rural Fermentation

// Configuração inicial de vasos com cálculos PV=nRT
router.post('/flasks/:assay_id/:flask_id/initial-config', [
  body('accumulated_pressure').isFloat({ min: 0, max: 10 }),
  body('total_volume').isFloat({ min: 100, max: 1000 }),
  body('solution_volume').isFloat({ min: 50, max: 300 }),
  body('temperature').isFloat({ min: 35, max: 45 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { assay_id, flask_id } = req.params;
  const { accumulated_pressure, total_volume, solution_volume, temperature } = req.body;
  
  // Cálculos PV=nRT
  const headspace_volume = (total_volume - solution_volume) / 1000; // Convert ml to L
  const temperature_kelvin = temperature + 273.15;
  const R = 0.08314; // L·bar/mol·K
  const moles = (accumulated_pressure * headspace_volume) / (R * temperature_kelvin);
  
  const configData = {
    assay_id,
    flask_id: parseInt(flask_id),
    accumulated_pressure,
    total_volume,
    solution_volume,
    temperature,
    headspace_volume,
    temperature_kelvin,
    moles,
    timestamp: new Date().toISOString()
  };

  // Publica configuração via MQTT
  const configTopic = `rumen/${assay_id}/${flask_id}/initial-config`;
  mqttClient.publish(configTopic, JSON.stringify(configData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar configuração inicial:', err);
      return res.status(500).json({ error: 'Erro ao enviar configuração inicial' });
    }
    
    res.json({ 
      message: 'Configuração inicial enviada com sucesso',
      config: configData
    });
  });
});

// Configuração de pressão de alívio
router.post('/assays/:assay_id/relief-config', [
  body('relief_pressure').isFloat({ min: 1.0, max: 5.0 }),
  body('warning_threshold').optional().isFloat({ min: 4.0, max: 5.0 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { assay_id } = req.params;
  const { relief_pressure, warning_threshold = 4.5 } = req.body;
  
  const configData = {
    assay_id,
    relief_pressure,
    warning_threshold,
    critical_warning: relief_pressure > 5.0,
    timestamp: new Date().toISOString()
  };

  // Publica configuração via MQTT
  const configTopic = `rumen/${assay_id}/relief-config`;
  mqttClient.publish(configTopic, JSON.stringify(configData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar configuração de alívio:', err);
      return res.status(500).json({ error: 'Erro ao enviar configuração de alívio' });
    }
    
    res.json({ 
      message: 'Configuração de alívio enviada com sucesso',
      config: configData,
      warning: relief_pressure > 5.0 ? 'ATENÇÃO: Pressão acima de 5 bar pode causar ruptura dos vasos!' : null
    });
  });
});

// START com delay de 10s e equalização de pressão
router.post('/assays/:assay_id/start-with-delay', (req, res) => {
  const { assay_id } = req.params;
  const { delay_seconds = 10 } = req.body;
  
  const startData = {
    assay_id,
    command: 'start_with_delay',
    delay_seconds,
    solenoid_state: 'open_during_delay',
    target_pressure: 1.0, // 1 bar após equalização
    timestamp: new Date().toISOString()
  };

  // Publica comando via MQTT
  const startTopic = `rumen/${assay_id}/control/start-with-delay`;
  mqttClient.publish(startTopic, JSON.stringify(startData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando start com delay:', err);
      return res.status(500).json({ error: 'Erro ao iniciar ensaio com delay' });
    }
    
    res.json({ 
      message: `Ensaio iniciado com ${delay_seconds}s de delay para equalização de pressão`,
      command: startData
    });
  });
});

// STOP individual por frasco com limite de tempo
router.post('/flasks/:assay_id/:flask_id/stop-with-limit', [
  body('duration_hours').isIn([12, 24, 36, 48, 60, 72]),
  body('purge_pressure').optional().isBoolean()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { assay_id, flask_id } = req.params;
  const { duration_hours, purge_pressure = true } = req.body;
  
  const stopData = {
    assay_id,
    flask_id: parseInt(flask_id),
    command: 'stop_with_limit',
    duration_hours,
    purge_pressure,
    solenoid_action: purge_pressure ? 'permanent_open' : 'closed',
    end_time: new Date(Date.now() + duration_hours * 3600 * 1000).toISOString(),
    timestamp: new Date().toISOString()
  };

  // Publica comando via MQTT
  const stopTopic = `rumen/${assay_id}/${flask_id}/control/stop-with-limit`;
  mqttClient.publish(stopTopic, JSON.stringify(stopData), { qos: 1 }, (err) => {
    if (err) {
      logger.error('Erro ao publicar comando stop com limite:', err);
      return res.status(500).json({ error: 'Erro ao parar frasco com limite' });
    }
    
    res.json({ 
      message: `Frasco ${flask_id} configurado para parar em ${duration_hours}h com purga de pressão`,
      command: stopData
    });
  });
});

// EMERGENCY SHUTDOWN - abre todos os solenoides
router.post('/assays/:assay_id/emergency-shutdown', (req, res) => {
  const { assay_id } = req.params;
  const { reason = 'emergency' } = req.body;
  
  const shutdownData = {
    assay_id,
    command: 'emergency_shutdown',
    reason,
    solenoid_action: 'permanent_open_all',
    safety_status: 'critical',
    timestamp: new Date().toISOString()
  };

  // Publica comando via MQTT
  const shutdownTopic = `rumen/${assay_id}/control/emergency-shutdown`;
  mqttClient.publish(shutdownTopic, JSON.stringify(shutdownData), { qos: 2 }, (err) => { // QoS 2 para garantia
    if (err) {
      logger.error('Erro ao publicar comando de shutdown:', err);
      return res.status(500).json({ error: 'Erro ao executar shutdown de emergência' });
    }
    
    res.json({ 
      message: 'SHUTDOWN DE EMERGÊNCIA EXECUTADO - Todas as válvulas abertas',
      command: shutdownData
    });
  });
});

// Exportação CSV com intervalos de 5 minutos
router.get('/export/:assay_id/detailed-csv', (req, res) => {
  const { assay_id } = req.params;
  const { flask_id, start_time, end_time } = req.query;
  
  // Simula dados com intervalos de 5 minutos
  const interval_minutes = 5;
  const data_points = [];
  
  // Gera 12 leituras por hora (a cada 5 minutos)
  for (let hour = 0; hour < 72; hour++) { // 72 horas máximo
    for (let minute = 0; minute < 60; minute += interval_minutes) {
      const timestamp = new Date(2024, 0, 15, 10 + hour, minute, 0).toISOString();
      const pressure = (1.0 + Math.random() * 0.5).toFixed(3);
      const temperature = (39.0 + Math.random() * 2 - 1).toFixed(1);
      
      data_points.push({
        timestamp,
        flask_id: flask_id || '1',
        pressure_bar: pressure,
        temperature_c: temperature,
        accumulated_pressure: (parseFloat(pressure) - 1.0).toFixed(3),
        event: 'normal'
      });
    }
  }
  
  // Converte para CSV
  const csvHeader = 'timestamp,flask_id,pressure_bar_abs,temperature_c,accumulated_pressure_bar,event\n';
  const csvRows = data_points.map(point => 
    `${point.timestamp},${point.flask_id},${point.pressure_bar},${point.temperature_c},${point.accumulated_pressure},${point.event}`
  ).join('\n');
  
  const csvData = csvHeader + csvRows;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="rr_rural_fermentation_${assay_id}_5min_intervals.csv"`);
  res.send(csvData);
});

// Rota para listar ensaios disponíveis
router.get('/assays/list', (req, res) => {
  const assays = [
    { id: 'all', name: 'Todos os ensaios' },
    { id: 'assay_1', name: 'Ensaio 1' },
    { id: 'assay_2', name: 'Ensaio 2' },
    { id: 'assay_3', name: 'Ensaio 3' },
    { id: 'assay_4', name: 'Ensaio 4' }
  ];
  
  res.json({ assays });
});

// Rota para obter configurações de temperatura
router.get('/temperature/units', (req, res) => {
  const { unit = 'celsius' } = req.query;
  
  res.json({
    current_unit: unit,
    available_units: ['celsius', 'kelvin'],
    conversion_factor: unit === 'kelvin' ? 273.15 : 0
  });
});
module.exports = router;