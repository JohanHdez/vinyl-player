# Stage 1: Build Angular app
FROM node:22-alpine AS build

WORKDIR /app

# Cypress solo se usa en pruebas E2E locales: no descargar su binario aquí.
ENV CYPRESS_INSTALL_BINARY=0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
# Railway define PORT; si no, 3001. Para salas persistentes monta un volumen y define DATA_DIR=/data.
EXPOSE 3001

CMD ["node", "server/proxy.js"]
