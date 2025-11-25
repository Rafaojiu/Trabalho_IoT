"""
Modelo Gompertz para simulação de fermentação ruminal in vitro
Baseado no sistema ANKOM RF para monitoramento de produção de gases
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
import json
from datetime import datetime, timedelta
import uuid

class GompertzModel:
    """
    Modelo Gompertz para simulação da cinética de fermentação ruminal
    P(t) = A * exp(-exp((μm * e / A) * (λ - t) + 1))
    """
    
    def __init__(self, A: float = 0.85, mu_m: float = 0.12, lam: float = 2.5, 
                 baseline_pressure: float = 1.0, temperature: float = 39.0):
        """
        Inicializa o modelo Gompertz
        
        Args:
            A: Pressão assintótica (bar)
            mu_m: Taxa máxima de produção (bar/h)
            lam: Tempo de latência (h)
            baseline_pressure: Pressão inicial (bar)
            temperature: Temperatura de operação (°C)
        """
        self.A = A  # Pressão assintótica
        self.mu_m = mu_m  # Taxa máxima
        self.lam = lam  # Tempo de latência
        self.baseline_pressure = baseline_pressure  # Pressão baseline
        self.temperature = temperature  # Temperatura constante
        self.e = np.e  # Constante de Euler
        
    def pressure_at_time(self, t: float) -> float:
        """
        Calcula a pressão absoluta no tempo t
        
        Args:
            t: Tempo em horas
            
        Returns:
            Pressão absoluta em bar
        """
        if t < 0:
            return self.baseline_pressure
            
        # Modelo Gompertz
        exponent = (self.mu_m * self.e / self.A) * (self.lam - t) + 1
        pressure = self.A * np.exp(-np.exp(exponent))
        
        # Adiciona ruído gaussiano controlado (CV < 5%)
        noise = np.random.normal(0, 0.01)  # ~1% de ruído
        pressure += noise
        
        # Garante que não fique abaixo do baseline
        return max(self.baseline_pressure, pressure)
    
    def normalize_pressure(self, P_meas: float, T_C: float) -> float:
        """
        Normaliza a pressão para 0°C usando a lei dos gases ideais
        
        Args:
            P_meas: Pressão medida (bar)
            T_C: Temperatura medida (°C)
            
        Returns:
            Pressão normalizada (bar)
        """
        return P_meas * (273.15 / (T_C + 273.15))
    
    def generate_time_series(self, duration_hours: float = 48, 
                           interval_minutes: int = 15) -> pd.DataFrame:
        """
        Gera série temporal completa de dados de fermentação
        
        Args:
            duration_hours: Duração total da simulação (horas)
            interval_minutes: Intervalo entre medições (minutos)
            
        Returns:
            DataFrame com dados de simulação
        """
        # Gera timestamps
        start_time = datetime.now()
        total_points = int(duration_hours * 60 / interval_minutes)
        
        timestamps = []
        pressures = []
        temperatures = []
        normalized_pressures = []
        
        for i in range(total_points):
            # Calcula tempo em horas
            t_hours = i * interval_minutes / 60.0
            
            # Gera timestamp
            timestamp = start_time + timedelta(minutes=i * interval_minutes)
            timestamps.append(timestamp)
            
            # Calcula pressão com modelo Gompertz
            P_abs = self.pressure_at_time(t_hours)
            pressures.append(P_abs)
            
            # Temperatura constante com pequena variação
            temp_variation = np.random.normal(0, 0.2)  # ±0.2°C
            temp = self.temperature + temp_variation
            temperatures.append(temp)
            
            # Normaliza pressão
            P_std = self.normalize_pressure(P_abs, temp)
            normalized_pressures.append(P_std)
        
        # Cria DataFrame
        df = pd.DataFrame({
            'timestamp': timestamps,
            'time_hours': [i * interval_minutes / 60.0 for i in range(total_points)],
            'P_bar_abs': pressures,
            'T_C': temperatures,
            'P_bar_std': normalized_pressures
        })
        
        return df
    
    def calculate_kinetic_parameters(self, df: pd.DataFrame) -> Dict:
        """
        Calcula parâmetros cinéticos a partir dos dados
        
        Args:
            df: DataFrame com dados de simulação
            
        Returns:
            Dicionário com parâmetros calculados
        """
        # Calcula taxa de acumulação (bar/h)
        df['accum_bar_per_h'] = df['P_bar_abs'].diff() / df['time_hours'].diff()
        
        # Encontra parâmetros do modelo
        max_pressure = df['P_bar_abs'].max()
        max_rate_idx = df['accum_bar_per_h'].idxmax()
        max_rate_time = df.loc[max_rate_idx, 'time_hours']
        
        # Tempo de latência (interpolação)
        baseline = self.baseline_pressure
        lat_idx = df[df['P_bar_abs'] > baseline + 0.05].index[0] if len(df[df['P_bar_abs'] > baseline + 0.05]) > 0 else 0
        latency_time = df.loc[lat_idx, 'time_hours'] if lat_idx > 0 else 0
        
        return {
            'A_observed': max_pressure - baseline,
            'mu_max_observed': df['accum_bar_per_h'].max(),
            'lambda_observed': latency_time,
            'R_squared': self._calculate_r_squared(df)
        }
    
    def _calculate_r_squared(self, df: pd.DataFrame) -> float:
        """
        Calcula R² entre dados simulados e modelo teórico
        
        Args:
            df: DataFrame com dados
            
        Returns:
            Coeficiente R²
        """
        # Gera valores preditos pelo modelo
        t_values = df['time_hours'].values
        predicted = [self.pressure_at_time(t) for t in t_values]
        observed = df['P_bar_abs'].values
        
        # Calcula R²
        ss_res = np.sum((observed - predicted) ** 2)
        ss_tot = np.sum((observed - np.mean(observed)) ** 2)
        r_squared = 1 - (ss_res / ss_tot)
        
        return r_squared

class MultiFlaskSimulator:
    """
    Simulador multi-frasco para diferentes condições experimentais
    """
    
    def __init__(self):
        self.scenarios = {
            'SAQ0505': {'A': 0.85, 'mu_m': 0.12, 'lam': 2.5},  # Alta produção
            'CONTROLE': {'A': 0.30, 'mu_m': 0.08, 'lam': 3.0},  # Controle baixo
            'ESTRESSE': {'A': 0.65, 'mu_m': 0.10, 'lam': 4.0},  # Estresse térmico
            'ADITIVO': {'A': 1.00, 'mu_m': 0.15, 'lam': 1.8}    # Com aditivo
        }
    
    def generate_multi_flask_data(self, num_flasks: int = 4, 
                                  assay_id: str = "SAQ0505",
                                  duration_hours: float = 48,
                                  interval_minutes: int = 15) -> List[Dict]:
        """
        Gera dados para múltiplos frascos
        
        Args:
            num_flasks: Número de frascos
            assay_id: Identificador do ensaio
            duration_hours: Duração da simulação
            interval_minutes: Intervalo de medição
            
        Returns:
            Lista de dicionários com dados de cada frasco
        """
        results = []
        
        # Seleciona cenário base
        scenario_params = self.scenarios.get(assay_id, self.scenarios['SAQ0505'])
        
        for flask_id in range(1, num_flasks + 1):
            # Adiciona variação entre réplicas
            A_var = scenario_params['A'] * np.random.normal(1, 0.05)
            mu_m_var = scenario_params['mu_m'] * np.random.normal(1, 0.08)
            lam_var = scenario_params['lam'] * np.random.normal(1, 0.10)
            
            # Cria modelo para este frasco
            model = GompertzModel(
                A=A_var,
                mu_m=mu_m_var,
                lam=lam_var,
                baseline_pressure=1.0,
                temperature=39.0
            )
            
            # Gera dados
            df = model.generate_time_series(duration_hours, interval_minutes)
            
            # Calcula parâmetros cinéticos
            kinetic_params = model.calculate_kinetic_parameters(df)
            
            # Prepara dados para MQTT
            for _, row in df.iterrows():
                payload = {
                    'schema_version': 1,
                    'msg_id': str(uuid.uuid4()),
                    'assay_id': assay_id,
                    'flask_id': flask_id,
                    'timestamp': row['timestamp'].isoformat(),
                    'P_bar_abs': round(row['P_bar_abs'], 3),
                    'T_C': round(row['T_C'], 1),
                    'P_bar_std': round(row['P_bar_std'], 3),
                    'accum_bar_per_h': round(row.get('accum_bar_per_h', 0), 4) if not pd.isna(row.get('accum_bar_per_h', 0)) else 0
                }
                
                # Adiciona evento se houver alívio
                if row['P_bar_abs'] >= 1.5:
                    payload['event'] = 'relief'
                
                results.append(payload)
        
        return results

# Funções auxiliares para exportação
def export_to_csv(data: List[Dict], filename: str):
    """Exporta dados para CSV"""
    df = pd.DataFrame(data)
    df.to_csv(filename, index=False)
    print(f"Dados exportados para {filename}")

def export_to_sqlite(data: List[Dict], db_path: str):
    """Exporta dados para SQLite"""
    import sqlite3
    
    conn = sqlite3.connect(db_path)
    df = pd.DataFrame(data)
    df.to_sql('fermentation_data', conn, if_exists='replace', index=False)
    conn.close()
    print(f"Dados exportados para {db_path}")

# Exemplo de uso
if __name__ == "__main__":
    # Cria simulador multi-frasco
    simulator = MultiFlaskSimulator()
    
    # Gera dados para 4 frascos
    data = simulator.generate_multi_flask_data(
        num_flasks=4,
        assay_id="SAQ0505",
        duration_hours=48,
        interval_minutes=15
    )
    
    print(f"Gerados {len(data)} pontos de dados")
    
    # Exporta dados
    export_to_csv(data, "fermentation_data.csv")
    export_to_sqlite(data, "fermentation_data.db")
    
    # Mostra amostra dos dados
    print("\nAmostra dos dados gerados:")
    for i, record in enumerate(data[:5]):
        print(f"{i+1}: {json.dumps(record, indent=2)}")