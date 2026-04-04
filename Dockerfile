# ============================================================
# Estágio 1: Dependências
# ============================================================
FROM node:22-alpine AS deps
WORKDIR /app

# Copia apenas os arquivos de dependência primeiro (cache layer)
COPY package*.json ./
RUN npm ci --frozen-lockfile

# ============================================================
# Estágio 2: Build
# ============================================================
FROM node:22-alpine AS build
WORKDIR /app

# Reutiliza dependências do estágio anterior
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variáveis de ambiente para o Vite embeddar no bundle
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Build de produção
RUN npm run build

# ============================================================
# Estágio 3: Produção (imagem final mínima)
# ============================================================
FROM nginx:1.27-alpine AS production

# Remove configuração padrão do nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia apenas o necessário
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Usuário não-root para segurança
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
