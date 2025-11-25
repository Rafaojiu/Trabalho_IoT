import paho.mqtt.client as mqtt
import json
import time
import numpy as np
from datetime import datetime, timedelta

# ========================
# CONFIGURAÇÃO
# ========================
BROKER = "localhost"
PORT = 1883
# Sem username/password (você deixou em branco)

ASSAY_ID = "ensaio_001"
NUM_FRASCOS = 4
THRESHOLD = 1.5  # bar (limite para alívio)

# Parâmetros Gompertz (SAQ0505 - alta produção)
PARAMS = {'A': 200, 'mu': 0.06, 'lambda_': 10}
R_BARL = 0.08314
V_HEAD = 0.16
T0_K = 273.15
BASELINE_P = 1.00
BASELINE_T = 39.0

# ========================
# FUNÇÕES
# ========================

def gompertz(t, A, mu, lambda_):
    """Modelo de Gompertz para produção de gases"""
    return A * np.exp(-np.exp(mu * (lambda_ - t) / A))

def calcular_pressao(t_h, frasco_id, seed=42):
    """Calcula pressão e temperatura para um frasco em um tempo t"""
    np.random.seed(seed + frasco_id + int(t_h * 10))
    
    # Volume de gás (Gompertz)
    V_mL = gompertz(t_h, **PARAMS)
    V_mL += np.random.normal(0, 0.05 * max(V_mL, 1))  # Ruído ±5%
    
    # Temperatura com variação
    T_C = BASELINE_T + np.random.normal(0, 0.5)
    T_K = T_C + T0_K
    
    # Pressão absoluta
    n = (V_mL / 1000.0) / 22.414  # mols
    P_bar = (n * R_BARL * T_K) / V_HEAD
    if P_bar < BASELINE_P:
        P_bar = BASELINE_P
    
    # Correção térmica (normalização para 0°C)
    P_corr = P_bar * (T0_K / T_K)
    
    return P_corr, T_C, V_mL

def criar_payload(frasco_id, t_h, P_prev, relief_counts, ts_base):
    """Cria payload no formato esperado"""
    P_corr, T_C, V_mL = calcular_pressao(t_h, frasco_id)
    
    # Calcula acumulação por hora
    if P_prev is not None:
        acum_hora = (P_corr - P_prev) / 0.25  # Intervalo de 15min = 0.25h
    else:
        acum_hora = 0.00
    
    # Verifica evento de alívio
    evento = None
    relief_count = relief_counts.get(frasco_id, 0)
    
    if P_corr > THRESHOLD:
        evento = "relief"
        relief_count += 1
        P_corr *= 0.90  # Reduz 10% após alívio
        relief_counts[frasco_id] = relief_count
    
    # Timestamp simulado (baseado no tempo virtual, não real)
    ts_virtual = ts_base + timedelta(hours=t_h)
    ts_utc = ts_virtual.strftime("%Y-%m-%dT%H:%M:%SZ")
    
    payload = {
        "msg_id": f"msg_t{int(t_h):03d}_f{frasco_id}",
        "assay_id": ASSAY_ID,
        "flask_id": frasco_id,
        "ts": ts_utc,
        "P_bar_abs": round(P_corr, 2),
        "T_C": round(T_C, 1),
        "P_bar_std": round(P_corr, 2),
        "accum_bar_per_h": round(acum_hora, 2),
        "relief_count": relief_count,
        "event": evento
    }
    
    return payload, P_corr

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("✅ Conectado ao broker MQTT\n")
    else:
        print(f"❌ Falha na conexão. Código: {rc}\n")

def simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=120):
    """
    Simula fermentação ruminal
    
    duracao_h: Duração VIRTUAL da simulação (padrão 48h)
    intervalo_min: Intervalo VIRTUAL entre leituras (padrão 15min)
    tempo_real_segundos: Tempo REAL que a simulação vai durar (ex: 120 = 2 minutos)
    """
    client = mqtt.Client(client_id=f"RumenSim_{ASSAY_ID}")
    client.on_connect = on_connect
    
    try:
        # Calcula a velocidade
        intervalo_h = intervalo_min / 60.0
        num_pontos = int(duracao_h / intervalo_h)
        delay_real = tempo_real_segundos / num_pontos  # segundos entre cada publicação
        
        velocidade = (duracao_h * 3600) / tempo_real_segundos  # fator de aceleração
        
        print("="*70)
        print(" 🧪 SIMULADOR DE FERMENTAÇÃO RUMINAL - 4 FRASCOS")
        print(f" Usuário: Rafaojiu")
        print(f" Data/Hora Real: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("="*70)
        print(f"\n📋 Parâmetros:")
        print(f"   Ensaio: {ASSAY_ID}")
        print(f"   Frascos: {NUM_FRASCOS}")
        print(f"   Duração VIRTUAL: {duracao_h}h ({num_pontos} pontos)")
        print(f"   Intervalo VIRTUAL: {intervalo_min} min")
        print(f"   Duração REAL: {tempo_real_segundos}s ({tempo_real_segundos/60:.1f} min)")
        print(f"   Velocidade: {velocidade:.0f}x (48h em {tempo_real_segundos/60:.1f} min)")
        print(f"   Delay entre publicações: {delay_real:.2f}s")
        print(f"   Threshold alívio: {THRESHOLD} bar\n")
        
        # Conecta
        print("🔌 Conectando ao broker...")
        client.connect(BROKER, PORT, 60)
        client.loop_start()
        time.sleep(1)
        
        # Estado inicial
        P_prev = {i: None for i in range(1, NUM_FRASCOS + 1)}
        relief_counts = {i: 0 for i in range(1, NUM_FRASCOS + 1)}
        ts_base = datetime.utcnow()  # Timestamp base para simulação virtual
        
        print("🚀 Iniciando simulação...\n")
        inicio_real = time.time()
        
        for ponto in range(num_pontos + 1):
            t_h = ponto * intervalo_h
            tempo_decorrido = time.time() - inicio_real
            
            print(f"⏱️  Tempo VIRTUAL: {t_h:.1f}h ({ponto}/{num_pontos}) | "
                  f"Tempo REAL: {tempo_decorrido:.1f}s")
            
            # Publica dados de cada frasco
            for frasco_id in range(1, NUM_FRASCOS + 1):
                topic = f"rumen/{ASSAY_ID}/{frasco_id}/telemetry"
                payload, P_atual = criar_payload(frasco_id, t_h, P_prev[frasco_id], 
                                                 relief_counts, ts_base)
                P_prev[frasco_id] = P_atual
                
                # Publica com QoS 1
                result = client.publish(topic, json.dumps(payload), qos=1)
                
                # Feedback visual
                if payload.get("event") == "relief":
                    status = "🔴"
                    relief_info = f" [ALÍVIO #{payload['relief_count']}]"
                else:
                    status = "🟢"
                    relief_info = ""
                
                print(f"  {status} Flask {frasco_id}: P={payload['P_bar_abs']:.2f} bar, "
                      f"T={payload['T_C']:.1f}°C, Δ={payload['accum_bar_per_h']:.2f} bar/h{relief_info}")
            
            print()  # Linha em branco
            
            # Aguarda próximo intervalo (tempo real)
            if ponto < num_pontos:
                time.sleep(delay_real)
        
        tempo_total = time.time() - inicio_real
        
        print("="*70)
        print("✅ Simulação concluída!")
        print(f"\n⏱️  Tempo REAL decorrido: {tempo_total:.1f}s ({tempo_total/60:.2f} min)")
        print(f"📊 Resumo de alívios:")
        for frasco_id, count in relief_counts.items():
            print(f"   Flask {frasco_id}: {count} alívio(s)")
        print("="*70)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Simulação interrompida pelo usuário")
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.loop_stop()
        client.disconnect()
        print("\n👋 Desconectado do broker")

# ========================
# MENU PRINCIPAL
# ========================

if __name__ == "__main__":
    print("\n" + "="*70)
    print(" OPÇÕES DE SIMULAÇÃO - CONTROLE DE VELOCIDADE")
    print("="*70)
    print("\n1. 48h em 2 MINUTOS (1440x - ultra rápido)")
    print("2. 48h em 5 MINUTOS (576x - muito rápido)")
    print("3. 48h em 10 MINUTOS (288x - rápido)")
    print("4. 48h em 30 MINUTOS (96x - moderado)")
    print("5. 48h em 1 HORA (48x - lento)")
    print("6. Modo PERSONALIZADO (escolher tempo)")
    print("0. Sair")
    
    opcao = input("\n👉 Escolha uma opção (0-6): ").strip()
    
    if opcao == "1":
        simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=120)
    elif opcao == "2":
        simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=300)
    elif opcao == "3":
        simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=600)
    elif opcao == "4":
        simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=1800)
    elif opcao == "5":
        simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=3600)
    elif opcao == "6":
        try:
            segundos = int(input("\n⏱️  Digite quantos SEGUNDOS a simulação deve durar: "))
            if segundos > 0:
                simular_fermentacao(duracao_h=48, intervalo_min=15, tempo_real_segundos=segundos)
            else:
                print("❌ Valor inválido!")
        except ValueError:
            print("❌ Digite um número válido!")
    elif opcao == "0":
        print("\n👋 Até logo!")
    else:
        print("\n❌ Opção inválida!")