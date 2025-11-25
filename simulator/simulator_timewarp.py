# Simulador ANKOM RF com Time Warp - Aceleração de Tempo
# Baseado no modelo Gompertz com suporte a diferentes velocidades de simulação

import json
import time
import random
import uuid
from datetime import datetime, timedelta
import paho.mqtt.client as mqtt
import numpy as np
from scipy.optimize import curve_fit
import threading
import argparse
import logging
import signal
import sys

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TimeWarpSimulator:
    """
    Gerenciador de tempo com aceleração para simulação rápida
    """
    def __init__(self, speed_multiplier=1.0):
        self.speed_multiplier = speed_multiplier
        self.start_real_time = datetime.now()
        self.start_sim_time = datetime.now()
        self.paused = False
        self.pause_time = 0
        
    def get_simulated_time(self):
        """
        Obter tempo simulado baseado na aceleração
        """
        if self.paused:
            return self.pause_time
            
        real_elapsed = (datetime.now() - self.start_real_time).total_seconds()
        sim_elapsed = real_elapsed * self.speed_multiplier
        return self.start_sim_time + timedelta(seconds=sim_elapsed)
    
    def set_speed(self, speed_multiplier):
        """
        Alterar velocidade de simulação
        """
        # Recalcular tempos base para manter consistência
        current_sim_time = self.get_simulated_time()
        self.start_real_time = datetime.now()
        self.start_sim_time = current_sim_time - timedelta(seconds=0)
        self.speed_multiplier = speed_multiplier
        logger.info(f"Velocidade de simulação alterada para {speed_multiplier}x")
    
    def pause(self):
        """
        Pausar simulação
        """
        if not self.paused:
            self.pause_time = self.get_simulated_time()
            self.paused = True
    
    def resume(self):
        """
        Retomar simulação
        """
        if self.paused:
            self.paused = False
            # Recalcular tempos base
            self.start_real_time = datetime.now()
            self.start_sim_time = self.pause_time

class GompertzModel:
    """
    Modelo Gompertz para simulação de produção de gases
    """
    def __init__(self, A=2.0, B=0.1, C=0.5, baseline=1.0):
        self.A = A  # Pressão máxima ~2.0 bar
        self.B = B  # Taxa de crescimento
        self.C = C  # Fase de latência
        self.baseline = baseline  # Pressão inicial 1.0 bar
        
    def gompertz(self, t):
        """
        Função Gompertz: P(t) = baseline + A * exp(-exp(B * (C - t)))
        """
        return self.baseline + self.A * np.exp(-np.exp(self.B * (self.C - t)))
    
    def gompertz_with_noise(self, t, noise_level=0.01):
        """
        Gompertz com ruído gaussiano controlado
        """
        pure_value = self.gompertz(t)
        noise = np.random.normal(0, noise_level * pure_value)
        return max(0.5, pure_value + noise)  # Limitar valor mínimo

