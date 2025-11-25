# Simulador ANKOM RF - Modelo de Fermentação Ruminal
# Baseado no modelo Gompertz para simulação de produção de gases

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

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class GompertzModel:
    """
    Modelo Gompertz para simulação de produção de gases na fermentação ruminal
    """
    def __init__(self, A=2.0, B=0.1, C=0.5, baseline=1.0):
        """
        A: Assintota máxima (pressão máxima em bar)
        B: Taxa de crescimento exponencial
        C: Deslocamento temporal (fase de latência)
        baseline: Pressão inicial (bar)
        """
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

class ANKOMSimulator:
    """
    Simulador completo do sistema ANKOM RF
    """
    def __init__(self, config):
        self.config = config
        self.flasks = {}
        self.mqtt_client = None
        self.running = False
        self.threads = []
        self.time_warp = 1.0  # Fator de aceleração de tempo
        self.paused = False
        
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
                'sim_hours': 0.0,
                'last_relief': datetime.now(),
                'relief_count': 0,
                'temperature': 39.0,  # Temperatura base 39°C
                'baseline_pressure': 1.0  # Pressão inicial 1.0 bar
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
            # Tópicos de controle
            client.subscribe("ankom/control/#")
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
        try:
            payload = json.loads(message.payload.decode())
            topic = message.topic
            
            # Comandos de controle de tempo existentes
            if topic.startswith("ankom/control/speed"):
                speed = float(payload.get('speed', 1.0))
                self.time_warp = max(1.0, speed)
                logger.info(f"⚡ Acelerando simulação: {self.time_warp}x")
            elif topic.startswith("ankom/control/pause"):
                self.paused = True
                logger.info("⏸️ Simulação pausada")
            elif topic.startswith("ankom/control/resume"):
                self.paused = False
                logger.info("▶️ Simulação retomada")
            
            # Novos comandos RR Rural Fermentation
            elif topic.startswith("rumen/"):
                self.handle_rumen_control(topic, payload)
                
        except Exception as e:
            logger.error(f"Erro ao processar controle MQTT: {e}")
    
    def handle_rumen_control(self, topic, payload):
        """
        Processar comandos específicos do RR Rural Fermentation
        """
        try:
            # START com delay e equalização
            if topic.endswith("/control/start-with-delay"):
                delay_seconds = payload.get('delay_seconds', 10)
                self.handle_start_with_delay(payload['assay_id'], delay_seconds)
            
            # STOP individual com limite de tempo
            elif topic.endswith("/control/stop-with-limit"):
                self.handle_stop_with_limit(
                    payload['assay_id'], 
                    payload['flask_id'], 
                    payload['duration_hours']
                )
            
            # EMERGENCY SHUTDOWN
            elif topic.endswith("/control/emergency-shutdown"):
                self.handle_emergency_shutdown(payload['assay_id'])
            
            # Configuração de alívio de pressão
            elif topic.endswith("/relief-config"):
                self.handle_relief_config(payload['assay_id'], payload)
            
            # Configuração inicial de vasos
            elif topic.endswith("/initial-config"):
                self.handle_flask_initial_config(payload)
                
        except Exception as e:
            logger.error(f"Erro ao processar comando rumen: {e}")
    
    def handle_start_with_delay(self, assay_id, delay_seconds):
        """
        START com delay para equalização de pressão
        """
        logger.info(f"🔄 Iniciando ensaio {assay_id} com delay de {delay_seconds}s")
        
        # Abrir solenoides para equalização
        for flask_id in self.flasks:
            if self.flasks[flask_id]['assay_id'] == assay_id:
                logger.info(f"  📭 Abrindo solenoide do frasco {flask_id} para equalização")
                # Simular abertura de solenoide
                self.flasks[flask_id]['solenoid_open'] = True
        
        # Aguardar delay
        time.sleep(delay_seconds)
        
        # Fechar solenoides e iniciar medição
        for flask_id in self.flasks:
            if self.flasks[flask_id]['assay_id'] == assay_id:
                logger.info(f"  🔒 Fechando solenoide do frasco {flask_id}, pressão ajustada para 1.0 bar")
                self.flasks[flask_id]['solenoid_open'] = False
                self.flasks[flask_id]['baseline_pressure'] = 1.0
        
        logger.info(f"✅ Ensaio {assay_id} iniciado com sucesso após equalização")
    
    def handle_stop_with_limit(self, assay_id, flask_id, duration_hours):
        """
        STOP individual com limite de tempo e purga de pressão
        """
        logger.info(f"⏹️ Configurando parada do frasco {flask_id} do ensaio {assay_id} em {duration_hours}h")
        
        # Agendar parada futura (em produção, usar sistema de agendamento real)
        def scheduled_stop():
            end_time = datetime.now() + timedelta(hours=duration_hours)
            logger.info(f"  ⏰ Parada agendada para {end_time}")
            
            # Quando chegar a hora, abrir solenoide permanentemente
            if flask_id in self.flasks:
                logger.info(f"  📭 Abrindo solenoide do frasco {flask_id} permanentemente para purga")
                self.flasks[flask_id]['solenoid_open'] = True
                self.flasks[flask_id]['permanent_purge'] = True
        
        # Iniciar thread para agendamento (simulação)
        threading.Thread(target=lambda: (time.sleep(duration_hours * 3600), scheduled_stop())).start()
    
    def handle_emergency_shutdown(self, assay_id):
        """
        EMERGENCY SHUTDOWN - abre todos os solenoides
        """
        logger.error(f"🚨 EMERGENCY SHUTDOWN para ensaio {assay_id}")
        
        for flask_id in self.flasks:
            if self.flasks[flask_id]['assay_id'] == assay_id:
                logger.info(f"  📭 Abrindo solenoide do frasco {flask_id} - EMERGÊNCIA")
                self.flasks[flask_id]['solenoid_open'] = True
                self.flasks[flask_id]['emergency_mode'] = True
        
        logger.error(f"⚠️ Todos os solenoides abertos - Pressão sendo purgada")
    
    def handle_relief_config(self, assay_id, config):
        """
        Configurar parâmetros de alívio de pressão
        """
        relief_pressure = config.get('relief_pressure', 1.5)
        warning_threshold = config.get('warning_threshold', 4.5)
        
        logger.info(f"🔧 Configurando alívio para ensaio {assay_id}")
        logger.info(f"  📊 Pressão de alívio: {relief_pressure} bar")
        logger.info(f"  ⚠️  Limite de aviso: {warning_threshold} bar")
        
        if relief_pressure > 5.0:
            logger.error(f"  🚨 ATENÇÃO: Pressão de alívio acima de 5 bar pode causar ruptura!")
        
        # Atualizar configuração de alívio para todos os frascos do ensaio
        for flask_id in self.flasks:
            if self.flasks[flask_id]['assay_id'] == assay_id:
                self.flasks[flask_id]['relief_threshold'] = relief_pressure
                self.flasks[flask_id]['warning_threshold'] = warning_threshold
    
    def handle_flask_initial_config(self, config):
        """
        Processar configuração inicial de vaso com cálculos PV=nRT
        """
        flask_id = config.get('flask_id')
        accumulated_pressure = config.get('accumulated_pressure', 0)
        total_volume = config.get('total_volume', 350)
        solution_volume = config.get('solution_volume', 200)
        temperature = config.get('temperature', 39.0)
        
        logger.info(f"🔧 Configurando vaso inicial do frasco {flask_id}")
        logger.info(f"  📊 Pressão acumulada: {accumulated_pressure} bar")
        logger.info(f"  📏 Volume total: {total_volume} ml")
        logger.info(f"  💧 Volume de solução: {solution_volume} ml")
        logger.info(f"  🌡️  Temperatura: {temperature}°C")
        
        # Cálculos PV=nRT
        headspace_volume = (total_volume - solution_volume) / 1000  # Convert ml to L
        temperature_kelvin = temperature + 273.15
        R = 0.08314  # L·bar/mol·K
        moles = (accumulated_pressure * headspace_volume) / (R * temperature_kelvin)
        
        logger.info(f"  📐 Volume do headspace: {headspace_volume:.3f} L")
        logger.info(f"  🌡️  Temperatura Kelvin: {temperature_kelvin:.2f} K")
        logger.info(f"  🔬 Número de mols: {moles:.6f} mol")
        
        # Atualizar configuração do frasco
        if flask_id in self.flasks:
            self.flasks[flask_id]['accumulated_pressure'] = accumulated_pressure
            self.flasks[flask_id]['total_volume'] = total_volume
            self.flasks[flask_id]['solution_volume'] = solution_volume
            self.flasks[flask_id]['temperature'] = temperature
            self.flasks[flask_id]['headspace_volume'] = headspace_volume
            self.flasks[flask_id]['moles'] = moles
            self.flasks[flask_id]['temperature_kelvin'] = temperature_kelvin
    
    def calculate_thermal_normalization(self, pressure, temperature):
        """
        Normalização térmica pela lei dos gases ideais
        P_std = P_meas * 273.15 / (T_C + 273.15)
        """
        return pressure * 273.15 / (temperature + 273.15)
    
    def calculate_gas_production_rate(self, flask_id, current_pressure, time_elapsed):
        """
        Calcular taxa de produção de gases (bar/h)
        """
        flask = self.flasks[flask_id]
        
        if not hasattr(flask, 'last_pressure'):
            flask['last_pressure'] = current_pressure
            flask['last_time'] = time_elapsed
            return 0.0
        
        time_diff = (time_elapsed - flask['last_time']).total_seconds() / 3600  # horas
        pressure_diff = current_pressure - flask['last_pressure']
        
        rate = pressure_diff / time_diff if time_diff > 0 else 0.0
        
        # Atualizar últimos valores
        flask['last_pressure'] = current_pressure
        flask['last_time'] = time_elapsed
        
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
        
        # Tempo decorrido desde o início (horas)
        time_elapsed = (datetime.now() - flask['start_time']).total_seconds() / 3600
        
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
        virtual_timestamp = flask['start_time'] + timedelta(hours=time_elapsed)
        production_rate = self.calculate_gas_production_rate(flask_id, pressure, virtual_timestamp)
        
        # Criar payload MQTT
        payload = {
            "schema_version": 1,
            "msg_id": str(uuid.uuid4()),
            "assay_id": flask['assay_id'],
            "flask_id": flask_id,
            "ts": virtual_timestamp.isoformat() + "Z",
            "P_bar_abs": round(pressure, 3),
            "T_C": round(temperature, 1),
            "P_bar_std": round(pressure_std, 3),
            "accum_bar_per_h": round(production_rate, 4),
            "relief_count": flask['relief_count'],
            "time_elapsed_h": round(time_elapsed, 2)
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
                logger.info(f"Dados publicados: Frasco {flask_id} - Pressão: {data['P_bar_abs']} bar, Temp: {data['T_C']}°C")
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
                if self.paused:
                    time.sleep(0.1)
                    continue

                # Avançar tempo virtual
                self.flasks[flask_id]['sim_hours'] += (self.config['sampling_interval'] / 60.0)

                telemetry_data = self.generate_telemetry_data(flask_id)
                self.publish_telemetry(flask_id, telemetry_data)

                sleep_seconds = max(0.05, (self.config['sampling_interval'] * 60) / self.time_warp)
                time.sleep(sleep_seconds)
                
            except Exception as e:
                logger.error(f"Erro na simulação do frasco {flask_id}: {e}")
                time.sleep(10)  # Esperar antes de tentar novamente
    
    def start_simulation(self):
        """
        Iniciar simulação de todos os frascos
        """
        logger.info("Iniciando simulação ANKOM RF")
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
        
        logger.info(f"Simulação iniciada com {len(self.flasks)} frascos")
    
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

def main():
    """
    Função principal
    """
    parser = argparse.ArgumentParser(description='Simulador ANKOM RF IoT')
    parser.add_argument('--flasks', type=int, default=4, help='Número de frascos (1-30)')
    parser.add_argument('--interval', type=int, default=15, help='Intervalo de amostragem (1-120 min)')
    parser.add_argument('--duration', type=int, default=48, help='Duração da simulação (horas)')
    parser.add_argument('--relief-threshold', type=float, default=1.5, help='Threshold de alívio (bar)')
    parser.add_argument('--mqtt-broker', default='localhost', help='Endereço do broker MQTT')
    parser.add_argument('--mqtt-port', type=int, default=1883, help='Porta MQTT')
    
    args = parser.parse_args()
    
    # Validar parâmetros
    if not (1 <= args.flasks <= 30):
        parser.error("Número de frascos deve ser entre 1 e 30")
    
    if not (1 <= args.interval <= 120):
        parser.error("Intervalo deve ser entre 1 e 120 minutos")
    
    # Configuração
    config = {
        'num_flasks': args.flasks,
        'sampling_interval': args.interval,
        'simulation_duration': args.duration,
        'relief_threshold': args.relief_threshold,
        'mqtt_broker': args.mqtt_broker,
        'mqtt_port': args.mqtt_port
    }
    
    logger.info(f"Configuração: {config}")
    
    try:
        # Criar e iniciar simulador
        simulator = ANKOMSimulator(config)
        simulator.start_simulation()
        
        # Rodar por tempo especificado
        logger.info(f"Simulação rodando por {args.duration} horas...")
        time.sleep(args.duration * 3600)
        
        # Parar simulação
        simulator.stop_simulation()
        
    except KeyboardInterrupt:
        logger.info("Simulação interrompida pelo usuário")
        simulator.stop_simulation()
    except Exception as e:
        logger.error(f"Erro na simulação: {e}")
        if 'simulator' in locals():
            simulator.stop_simulation()

if __name__ == "__main__":
    main()