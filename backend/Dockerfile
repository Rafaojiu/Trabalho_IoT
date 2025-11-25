# Arquivo Dockerfile para o backend Node.js
FROM node:18-alpine

# Diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Criar diretório de dados
RUN mkdir -p /app/data

# Expor portas
EXPOSE 3003 8080

# Comando para iniciar o servidor
CMD ["node", "server.js"]