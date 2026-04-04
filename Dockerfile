# ============================================================
# Estágio 1: Build (Instalação e Compilação)
# ============================================================
FROM node:22-alpine AS build
WORKDIR /app

# Instalação das dependências
COPY package*.json ./

# NOTA: Se o build falhar novamente por "lockfile sync", 
# mude para "RUN npm install" temporariamente.
RUN npm ci --frozen-lockfile

# Copia o restante do código
COPY . .

# Variáveis de ambiente para o Vite (Devem estar antes do build)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Gera a pasta /dist
RUN npm run build

# ============================================================
# Estágio 2: Produção (Imagem final mínima com Nginx)
# ============================================================
FROM nginx:1.27-alpine AS production

# Configurações de diretório e permissões para usuário não-root
WORKDIR /usr/share/nginx/html

# Remove configuração padrão do nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos do estágio de build
COPY --from=build /app/dist /usr/share/nginx/html
# Copia sua config personalizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ajuste de permissões para rodar como usuário nginx (Segurança)
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

# Porta que o seu nginx.conf está ouvindo
EXPOSE 3000

# Healthcheck para garantir que o sistema está respondendo
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
