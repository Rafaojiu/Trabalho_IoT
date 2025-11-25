"""
Publicador MQTT simulando ESP32 para o sistema ANKOM RF
Publica dados de pressão e temperatura via MQTT
"""

import paho.mqtt.client as mqtt
import json
import time
import random
from datetime import datetime
from typing import Dict, List
import uuid
import argparse
from gompterz_model import MultiFlaskSimulator, GompertzModel

class ESP32Simulator:
    """
    Simulador ESP32 que publica dados de sensores via MQTT
    """
    
    def __init__(self, broker_host: str = "localhost", broker_port: int = 1883,
                 assay_id: str = "SAQ0505", num_flasks: int = 4):
        """
        Inicializa o simulador ESP32
        
        Args:
            broker_host: Host do broker MQTT
            broker_port: Porta do broker MQTT
            assay_id: Identificador do ensaio
            num_flasks: Número de frascos
        """
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.assay_id = assay_id
        self.num_flasks = num_flasks
        
        # Configura cliente MQTT
        self.client = mqtt.Client(client_id=f"esp32_simulator_{assay_id}")
        self.client.on_connect = self.on_connect
        self.client.on_publish = self.on_publish
        self.client.on_disconnect = self.on_disconnect
        
        # Estado do sistema
        self.connected = False
        self.flask_states = {}
        self.relief_threshold = 1.5  # bar
        
        # Inicializa simulador
        self.simulator = MultiFlaskSimulator()
        
    def on_connect(self, client, userdata, flags, rc):
        """Callback de conexão MQTT"""
        if rc == 0:
            self.connected = True
            print(f"✅ Conectado ao broker MQTT: {self.broker_host}:{self.broker_port}")
            
            # Se inscreve em tópicos de configuração
            for flask_id in range(1, self.num_flasks + 1):
                config_topic = f"rumen/{self.assay_id}/{flask_id}/config"
                self.client.subscribe(config_topic)
                print(f"📡 Inscrito em: {config_topic}")
        else:
            print(f"❌ Erro de conexão MQTT: {rc}")
            
    def on_publish(self, client, userdata, mid):
        """Callback de publicação MQTT"""
        print(f"📤 Mensagem publicada (ID: {mid})")
        
    def on_disconnect(self, client, userdata, rc):
        """Callback de desconexão MQTT"""
        self.connected = False
        print("🔌 Desconectado do broker MQTT")
        
    def on_message(self, client, userdata, message):
        """Callback de mensagem recebida"""
        try:
            payload = json.loads(message.payload.decode())
            topic_parts = message.topic.split('/')
            flask_id = int(topic_parts[2])
            
            print(f"⚙️  Configuração recebida para frasco {flask_id}: {payload}")
            
            # Atualiza configurações do frasco
            if flask_id not in self.flask_states:
                self.flask_states[flask_id] = {}
                
            if 'interval_minutes' in payload:
                self.flask_states[flask_id]['interval_minutes'] = payload['interval_minutes']
                
            if 'relief_threshold' in payload:
                self.flask_states[flask_id]['relief_threshold'] = payload['relief_threshold']
                
        except Exception as e:
            print(f"❌ Erro ao processar mensagem: {e}")
            
    def generate_sensor_data(self, flask_id: int, current_time: datetime) -> Dict:
        """
        Gera dados simulados para um frasco
        
        Args:
            flask_id: ID do frasco
            current_time: Tempo atual
            
        Returns:
            Dicionário com dados do sensor
        """
        # Cria modelo Gompertz para este frasco
        base_A = 0.85 + (flask_id - 1) * 0.05  # Variação entre frascos
        base_mu = 0.12 + (flask_id - 1) * 0.01
        base_lambda = 2.5 + (flask_id - 1) * 0.2
        
        model = GompertzModel(
            A=base_A,
            mu_m=base_mu,
            lam=base_lambda,
            baseline_pressure=1.0,
            temperature=39.0
        )
        
        # Calcula tempo decorrido desde o início (simulado)
        elapsed_hours = (current_time - datetime.now()).total_seconds() / 3600
        
        # Gera dados de sensores
        P_abs = model.pressure_at_time(elapsed_hours)
        T_C = 39.0 + random.normalvariate(0, 0.2)  # Temperatura com variação
        P_std = model.normalize_pressure(P_abs, T_C)
        
        # Calcula taxa de acumulação
        if flask_id in self.flask_states and 'prev_pressure' in self.flask_states[flask_id]:
            prev_P = self.flask_states[flask_id]['prev_pressure']
            prev_time = self.flask_states[flask_id]['prev_time']
            time_diff = (current_time - prev_time).total_seconds() / 3600  # horas
            if time_diff > 0:
                accum_rate = (P_abs - prev_P) / time_diff
            else:
                accum_rate = 0
        else:
            accum_rate = 0
            
        # Atualiza estado do frasco
        if flask_id not in self.flask_states:
            self.flask_states[flask_id] = {}
            
        self.flask_states[flask_id]['prev_pressure'] = P_abs
        self.flask_states[flask_id]['prev_time'] = current_time
        
        # Prepara payload MQTT
        payload = {
            'schema_version': 1,
            'msg_id': str(uuid.uuid4()),
            'assay_id': self.assay_id,
            'flask_id': flask_id,
            'timestamp': current_time.isoformat(),
            'P_bar_abs': round(P_abs, 3),
            'T_C': round(T_C, 1),
            'P_bar_std': round(P_std, 3),
            'accum_bar_per_h': round(accum_rate, 4)
        }
        
        # Verifica necessidade de alívio
        relief_threshold = self.flask_states.get(flask_id, {}).get('relief_threshold', self.relief_threshold)
        if P_abs >= relief_threshold:
            payload['event'] = 'relief'
            print(f"🚨 ALÍVIO ATIVADO - Frasco {flask_id}: {P_abs:.3f} bar")
            
        return payload
    
    def publish_telemetry(self, flask_id: int, data: Dict):
        """
        Publica dados de telemetria
        
        Args:
            flask_id: ID do frasco
            data: Dados a publicar
        """
        topic = f"rumen/{self.assay_id}/{flask_id}/telemetry"
        payload_json = json.dumps(data)
        
        result = self.client.publish(topic, payload_json, qos=1)
        
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            print(f"📊 Publicado: {topic} - P: {data['P_bar_abs']} bar, T: {data['T_C']}°C")
        else:
            print(f"❌ Erro ao publicar: {topic}")
            
    def publish_alert(self, flask_id: int, alert_type: str, message: str):
        """
        Publica alerta de segurança
        
        Args:
            flask_id: ID do frasco
            alert_type: Tipo de alerta
            message: Mensagem de alerta
        """
        topic = f"rumen/{self.assay_id}/{flask_id}/alert"
        
        alert_data = {
            'schema_version': 1,
            'msg_id': str(uuid.uuid4()),
            'assay_id': self.assay_id,
            'flask_id': flask_id,
            'timestamp': datetime.now().isoformat(),
            'alert_type': alert_type,
            'message': message,
            'severity': 'high' if 'relief' in alert_type else 'medium'
        }
        
        self.client.publish(topic, json.dumps(alert_data), qos=1)
        print(f"🚨 Alerta publicado: {alert_type} - {message}")
        
    def run_simulation(self, duration_hours: float = 48, interval_minutes: int = 15):
        """
        Executa simulação completa
        
        Args:
            duration_hours: Duração da simulação (horas)
            interval_minutes: Intervalo entre medições (minutos)
        """
        print(f"🚀 Iniciando simulação: {self.assay_id}")
        print(f"📊 Frascos: {self.num_flasks}, Duração: {duration_hours}h, Intervalo: {interval_minutes}min")
        
        # Conecta ao broker MQTT
        try:
            self.client.connect(self.broker_host, self.broker_port, 60)
            self.client.loop_start()
            
            # Aguarda conexão
            timeout = 10
            while not self.connected and timeout > 0:
                time.sleep(1)
                timeout -= 1
                
            if not self.connected:
                print("❌ Timeout de conexão MQTT")
                return
                
        except Exception as e:
            print(f"❌ Erro ao conectar ao broker MQTT: {e}")
            return
            
        # Loop principal de simulação
        start_time = datetime.now()
        end_time = start_time + timedelta(hours=duration_hours)
        
        measurement_count = 0
        
        try:
            while datetime.now() < end_time:
                current_time = datetime.now()
                
                # Publica dados para cada frasco
                for flask_id in range(1, self.num_flasks + 1):
                    sensor_data = self.generate_sensor_data(flask_id, current_time)
                    self.publish_telemetry(flask_id, sensor_data)
                    
                    # Verifica alertas
                    if sensor_data.get('event') == 'relief':
                        self.publish_alert(
                            flask_id, 
                            'pressure_relief',
                            f"Válvula de alívio ativada: {sensor_data['P_bar_abs']:.3f} bar"
                        )
                        
                measurement_count += 1
                
                # Aguarda próximo intervalo
                time.sleep(interval_minutes * 60)
                
        except KeyboardInterrupt:
            print("\n⏹️  Simulação interrompida pelo usuário")
            
        finally:
            # Desconecta
            self.client.loop_stop()
            self.client.disconnect()
            
            print(f"✅ Simulação finalizada. Total de medições: {measurement_count}")

def main():
    """
    Função principal com interface de linha de comando
    """
    parser = argparse.ArgumentParser(description='Simulador ESP32 para ANKOM RF')
    parser.add_argument('--broker', default='localhost', help='Host do broker MQTT')
    parser.add_argument('--port', type=int, default=1883, help='Porta do broker MQTT')
    parser.add_argument('--assay', default='SAQ0505', help='ID do ensaio')
    parser.add_argument('--flasks', type=int, default=4, help='Número de frascos')
    parser.add_argument('--duration', type=float, default=48, help='Duração em horas')
    parser.add_argument('--interval', type=int, default=15, help='Intervalo em minutos')
    
    args = parser.parse_args()
    
    # Cria e executa simulador
    simulator = ESP32Simulator(
        broker_host=args.broker,
        broker_port=args.port,
        assay_id=args.assay,
        num_flasks=args.flasks
    )
    
    simulator.run_simulation(
        duration_hours=args.duration,
        interval_minutes=args.interval
    )

if __name__ == "__main__":
    main()