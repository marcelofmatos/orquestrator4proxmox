# --- build do frontend ---
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- build do backend ---
FROM node:20-alpine AS backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
ARG APP_VERSION=0.0.0
LABEL org.opencontainers.image.title="orquestrator4proxmox" \
      org.opencontainers.image.description="Painel web para operadores N1 gerenciarem VMs de cliente no Proxmox (clone, ciclo de vida, console noVNC), auth via LLDAP." \
      org.opencontainers.image.source="https://github.com/marcelofmatos/orquestrator4proxmox" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist /app/frontend/dist
EXPOSE 8080
# roda como usuário não-root (imagem node já traz o usuário `node`, uid 1000)
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ || exit 1
CMD ["node", "dist/server.js"]
