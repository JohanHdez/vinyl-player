# Vinyl Player

Reproductor de musica web con estetica de tocadiscos vintage. Busca y reproduce musica de YouTube con un tocadiscos animado, controles de reproduccion y sesiones colaborativas en tiempo real.

## Caracteristicas

- **Tocadiscos animado** — Vinilo giratorio con refraccion de luz, brazo con aguja, plinto de madera con textura de grano
- **Busqueda de YouTube** — Busca canciones o pega URLs de YouTube directamente
- **Playlist** — Cola de reproduccion con barras de ecualizador animadas
- **Radio automatica** — Al acabarse la cola, sigue sola con canciones parecidas a la que sonaba (se puede apagar; la preferencia se recuerda)
- **Sugerencias "Porque escuchas..."** — Canciones parecidas a la actual para reproducir ya o agregar a la cola, y una fila "Mas como..." en Inicio
- **Tendencias** — Grid de canciones en tendencia desde YouTube Music
- **Explorar** — Generos y estados de animo (como YouTube Music), artistas principales, paginas de artista con sus canciones mas escuchadas y artistas parecidos, y listas destacadas por categoria
- **Compartir por WhatsApp** — Enlace a una cancion (`?song=`) o a una sala (`?jam=`) con vista previa: titulo, artista y portada de la cancion
- **Versiones bloqueadas** — Si YouTube no deja reproducir un video fuera de su sitio, busca otra version de la misma cancion y la pone en su lugar
- **Votos** — Lo que se comparte en el chat entra a la cola; la canción más votada de las que esperan suena primero (a igualdad de votos, los pedidos van antes que la radio)
- **Escuchar aquí** — Quien entra a una sala puede activar "🎧 Escuchar aquí" para oír la música también en su celular, sincronizada con el anfitrión (sigue sus cambios de canción, pausas y saltos; corrige desfases de más de 2 s)
- **Salas** — Chat en tiempo real tipo Messenger: burbujas, "esta escribiendo...", reacciones, canciones compartidas como tarjetas con "Poner ahora" / "+ Cola", avisos de quien entra o agrega musica, historial para quien llega tarde y contador de no leidos
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
- Docker (opcional, para despliegue con contenedor)

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

### Docker

```bash
# Build y levantar
docker compose up --build

# En background
docker compose up --build -d

# Solo build de la imagen
docker build -t vinyl-player .

# Correr manualmente
docker run -p 3001:3001 vinyl-player
```

Abre http://localhost:3001

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
│   ├── trending-grid/    # Tendencias y fila "Mas como..."
│   ├── suggestions/      # Panel "Porque escuchas..." + interruptor de radio
│   ├── explore/          # Explorar: generos, artistas, categorias y listas
│   ├── room/             # Salas: portada (crear/unirse) y layout de la sala
│   ├── chat/             # Chat tipo Messenger de la sala
│   ├── jam-panel/        # Panel de sesion Jam (QR, participantes)
│   └── jam-join/         # Dialog para unirse a Jam
├── services/
│   ├── youtube.service.ts       # YouTube API
│   ├── player-state.service.ts  # Estado global
│   ├── radio.service.ts         # Sugerencias y radio automatica
│   ├── queue.ts                 # Reglas de la cola (funciones puras + queue.spec.ts)
│   ├── chat-view.ts             # Agrupar mensajes y reacciones (puro + chat-view.spec.ts)
│   ├── jam.service.ts           # Socket.IO / Jam
│   └── proxy-url.ts             # URL del proxy
└── models/

server/
├── proxy.js             # Punto de entrada: Express + Socket.IO + build de Angular
├── api.js               # Rutas /api (search, trending, video-info, related, explore, category, artist, playlist)
├── youtube/
│   ├── innertube.js     # Cliente InnerTube (sin API key, con timeout)
│   ├── parsers.js       # Respuestas de YouTube -> Song[] (funciones puras)
│   ├── explore-parsers.js # Generos, artistas, categorias y listas
│   └── cache.js         # Cache en memoria con TTL
├── jam/sessions.js      # Salas en tiempo real (cola, reproduccion y chat)
├── jam/chat.js          # Chat: validacion, historial, reacciones y limite anti-spam
└── tunnel.js            # Script de ngrok

Dockerfile           # Multi-stage build (Angular + Node.js)
.dockerignore        # Exclusiones para Docker build
docker-compose.yml   # Orquestacion con Docker Compose
```

## Scripts

| Comando | Descripcion |
|---------|------------|
| `npm start` | Dev server Angular (puerto 4200) |
| `npm run proxy` | Servidor Express + Socket.IO (puerto 3001) |
| `npm run build` | Build de produccion |
| `npm run tunnel` | Tunnel ngrok para acceso remoto |
| `npm test` | Pruebas unitarias del cliente (Vitest) y del servidor (`node:test`) |
| `npm run test:unit` | Solo las pruebas del cliente |
| `npm run test:server` | Solo las pruebas del servidor |
| `npm run cy:open` | Abrir Cypress para tests E2E |

La integracion continua (`.github/workflows/ci.yml`) corre `npm test` y el build en cada push y pull request.

## Desplegar en Railway

Vinyl necesita un servidor Node siempre encendido (Socket.IO mantiene conexiones abiertas), por eso va en
Railway y no en Vercel (Vercel ejecuta funciones que se apagan y no sirve para WebSockets).

1. En [railway.com](https://railway.com): **New Project → Deploy from GitHub repo → vinyl-player**.
   Railway detecta `railway.json` y construye con el `Dockerfile`.
2. **Settings → Networking → Generate Domain** para tener una URL pública fija.
3. Para que las salas sobrevivan a reinicios y despliegues: **New → Volume**, móntalo en `/data` y agrega la
   variable `DATA_DIR=/data`.
4. Listo: el QR y los enlaces de invitación usan esa URL.

Railway revisa `/api/health` para saber si el despliegue quedó bien.

## Licencia

MIT
