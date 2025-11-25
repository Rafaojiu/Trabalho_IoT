# Manual do Usuário - Sistema RR Rural Fermentation

## 📖 Introdução

Bem-vindo ao Sistema RR Rural Fermentation! Este manual irá guiá-lo através de todas as funcionalidades do sistema de monitoramento de fermentação ruminal in vitro.

## 🎯 O que é o Sistema?

O  Sistema RR Rural Fermentation é uma plataforma completa para monitoramento e análise de fermentação ruminal in vitro, permitindo:

- ✅ Monitoramento em tempo real de pressão e temperatura
- ✅ Análise cinética baseada no modelo Gompertz
- ✅ Gestão completa de ensaios experimentais
- ✅ Sistema de alertas inteligente
- ✅ Exportação de dados em múltiplos formatos
- ✅ Visualizações interativas e intuitivas

## 🚀 Primeiros Passos

### 1. Acessando o Sistema

1. Abra seu navegador web (Chrome, Firefox, Safari, Edge)
2. Acesse: `http://localhost:3000`
3. O dashboard principal será carregado automaticamente

### 2. Visão Geral do Dashboard

Ao abrir o sistema, você verá:

```
┌─────────────────────────────────────────────────────────────┐
│                    BARRA DE NAVEGAÇÃO                       │
│  [Dashboard] [Ensaios] [Configurações] [Ajuda]              │
├─────────────────────────────────────────────────────────────┤
│                    CARDS DE RESUMO                          │
│  [Ensaios Ativos] [Alertas Pendentes] [Taxa de Sucesso]     │
├─────────────────────────────────────────────────────────────┤
│                    GRÁFICOS EM TEMPO REAL                   │
│  [Pressão] [Temperatura] [Produção de Gás]                  │
├─────────────────────────────────────────────────────────────┤
│                    TABELA DE ENSAIOS                        │
│  [ID] [Status] [Frascos] [Início] [Duração] [Ações]         │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Funcionalidades Principais

### 1. Criar Novo Ensaio

#### Passo a Passo:

1. **Clique em "Novo Ensaio"** no canto superior direito
2. **Preencha as informações básicas**:
   - **Nome do Ensaio**: Ex: "RF001 - Capim Napier"
   - **Descrição**: Detalhes sobre a amostra
   - **Número de Frascos**: 4, 8, 12 ou 16
   - **Duração Estimada**: Em horas (ex: 48h)
3. **Configure os parâmetros**:
   - **Limite de Pressão**: 1.5 bar (padrão)
   - **Temperatura Alvo**: 39°C (padrão)
   - **Intervalo de Coleta**: 5 minutos (padrão)
4. **Clique em "Iniciar Ensaio"**

#### Dicas Importantes:
- ✅ Use nomes descritivos para facilitar a identificação
- ✅ Configure o limite de pressão adequado para sua amostra
- ✅ Verifique se todos os frascos estão conectados antes de iniciar

### 2. Monitorar Ensaio em Andamento

#### Visualização em Tempo Real:

1. **Acesse o ensaio** clicando no nome na tabela principal
2. **Observe os gráficos** atualizando automaticamente:
   - **Pressão**: Linha azul (em bar)
   - **Temperatura**: Linha vermelha (em °C)
   - **Produção de Gás**: Linha verde (em mL)
3. **Monitore os alertas** no painel superior
4. **Verifique o status** de cada frasco individualmente

#### Interpretação dos Dados:

```
📈 PRESSÃO
- Normal: 0.8 - 1.2 bar
- Alerta: 1.2 - 1.5 bar (amarelo)
- Crítico: > 1.5 bar (vermelho)

🌡️ TEMPERATURA
- Ideal: 38.5 - 39.5°C
- Alerta: < 38°C ou > 40°C (amarelo)
- Crítico: < 37°C ou > 41°C (vermelho)

💨 PRODUÇÃO DE GÁS
- Crescente: Fermentação ativa
- Estável: Fermentação completa
- Decrescente: Possível problema
```

### 3. Sistema de Alertas

#### Tipos de Alertas:

| Alerta                | Cor | Ação Recomendada            |
|-----------------------|-----|-----------------------------|
| **Sobrepressão**      | 🔴 | Verificar válvula de alívio  |
| **Temperatura Alta**  | 🟡 | Ajustar controle térmico     |
| **Temperatura Baixa** | 🟡 | Verificar aquecimento        |
| **Falha de Sensor**   | 🔴 | Verificar conexões           |
| **Alívio de Pressão** | 🟢 | Normal - Monitorar           |

#### Como Responder:

1. **Clique no alerta** para ver detalhes
2. **Leia a mensagem** e recomendações
3. **Tome a ação apropriada** conforme o tipo
4. **Confirme o alerta** após resolver o problema

### 4. Análise de Dados

#### Parâmetros Cinéticos:

O sistema calcula automaticamente os parâmetros do modelo Gompertz:

```
📊 PRODUÇÃO ASSINTÓTICA (A)
- Capacidade máxima de produção de gás
- Valor típico: 150-250 mL/g MS

⚡ TAXA MÁXIMA (μ)
- Velocidade máxima de fermentação
- Valor típico: 5-15 mL/h

⏰ TEMPO DE LATÊNCIA (λ)
- Tempo até iniciar a fermentação
- Valor típico: 2-6 horas

