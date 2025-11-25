# Modelos Cinéticos - Sistema RR Rural Fermentation

## 📊 Introdução aos Modelos Cinéticos

Este documento descreve os modelos matemáticos utilizados para análise da cinética de fermentação ruminal no  Sistema RR Rural Fermentation.

## 🎯 Objetivo

Os modelos cinéticos permitem:
- ✅ Descrever a dinâmica de produção de gás durante a fermentação
- ✅ Estimar parâmetros biológicos importantes
- ✅ Comparar diferentes tratamentos e amostras
- ✅ Prever o comportamento da fermentação
- ✅ Quantificar a digestibilidade dos alimentos

## 📈 Modelo Gompertz

### Formulação Matemática

O modelo Gompertz é utilizado para descrever a cinética de produção de gás acumulada:

```
P(t) = A × exp{ -exp[ (μ × e / A) × (λ - t) + 1 ] }
```

Onde:
- **P(t)**: Produção acumulada de gás no tempo t (mL)
- **A**: Produção assintótica máxima (mL)
- **μ**: Taxa máxima de produção de gás (mL/h)
- **λ**: Tempo de latência (h)
- **t**: Tempo de incubação (h)
- **e**: Constante de Euler (≈ 2.71828)

### Interpretação Biológica

| Parâmetro | Unidade | Significado Biológico                       |
|-----------|---------|---------------------------------------------|
| **A**     |   mL    | Capacidade total de fermentação da amostra  |
| **μ**     |   mL/h  | Velocidade máxima de fermentação            |
| **λ**     |   h     | Tempo necessário para iniciar a fermentação |

### Derivadas Importantes

#### Taxa Instantânea de Produção
```
dP/dt = (μ × exp{1 + (μ × e / A) × (λ - t) - exp[(μ × e / A) × (λ - t) + 1]}) / e
```

#### Tempo de Taxa Máxima
```
t_max = λ + (A / (μ × e))
```

#### Taxa de Acumulação
```
Accumulation_Rate = dP/dt
```

## 🔧 Implementação Computacional

### Ajuste do Modelo em Python

```python
import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt

def gompertz_model(t, A, mu, lam):
    """
    Modelo Gompertz para produção de gás
    
    Args:
        t: array de tempos (horas)
        A: produção assintótica (mL)
        mu: taxa máxima (mL/h)
        lam: tempo de latência (h)
    
    Returns:
        Array com produção acumulada de gás
    """
    e = np.e
    return A * np.exp(-np.exp((mu * e / A) * (lam - t) + 1))

def fit_gompertz(time_data, gas_data, initial_guess=None):
    """
    Ajusta o modelo Gompertz aos dados experimentais
    
    Args:
        time_data: array de tempos (horas)
        gas_data: array de produção de gás (mL)
        initial_guess: [A_guess, mu_guess, lam_guess]
    
    Returns:
        dict com parâmetros ajustados e estatísticas
    """
    
    # Estimativas iniciais se não fornecidas
    if initial_guess is None:
        A_guess = np.max(gas_data) * 1.2  # 20% acima do máximo observado
        mu_guess = 10.0  # Taxa média inicial
        lam_guess = 2.0  # Latência média inicial
        initial_guess = [A_guess, mu_guess, lam_guess]
    
    # Limites para os parâmetros
    bounds = (
        [np.max(gas_data) * 0.8, 1.0, 0.0],    # Limites inferiores
        [np.max(gas_data) * 2.0, 50.0, 10.0]   # Limites superiores
    )
    
    # Ajuste do modelo
    try:
        params, covariance = curve_fit(
            gompertz_model, 
            time_data, 
            gas_data, 
            p0=initial_guess,
            bounds=bounds,
            method='trf'
        )
        
        # Extração dos parâmetros
        A_fit, mu_fit, lam_fit = params
        
        # Cálculo do R²
        residuals = gas_data - gompertz_model(time_data, *params)
        ss_res = np.sum(residuals**2)
        ss_tot = np.sum((gas_data - np.mean(gas_data))**2)
        r_squared = 1 - (ss_res / ss_tot)
        
        # Erro padrão dos parâmetros
        param_errors = np.sqrt(np.diag(covariance))
        
        # Matriz de correlação
        correlation_matrix = covariance / np.outer(param_errors, param_errors)
        
        return {
            'parameters': {
                'A': A_fit,
                'mu': mu_fit,
                'lambda': lam_fit
            },
            'errors': {
                'A_error': param_errors[0],
                'mu_error': param_errors[1],
                'lambda_error': param_errors[2]
            },
            'statistics': {
                'r_squared': r_squared,
                'rmse': np.sqrt(np.mean(residuals**2)),
                'aic': 2 * 3 + len(time_data) * np.log(ss_res / len(time_data)),
                'bic': 3 * np.log(len(time_data)) + len(time_data) * np.log(ss_res / len(time_data))
            },
            'correlation_matrix': correlation_matrix,
            'fitted_curve': gompertz_model(time_data, *params),
            'residuals': residuals
        }
        
    except Exception as e:
        return {
            'error': f'Falha no ajuste do modelo: {str(e)}',
            'parameters': None
        }
```

