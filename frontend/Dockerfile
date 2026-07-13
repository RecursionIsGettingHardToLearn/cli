# ============================================================
# Frontend web-angular (Angular 17) - build estatico servido por nginx
# ============================================================

# --- Etapa 1: build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: mismo flag que usa docker-compose (conflictos de peers)
RUN npm ci --legacy-peer-deps
COPY . .
# Usa fileReplacements -> environment.prod.ts (URLs del ingress de AKS)
RUN npm run build:prod

# --- Etapa 2: runtime ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# El builder "application" de Angular 17 emite la app en browser/
COPY --from=build /app/dist/web-angular/browser /usr/share/nginx/html
EXPOSE 80
