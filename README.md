# Vinyl Player

Reproductor de musica web con estetica de tocadiscos vintage. Busca y reproduce musica de YouTube con un tocadiscos animado, controles de reproduccion y sesiones colaborativas en tiempo real.

## Caracteristicas

- **Tocadiscos animado** — Vinilo giratorio con refraccion de luz, brazo con aguja, plinto de madera con textura de grano
- **Busqueda de YouTube** — Busca canciones o pega URLs de YouTube directamente
- **Playlist** — Cola de reproduccion con barras de ecualizador animadas
- **Tendencias** — Grid de canciones en tendencia desde YouTube Music
- **Jam Sessions** — Sesiones colaborativas en tiempo real:
  - Crea una sesion y comparte el codigo QR
  - Los invitados escanean el QR o ingresan el codigo
  - Elige escuchar en tu dispositivo o en el del host
  - Playlist sincronizada entre todos los participantes
  - Reconexion automatica con grace period de 5 minutos

## Requisitos

- Node.js 20+
- npm 10+
- Cuenta de [ngrok](https://ngrok.com) (gratis, para sesiones Jam remotas)

## Instalacion

```bash
git clone https://github.com/JohanHdez/vinyl-player.git
cd vinyl-player
npm install
```

## Configuracion

Crea un archivo `.env` en la raiz del proyecto:

```env
NGROK_AUTHTOKEN=tu_token_de_ngrok
```

Obtiene tu token en: https://dashboard.ngrok.com/get-started/your-authtoken

## Uso

### Desarrollo local

```bash
# Terminal 1: Servidor proxy (YouTube API + Socket.IO)
npm run proxy

# Terminal 2: Angular dev server
npm start
```

Abre http://localhost:4200

### Acceso remoto (Jam Sessions entre dispositivos)

```bash
# 1. Compilar Angular
npm run build

# 2. Levantar servidor (sirve la app + API + WebSocket)
npm run proxy

# 3. Crear tunnel (en otra terminal)
npm run tunnel
```

Comparte la URL de ngrok con los participantes.

## Stack

| Capa | Tecnologia |
|------|-----------|
| Frontend | Angular 21, TypeScript 5.9, SCSS |
| Backend | Express 5, Socket.IO |
| Audio | YouTube IFrame API |
| Tunnel | ngrok |
| Fonts | Young Serif, Syne (Google Fonts) |

## Estructura

```
src/app/
├── components/
│   ├── turntable/        # Tocadiscos CSS animado
│   ├── player-controls/  # Play/pause, progreso, volumen
│   ├── search-bar/       # Busqueda de canciones
│   ├── search-results/   # Resultados de busqueda
│   ├── playlist/         # Cola de reproduccion
│   ├── trending-grid/    # Tendencias de YouTube
│   ├── jam-panel/        # Panel de sesion Jam (QR, participantes)
│   └── jam-join/         # Dialog para unirse a Jam
├── services/
│   ├── youtube.service.ts       # YouTube API
│   ├── player-state.service.ts  # Estado global
│   ├── jam.service.ts           # Socket.IO / Jam
│   └── proxy-url.ts             # URL del proxy
└── models/

server/
├── proxy.js    # Express + Socket.IO + YouTube proxy
└── tunnel.js   # Script de ngrok
```

## Scripts

| Comando | Descripcion |
|---------|------------|
| `npm start` | Dev server Angular (puerto 4200) |
| `npm run proxy` | Servidor Express + Socket.IO (puerto 3001) |
| `npm run build` | Build de produccion |
| `npm run tunnel` | Tunnel ngrok para acceso remoto |
| `npm run cy:open` | Abrir Cypress para tests E2E |

## Licencia

MIT