class ANKOMTimeWarpSimulator:
    """
    Simulador ANKOM RF com suporte a aceleração de tempo
    """
    def __init__(self, config):
        self.config = config
        self.flasks = {}
        self.mqtt_client = None
        self.running = False
        self.threads = []
        self.time_warp = TimeWarpSimulator(config.get('speed_multiplier', 1.0))
        
        # Inicializar frascos
        self.initialize_flasks()
        
        # Conectar ao MQTT
        self.setup_mqtt()
        
    def initialize_flasks(self):
        """
        Inicializar frascos com parâmetros diferentes
        """
        flask_configs = [
            {"A": 1.8, "B": 0.12, "C": 0.4},  # Feno de alta qualidade
            {"A": 1.5, "B": 0.08, "C": 0.6},  # Silagem de milho
            {"A": 2.0, "B": 0.15, "C": 0.3},  # Ração concentrada
            {"A": 1.2, "B": 0.06, "C": 0.8}   # Palha de baixa qualidade
        ]
        
        for i in range(self.config['num_flasks']):
            flask_id = i + 1
            assay_id = f"SAQ{datetime.now().strftime('%m%d')}"
            
            # Usar configuração cíclica ou aleatória
            config_idx = i % len(flask_configs)
            gompertz_params = flask_configs[config_idx]
            
            self.flasks[flask_id] = {
                'assay_id': assay_id,
                'model': GompertzModel(**gompertz_params),
                'start_time': datetime.now(),
                'last_relief': datetime.now(),
                'relief_count': 0,
                'temperature': 39.0,  # Temperatura base 39°C
                'baseline_pressure': 1.0,  # Pressão inicial 1.0 bar
                'last_pressure': 1.0,
                'last_time': 0
            }
            
            logger.info(f"Frasco {flask_id} inicializado: A={gompertz_params['A']}, B={gompertz_params['B']}, C={gompertz_params['C']}")
    
    def setup_mqtt(self):
        """
        Configurar cliente MQTT
        """
        self.mqtt_client = mqtt.Client()
        self.mqtt_client.on_connect = self.on_connect
        self.mqtt_client.on_disconnect = self.on_disconnect
        self.mqtt_client.on_message = self.on_message
        
        try:
            self.mqtt_client.connect(self.config['mqtt_broker'], self.config['mqtt_port'], 60)
            logger.info(f"Conectado ao MQTT broker: {self.config['mqtt_broker']}:{self.config['mqtt_port']}")
        except Exception as e:
            logger.error(f"Erro ao conectar ao MQTT: {e}")
            raise
    
    def on_connect(self, client, userdata, flags, rc):
        """
        Callback de conexão MQTT
        """
        if rc == 0:
            logger.info("Conectado ao broker MQTT com sucesso")
            # Inscrever em tópicos de configuração
            client.subscribe("ankom/config/+/set")
            client.subscribe("ankom/control/speed")
            client.subscribe("ankom/control/pause")
            client.subscribe("ankom/control/resume")
        else:
            logger.error(f"Falha na conexão MQTT. Código: {rc}")
    
    def on_disconnect(self, client, userdata, rc):
        """
        Callback de desconexão MQTT
        """
        logger.warning("Desconectado do broker MQTT")
        if rc != 0:
            logger.error("Desconexão inesperada. Tentando reconectar...")
    
    def on_message(self, client, userdata, message):
        """
        Callback de mensagem MQTT
        """
        try:
            payload = json.loads(message.payload.decode())
            topic = message.topic
            
            logger.info(f"Mensagem recebida no tópico {topic}: {payload}")
            
            if topic == "ankom/control/speed":
                speed = payload.get('speed', 1.0)
                self.time_warp.set_speed(speed)
            elif topic == "ankom/control/pause":
                self.time_warp.pause()
            elif topic == "ankom/control/resume":
                self.time_warp.resume()
                
        except Exception as e:
            logger.error(f"Erro ao processar mensagem MQTT: {e}")
    
    def calculate_thermal_normalization(self, pressure, temperature):
        """
        Normalização térmica pela lei dos gases ideais
        """
        return pressure * 273.15 / (temperature + 273.15)
    
    def calculate_gas_production_rate(self, flask_id, current_pressure, sim_time):
        """
        Calcular taxa de produção de gases (bar/h)
        """
        flask = self.flasks[flask_id]
        
        if 'last_pressure' not in flask or 'last_sim_time' not in flask:
            flask['last_pressure'] = current_pressure
            flask['last_sim_time'] = sim_time
            return 0.0
        
        time_diff = (sim_time - flask['last_sim_time']).total_seconds() / 3600  # horas
        pressure_diff = current_pressure - flask['last_pressure']
        
        rate = pressure_diff / time_diff if time_diff > 0 else 0.0
        
        # Atualizar últimos valores
        flask['last_pressure'] = current_pressure
        flask['last_sim_time'] = sim_time
        
        return rate
    
    def check_pressure_relief(self, flask_id, current_pressure):
        """
        Verificar necessidade de alívio de pressão
        """
        threshold = self.config['relief_threshold']
        
        if current_pressure > threshold:
            logger.warning(f"ALERTA: Pressão alta no frasco {flask_id}: {current_pressure:.2f} bar > {threshold} bar")
            
            # Simular alívio de pressão
            self.flasks[flask_id]['relief_count'] += 1
            self.flasks[flask_id]['last_relief'] = datetime.now()
            
            # Reduzir pressão para valor seguro
            new_pressure = threshold - 0.1
            logger.info(f"Alívio ativado no frasco {flask_id}. Pressão reduzida para {new_pressure:.2f} bar")
            
            return True, new_pressure
        
        return False, current_pressure
    
    def generate_telemetry_data(self, flask_id):
        """
        Gerar dados de telemetria para um frasco
        """
        flask = self.flasks[flask_id]
        
        # Obter tempo simulado
        sim_time = self.time_warp.get_simulated_time()
        
        # Tempo decorrido desde o início (horas)
        time_elapsed = (sim_time - flask['start_time']).total_seconds() / 3600
        
        # Gerar pressão com modelo Gompertz + ruído
        pressure = flask['model'].gompertz_with_noise(time_elapsed, noise_level=0.01)
        
        # Adicionar variação de temperatura realista
        temperature_variation = np.random.normal(0, 0.5)
        temperature = max(38.0, min(40.0, flask['temperature'] + temperature_variation))
        
        # Verificar alívio de pressão
        relief_triggered, pressure = self.check_pressure_relief(flask_id, pressure)
        
        # Normalização térmica
        pressure_std = self.calculate_thermal_normalization(pressure, temperature)
        
        # Calcular taxa de produção
        production_rate = self.calculate_gas_production_rate(flask_id, pressure, sim_time)
        
        # Criar payload MQTT
        payload = {
            "schema_version": 1,
            "msg_id": str(uuid.uuid4()),
            "assay_id": flask['assay_id'],
            "flask_id": flask_id,
            "ts": sim_time.isoformat() + "Z",
            "P_bar_abs": round(pressure, 3),
            "T_C": round(temperature, 1),
            "P_bar_std": round(pressure_std, 3),
            "accum_bar_per_h": round(production_rate, 4),
            "relief_count": flask['relief_count'],
            "time_elapsed_h": round(time_elapsed, 2),
            "speed_multiplier": self.time_warp.speed_multiplier
        }
        
        # Adicionar evento de alívio se necessário
        if relief_triggered:
            payload["event"] = "relief"
        
        return payload
    
    def publish_telemetry(self, flask_id, data):
        """
        Publicar dados de telemetria via MQTT
        """
        topic = f"ankom/{data['assay_id']}/flask{flask_id}/telemetry"
        
        try:
            payload_json = json.dumps(data)
            result = self.mqtt_client.publish(topic, payload_json, qos=1)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f"Dados publicados: Frasco {flask_id} - Pressão: {data['P_bar_abs']} bar, Temp: {data['T_C']}°C, Speed: {data['speed_multiplier']}x")
            else:
                logger.error(f"Falha ao publicar dados do frasco {flask_id}")
                
        except Exception as e:
            logger.error(f"Erro ao publicar MQTT: {e}")
    
    def simulate_flask(self, flask_id):
        """
        Thread de simulação para um frasco específico
        """
        logger.info(f"Iniciando simulação do frasco {flask_id}")
        
        while self.running:
            try:
                # Verificar se está pausado
                if self.time_warp.paused:
                    time.sleep(0.1)
                    continue
                
                # Gerar dados de telemetria
                telemetry_data = self.generate_telemetry_data(flask_id)
                
                # Publicar via MQTT
                self.publish_telemetry(flask_id, telemetry_data)
                
                # Calcular intervalo de espera baseado na velocidade
                base_interval = self.config['sampling_interval'] * 60  # segundos
                adjusted_interval = base_interval / self.time_warp.speed_multiplier
                
                # Limitar intervalo mínimo para não sobrecarregar o sistema
                actual_interval = max(0.1, adjusted_interval)
                
                time.sleep(actual_interval)
                
            except Exception as e:
                logger.error(f"Erro na simulação do frasco {flask_id}: {e}")
                time.sleep(1)  # Esperar antes de tentar novamente
    
    def start_simulation(self):
        """
        Iniciar simulação de todos os frascos
        """
        logger.info("Iniciando simulação ANKOM RF com Time Warp")
        self.running = True
        
        # Iniciar thread MQTT
        self.mqtt_client.loop_start()
        
        # Criar threads para cada frasco
        for flask_id in self.flasks.keys():
            thread = threading.Thread(target=self.simulate_flask, args=(flask_id,))
            thread.daemon = True
            thread.start()
            self.threads.append(thread)
            logger.info(f"Thread iniciada para frasco {flask_id}")
        
        logger.info(f"Simulação iniciada com {len(self.flasks)} frascos, velocidade: {self.time_warp.speed_multiplier}x")
    
    def stop_simulation(self):
        """
        Parar simulação
        """
        logger.info("Parando simulação ANKOM RF")
        self.running = False
        
        # Parar MQTT
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        
        # Aguardar threads terminarem
        for thread in self.threads:
            thread.join(timeout=5)
        
        logger.info("Simulação finalizada")