### Implementação em Node.js

```javascript
/**
 * Modelo Gompertz para análise cinética
 */
class GompertzModel {
  constructor() {
    this.e = Math.E;
  }
  
  /**
   * Calcula a produção acumulada usando o modelo Gompertz
   * @param {number} t - Tempo (horas)
   * @param {number} A - Produção assintótica (mL)
   * @param {number} mu - Taxa máxima (mL/h)
   * @param {number} lambda - Tempo de latência (h)
   * @returns {number} - Produção acumulada (mL)
   */
  gompertz(t, A, mu, lambda) {
    return A * Math.exp(-Math.exp((mu * this.e / A) * (lambda - t) + 1));
  }
  
  /**
   * Calcula a taxa instantânea de produção
   * @param {number} t - Tempo (horas)
   * @param {number} A - Produção assintótica (mL)
   * @param {number} mu - Taxa máxima (mL/h)
   * @param {number} lambda - Tempo de latência (h)
   * @returns {number} - Taxa de produção (mL/h)
   */
  rate(t, A, mu, lambda) {
    const exponent = (mu * this.e / A) * (lambda - t) + 1;
    return (mu * Math.exp(1 + exponent - Math.exp(exponent))) / this.e;
  }
  
  /**
   * Encontra o tempo de taxa máxima
   * @param {number} A - Produção assintótica (mL)
   * @param {number} mu - Taxa máxima (mL/h)
   * @param {number} lambda - Tempo de latência (h)
   * @returns {number} - Tempo de taxa máxima (h)
   */
  timeOfMaxRate(A, mu, lambda) {
    return lambda + (A / (mu * this.e));
  }
  
  /**
   * Calcula o ponto de inflexão
   * @param {number} A - Produção assintótica (mL)
   * @param {number} mu - Taxa máxima (mL/h)
   * @param {number} lambda - Tempo de latência (h)
   * @returns {object} - Ponto de inflexão
   */
  inflectionPoint(A, mu, lambda) {
    const t_inf = lambda + (A / (mu * this.e));
    const P_inf = A / this.e; // A * exp(-1)
    const rate_inf = mu / this.e; // mu * exp(-1)
    
    return {
      time: t_inf,
      production: P_inf,
      rate: rate_inf
    };
  }
  
  /**
   * Calcula estatísticas do ajuste
   * @param {Array} timeData - Array de tempos
   * @param {Array} gasData - Array de produção de gás
   * @param {Array} fittedData - Array de valores ajustados
   * @returns {object} - Estatísticas
   */
  calculateStatistics(timeData, gasData, fittedData) {
    const n = timeData.length;
    const residuals = gasData.map((obs, i) => obs - fittedData[i]);
    const ssRes = residuals.reduce((sum, res) => sum + res * res, 0);
    const meanObs = gasData.reduce((sum, val) => sum + val, 0) / n;
    const ssTot = gasData.reduce((sum, val) => sum + (val - meanObs) * (val - meanObs), 0);
    
    const rSquared = 1 - (ssRes / ssTot);
    const rmse = Math.sqrt(ssRes / n);
    const mae = residuals.reduce((sum, res) => sum + Math.abs(res), 0) / n;
    
    // AIC e BIC (3 parâmetros no modelo)
    const k = 3;
    const aic = 2 * k + n * Math.log(ssRes / n);
    const bic = k * Math.log(n) + n * Math.log(ssRes / n);
    
    return {
      rSquared,
      rmse,
      mae,
      aic,
      bic,
      residuals,
      maxResidual: Math.max(...residuals.map(Math.abs))
    };
  }
}

// Exportar para uso
module.exports = GompertzModel;
```

## 📊 Valores de Referência

### Parâmetros para Diferentes Tipos de Alimentos

| Tipo de Alimento      | A (mL/g MS) | μ (mL/h) | λ (h) | R² Mínimo |
|-----------------------|-------------|----------|--------|----------|
| **Capim Napier**      |   180-220   |   8-12   |   2-4  |   0.95   |
| **Silagem de Milho**  |   200-250   |   10-15  |   1-3  |   0.96   |
| **Feno de Alfafa**    |   160-200   |   6-10   |   3-5  |   0.94   |
| **Ração Concentrada** |   220-280   |   12-18  |   1-2  |   0.97   |
| **Casca de Soja**     |   140-180   |   5-8    |   4-6  |   0.93   |
| **Polpa de Citrus**   |   120-160   |   4-7    |   3-6  |   0.92   |

