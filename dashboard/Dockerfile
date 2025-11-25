# Arquivo Dockerfile para o dashboard React
FROM node:18-alpine as build

# Diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build do aplicativo
RUN npm run build

# Estágio de produção
FROM nginx:alpine

# Copiar build para nginx
COPY --from=build /app/build /usr/share/nginx/html

# Copiar configuração do nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Expor porta
EXPOSE 3000

# Comando para iniciar o nginx
CMD ["nginx", "-g", "daemon off;"]