def signal_handler(sig, frame):
    """
    Handler para sinal de interrupção (Ctrl+C)
    """
    logger.info("Simulação interrompida pelo usuário")
    if 'simulator' in globals():
        simulator.stop_simulation()
    sys.exit(0)

def main():
    """
    Função principal
    """
    parser = argparse.ArgumentParser(description='Simulador ANKOM RF IoT com Time Warp')
    parser.add_argument('--flasks', type=int, default=4, help='Número de frascos (1-30)')
    parser.add_argument('--interval', type=int, default=15, help='Intervalo de amostragem (1-120 min)')
    parser.add_argument('--duration', type=int, default=48, help='Duração da simulação (horas)')
    parser.add_argument('--speed', type=float, default=1.0, help='Velocidade de simulação (multiplicador)')
    parser.add_argument('--relief-threshold', type=float, default=1.5, help='Threshold de alívio (bar)')
    parser.add_argument('--mqtt-broker', default='localhost', help='Endereço do broker MQTT')
    parser.add_argument('--mqtt-port', type=int, default=1883, help='Porta MQTT')
    
    args = parser.parse_args()
    
    # Validar parâmetros
    if not (1 <= args.flasks <= 30):
        parser.error("Número de frascos deve ser entre 1 e 30")
    
    if not (1 <= args.interval <= 120):
        parser.error("Intervalo deve ser entre 1 e 120 minutos")
    
    if args.speed <= 0:
        parser.error("Velocidade deve ser maior que zero")
    
    # Configuração
    config = {
        'num_flasks': args.flasks,
        'sampling_interval': args.interval,
        'simulation_duration': args.duration,
        'speed_multiplier': args.speed,
        'relief_threshold': args.relief_threshold,
        'mqtt_broker': args.mqtt_broker,
        'mqtt_port': args.mqtt_port
    }
    
    logger.info(f"Configuração: {config}")
    
    # Configurar handler para sinal de interrupção
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        # Criar e iniciar simulador
        global simulator
        simulator = ANKOMTimeWarpSimulator(config)
        simulator.start_simulation()
        
        # Rodar por tempo especificado ou indefinidamente
        if args.duration > 0:
            logger.info(f"Simulação rodando por {args.duration} horas...")
            time.sleep(args.duration * 3600 / args.speed)  # Ajustar tempo real pela velocidade
        else:
            logger.info("Simulação rodando indefinidamente. Pressione Ctrl+C para parar.")
            while True:
                time.sleep(1)
        
        # Parar simulação
        simulator.stop_simulation()
        
    except KeyboardInterrupt:
        logger.info("Simulação interrompida pelo usuário")
        if 'simulator' in locals():
            simulator.stop_simulation()
    except Exception as e:
        logger.error(f"Erro na simulação: {e}")
        if 'simulator' in locals():
            simulator.stop_simulation()

if __name__ == "__main__":
    main()