### Classificação da Qualidade do Ajuste

| R²        | Classificação | Ação Recomendada |
|-----------|---------------|------------------|
| 0.98-1.00 |   Excelente   | Ajuste aceitável |
| 0.95-0.97 |   Bom         | Ajuste aceitável |
| 0.90-0.94 |   Regular     |  Verificar dados |
|   < 0.90  |   Ruim        |  Rejeitar ajuste |

## 🔍 Análise de Resíduos

### Testes de Qualidade do Ajuste

```python
def analyze_residuals(time_data, residuals):
    """
    Análise detalhada dos resíduos do ajuste
    """
    import scipy.stats as stats
    
    # Estatísticas básicas
    mean_residual = np.mean(residuals)
    std_residual = np.std(residuals)
    
    # Teste de normalidade (Shapiro-Wilk)
    shapiro_stat, shapiro_p = stats.shapiro(residuals)
    
    # Teste de tendência (runs test)
    positive_runs = np.sum(np.diff(np.sign(residuals)) != 0) + 1
    expected_runs = len(residuals) // 2 + 1
    
    # Autocorrelação (Durbin-Watson)
    durbin_watson = np.sum(np.diff(residuals)**2) / np.sum(residuals**2)
    
    # Heteroscedasticidade (teste visual e Breusch-Pagan)
    # ... implementação adicional ...
    
    return {
        'mean': mean_residual,
        'std': std_residual,
        'normality_test': {
            'statistic': shapiro_stat,
            'p_value': shapiro_p,
            'is_normal': shapiro_p > 0.05
        },
        'runs_test': {
            'actual_runs': positive_runs,
            'expected_runs': expected_runs,
            'has_trend': abs(positive_runs - expected_runs) > np.sqrt(len(residuals) - 1)
        },
        'durbin_watson': durbin_watson,
        'autocorrelation': 'positive' if durbin_watson < 1.5 else 'negative' if durbin_watson > 2.5 else 'none'
    }
```

## 📈 Comparação entre Tratamentos

### Análise Estatística

```python
def compare_treatments(treatment_data):
    """
    Compara parâmetros cinéticos entre diferentes tratamentos
    """
    from scipy import stats
    
    results = {}
    
    # Comparação de A (produção assintótica)
    groups_A = [data['A'] for data in treatment_data.values()]
    f_stat_A, p_value_A = stats.f_oneway(*groups_A)
    
    # Comparação de μ (taxa máxima)
    groups_mu = [data['mu'] for data in treatment_data.values()]
    f_stat_mu, p_value_mu = stats.f_oneway(*groups_mu)
    
    # Comparação de λ (latência)
    groups_lambda = [data['lambda'] for data in treatment_data.values()]
    f_stat_lambda, p_value_lambda = stats.f_oneway(*groups_lambda)
    
    # Teste de Tukey para comparações múltiplas
    # ... implementação adicional ...
    
    return {
        'A_comparison': {
            'f_statistic': f_stat_A,
            'p_value': p_value_A,
            'significant': p_value_A < 0.05
        },
        'mu_comparison': {
            'f_statistic': f_stat_mu,
            'p_value': p_value_mu,
            'significant': p_value_mu < 0.05
        },
        'lambda_comparison': {
            'f_statistic': f_stat_lambda,
            'p_value': p_value_lambda,
            'significant': p_value_lambda < 0.05
        }
    }
```

## 🔄 Atualização em Tempo Real

### Implementação para Dashboard