📈 QUALIDADE DO AJUSTE (R²)
- Quanto mais próximo de 1, melhor o ajuste
- Valor mínimo aceitável: 0.95
```

#### Como Interpretar:

1. **A alto**: Alta digestibilidade da amostra
2. **μ alto**: Fermentação rápida e eficiente
3. **λ baixo**: Fermentação inicia rapidamente
4. **R² alto**: Modelo representa bem os dados

### 5. Exportar Dados

#### Formatos Disponíveis:

- **CSV**: Planilhas Excel/Google Sheets
- **JSON**: Para análise em Python/R
- **Excel**: Arquivo completo com múltiplas abas

#### Passo a Passo:

1. **Acesse o ensaio** desejado
2. **Clique em "Exportar Dados"**
3. **Selecione o formato**
4. **Configure o período** (data inicial/final)
5. **Escolha os dados**:
   - Telemetria completa
   - Eventos e alertas
   - Parâmetros cinéticos
   - Resumo estatístico
6. **Clique em "Baixar"**

#### Dicas:
- ✅ Exporte dados brutos para análise detalhada
- ✅ Use CSV para compartilhar com colegas
- ✅ JSON é ideal para automação com scripts
- ✅ Excel é perfeito para relatórios

## ⚙️ Configurações do Sistema

### 1. Configurações MQTT

Acesse: **Configurações > MQTT**

```
🔌 BROKER MQTT
- Host: localhost (ou IP do servidor)
- Porta: 1883 (padrão)
- Username: (opcional)
- Password: (opcional)

⚠️ IMPORTANTE:
- Somente altere se souber o que está fazendo
- Reinicie o sistema após mudanças
- Teste a conexão antes de salvar
```

### 2. Configurações de Alertas

Acesse: **Configurações > Alertas**

```
🔔 LIMITES DE ALERTA
- Pressão máxima: 1.5 bar
- Temperatura mínima: 38°C
- Temperatura máxima: 40°C
- Intervalo de verificação: 30s

📧 NOTIFICAÇÕES
- Som: Ativado/Desativado
- Visual: Ativado/Desativado
- Email: (configurar SMTP)
```

### 3. Configurações de Exportação

Acesse: **Configurações > Exportação**

```
📊 OPÇÕES DE EXPORTAÇÃO
- Separador decimal: . ou ,
- Separador de campos: ; ou ,
- Fuso horário: UTC ou Local
- Formato de data: DD/MM/YYYY ou MM/DD/YYYY
```

## 🛠️ Solução de Problemas

### Problemas Comuns

#### 1. "Nenhum dado aparecendo"

**Causas possíveis:**
- Simulador não está rodando
- Conexão MQTT falhou
- Porta incorreta configurada

**Solução:**
1. Verifique se o simulador está ativo
2. Confirme as configurações MQTT
3. Teste a conexão com `telnet localhost 1883`

#### 2. "Alertas não funcionando"

**Causas possíveis:**
- Limites configurados incorretamente
- Sistema de notificação desativado
- Browser bloqueando notificações

**Solução:**
1. Verifique os limites em Configurações > Alertas
2. Ative notificações no navegador
3. Teste com valores extremos

#### 3. "Gráficos não atualizam"

**Causas possíveis:**
- Conexão WebSocket falhou
- Dados não estão chegando
- Erro de JavaScript

**Solução:**
1. Abra o console do navegador (F12)
2. Verifique erros em vermelho
3. Recarregue a página (F5)

#### 4. "Exportação falha"

**Causas possíveis:**
- Período muito grande
- Browser bloqueando download
- Memória insuficiente

**Solução:**
1. Tente períodos menores
2. Desative bloqueadores de popup
3. Use formato CSV para grandes volumes

### Obter Ajuda

#### Recursos Disponíveis:

1. **Documentação Técnica**: `docs/technical.md`
2. **Console do Navegador**: Pressione F12 para ver erros
3. **Logs do Sistema**: Verifique os arquivos de log em `api/logs/`
4. **Testes de Conectividade**: Use ferramentas de rede

#### Quando Contactar Suporte:

- ❌ Erros persistentes após tentar soluções
- ❌ Sistema não inicia
- ❌ Dados corrompidos ou inconsistentes
- ❌ Performance muito lenta
- ❌ Problemas de segurança

## 💡 Dicas e Melhores Práticas

### Para Iniciar Ensaios

1. **Planeje com antecedência**:
   - Defina claramente o objetivo do ensaio
   - Prepare todas as amostras antes
   - Teste o sistema com um ensaio piloto

2. **Use nomes descritivos**:
   - Inclua data no nome (ex: "RF001_2024_01_15")
   - Adicione tipo de amostra (ex: "Capim", "Silagem")
   - Seja consistente na nomenclatura

3. **Configure alertas adequados**:
   - Ajuste limites baseado na amostra
   - Teste o sistema de alertas
   - Mantenha valores padrão como referência

### Para Análise de Dados

1. **Exporte regularmente**:
   - Faça backup dos dados importantes
   - Exporte em múltiplos formatos
   - Mantenha registros por pelo menos 1 ano

2. **Compare ensaios**:
   - Use parâmetros cinéticos para comparação
   - Analise padrões entre diferentes amostras
   - Documente observações importantes

3. **Valide os resultados**:
   - Verifique qualidade do ajuste (R²)
   - Compare com valores esperados
   - Identifique possíveis anomalias

### Para Manutenção

1. **Monitore o sistema**:
   - Verifique logs regularmente
   - Teste alertas periodicamente
   - Mantenha software atualizado

2. **Backup dos dados**:
   - Exporte banco de dados SQLite
   - Mantenha cópias em local seguro
   - Teste restauração de backup

3. **Performance**:
   - Limpe dados antigos periodicamente
   - Monitore uso de memória
   - Otimize configurações conforme necessário

---

**⚠️ IMPORTANTE**: Este manual é atualizado regularmente. Sempre verifique a versão mais recente em nosso website ou entre em contato com o suporte para obter a documentação mais atualizada.

**📄 Versão**: 1.0.0 | **📅 Data**: Novembro de 2025 | **✍️ Autor**:  Raphael Rodrigues e Rodrigo Luiz
