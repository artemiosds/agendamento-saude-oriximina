# ============================================================
# Estágio 1: Build
# ============================================================
FROM node:22-alpine AS build
WORKDIR /app

# Copia os manifestos de pacotes
COPY package*.json ./

# Aqui está o pulo do gato: usamos 'npm install' em vez de 'npm ci'
# para que o Docker resolva os conflitos de versão do Shadcn e Lovable sozinhos.
RUN npm install

# Copia o restante do código fonte
COPY . .

# Variáveis de ambiente (Vite precisa delas no momento do build)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Executa o build (vite build)
RUN npm run build

# ============================================================
# Estágio 2: Produção (Nginx)
# ============================================================
FROM nginx:1.27-alpine AS production

# Define o diretório de trabalho do Nginx
WORKDIR /usr/share/nginx/html

# Remove a configuração padrão
RUN rm /etc/nginx/conf.d/default.conf

# Copia o build do estágio anterior
COPY --from=build /app/dist /usr/share/nginx/html
# Copia o seu nginx.conf (aquele com a porta 3000)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Segurança: Permissões para o usuário nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 3000

# Verifica se o serviço está de pé
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