```javascript
/**
 * Atualização em tempo real dos parâmetros cinéticos
 */
class KineticAnalysis {
  constructor() {
    this.gompertz = new GompertzModel();
    this.dataBuffer = new Map();
    this.fittingInterval = null;
  }
  
  /**
   * Adiciona novo ponto de dados
   */
  addDataPoint(assayId, flaskId, timestamp, pressure, temperature) {
    const key = `${assayId}_${flaskId}`;
    
    if (!this.dataBuffer.has(key)) {
      this.dataBuffer.set(key, {
        times: [],
        pressures: [],
        temperatures: [],
        gasProductions: []
      });
    }
    
    const data = this.dataBuffer.get(key);
    
    // Converter pressão para produção de gás (simplificado)
    const gasProduction = this.pressureToGasVolume(pressure, temperature);
    
    data.times.push(timestamp);
    data.pressures.push(pressure);
    data.temperatures.push(temperature);
    data.gasProductions.push(gasProduction);
    
    // Limitar buffer aos últimos 1000 pontos
    if (data.times.length > 1000) {
      data.times.shift();
      data.gasProductions.shift();
    }
    
    // Refazer ajuste se houver dados suficientes
    if (data.times.length >= 10) {
      this.updateKineticParameters(key);
    }
  }
  
  /**
   * Converte pressão para volume de gás
   */
  pressureToGasVolume(pressure, temperature) {
    // Simplificação - usar lei dos gases ideais
    // PV = nRT => V = nRT/P
    const R = 0.0821; // L·atm/(mol·K)
    const T = temperature + 273.15; // K
    const P = pressure; // atm simplificado
    
    // Assumindo n constante para demonstração
    return (pressure - 1.0) * 100; // Simplificado
  }
  
  /**
   * Atualiza parâmetros cinéticos
   */
  async updateKineticParameters(key) {
    const data = this.dataBuffer.get(key);
    if (!data || data.times.length < 10) return;
    
    try {
      // Converter timestamps para horas relativas
      const startTime = data.times[0];
      const timeHours = data.times.map(t => (t - startTime) / (1000 * 3600));
      
      // Ajustar modelo (simplificado - usar biblioteca real)
      const result = await this.fitGompertzAsync(timeHours, data.gasProductions);
      
      if (result && result.parameters) {
        // Emitir evento com novos parâmetros
        this.emit('kineticUpdate', {
          key,
          parameters: result.parameters,
          statistics: result.statistics,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Erro ao ajustar modelo:', error);
    }
  }
  
  /**
   * Ajusta modelo Gompertz (placeholder - usar implementação real)
   */
  async fitGompertzAsync(timeData, gasData) {
    // Esta é uma implementação simplificada
    // Em produção, usar biblioteca de otimização adequada
    return new Promise(resolve => {
      // Simular ajuste
      setTimeout(() => {
        resolve({
          parameters: {
            A: Math.max(...gasData) * 1.2,
            mu: 10.0,
            lambda: 2.0
          },
          statistics: {
            rSquared: 0.95
          }
        });
      }, 100);
    });
  }
  
  /**
   * Inicia atualização periódica
   */
  startRealTimeAnalysis() {
    this.fittingInterval = setInterval(() => {
      this.dataBuffer.forEach((data, key) => {
        if (data.times.length >= 10) {
          this.updateKineticParameters(key);
        }
      });
    }, 60000); // Atualizar a cada minuto
  }
  
  /**
   * Para atualização periódica
   */
  stopRealTimeAnalysis() {
    if (this.fittingInterval) {
      clearInterval(this.fittingInterval);
      this.fittingInterval = null;
    }
  }
}
```

## 📚 Referências Bibliográficas

### Artigos Científicos

1. **Schofield, P., Pitt, R. E., & Pell, A. N. (1994).** Kinetics of fiber digestion from in vitro gas production. *Journal of Animal Science*, 72(11), 2980-2991.

2. **Groot, J. C. J., Cone, J. W., Williams, B. A., Debersaques, F. M. A., & Lantinga, E. A. (1996).** Multiphasic analysis of gas production kinetics for in vitro fermentation of ruminant feeds. *Animal Feed Science and Technology*, 64(1), 77-89.

3. **López, S., Dijkstra, J., & France, J. (2000).** Prediction of the methane production rate by ruminants using in vitro gas production techniques. *Proceedings of the British Society of Animal Science*, 2000, 116-116.

4. **Cone, J. W., Van Gelder, A. H., Visscher, G. J. W., & Oudshoorn, L. (1996).** Influence of rumen fluid and substrate concentration on fermentation kinetics measured with a fully automated time related gas production apparatus. *Animal Feed Science and Technology*, 61(1-4), 113-128.

### Livros e Capítulos

5. **France, J., & Dijkstra, J. (2005).** Mathematical models in animal nutrition. CABI Publishing.

6. **McDonald, P., Edwards, R. A., Greenhalgh, J. F. D., Morgan, C. A., & Sinclair, L. A. (2011).** Animal nutrition. 7th ed. Pearson Education.

### Artigos sobre Modelagem

7. **Pitt, R. E., Van Kessel, J. S., Fox, D. G., & Pell, A. N. (1996).** Prediction of ruminal volatile fatty acids and pH within the net carbohydrate and protein system. *Journal of Animal Science*, 74(2), 226-244.

8. **Offner, A., & Sauvant, D. (2004).** Comparative evaluation of the Molly, CPM and LIGNIM models for predicting the rumen digestion of diets. *Animal Research*, 53(2), 95-108.

---

**📄 Versão**: 1.0.0 | **📅 Data**: Janeiro 2024 | **✍️ Autor**: Equipe ANKOM RF IoT
