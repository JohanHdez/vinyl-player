# Vinyl Player

## Descripcion
Aplicacion web de reproductor de musica estilo vinyl/tocadiscos con integracion de YouTube, sesiones colaborativas "Jam" en tiempo real via Socket.IO, y una interfaz dark con glass morphism.

## Stack Tecnologico
- **Framework**: Angular 21 (standalone components, Signals)
- **Lenguaje**: TypeScript 5.9
- **Estilos**: SCSS (inline style language)
- **Backend**: Express 5 + Socket.IO (Node.js)
- **Idioma UI**: Español

## Comandos
- `npm start` — Angular dev server (puerto 4200)
- `npm run proxy` — Servidor Express proxy + Socket.IO (puerto 3001)
- `npm run build` — Build de produccion
- `npm run tunnel` — Tunel ngrok para compartir sesiones Jam
- `npm run cy:open` / `npm run cy:run` — Cypress E2E tests

## Estructura del Proyecto

```
src/
├── app/
│   ├── app.ts              # Componente root (manejo de vistas con Signals)
│   ├── app.html             # Template principal (sidebar + vistas + player bar)
│   ├── app.scss             # Shell layout, sidebar, responsive
│   ├── app.routes.ts        # Rutas vacias (usa Signals para navegacion)
│   ├── app.config.ts        # Config de providers
│   ├── components/
│   │   ├── turntable/       # Tocadiscos animado con vinilo giratorio y brazo
│   │   ├── player-controls/ # Barra de controles: play/pause, progress, volumen
│   │   ├── search-bar/      # Barra de busqueda (texto o URL de YouTube)
│   │   ├── search-results/  # Lista de resultados de busqueda
│   │   ├── playlist/        # Cola de reproduccion con EQ bars animados
│   │   ├── trending-grid/   # Grid de canciones en tendencia estilo YouTube
│   │   ├── jam-panel/       # Panel de sesion Jam (codigo, QR, participantes)
│   │   └── jam-join/        # Modal para unirse a sesion Jam
│   ├── services/
│   │   ├── youtube.service.ts      # YouTube IFrame API + proxy API calls
│   │   ├── player-state.service.ts # Estado global (playlist, playback, BehaviorSubjects)
│   │   ├── jam.service.ts          # Socket.IO, sesiones colaborativas
│   │   └── proxy-url.ts            # Resolucion de URL del proxy segun entorno
│   └── models/
│       ├── song.model.ts           # Interface Song {videoId, title, channel}
│       └── jam-session.model.ts    # Interfaces JamSession, JamParticipant, JamEvent
├── styles.scss              # Variables CSS globales, tipografia, noise overlay, ambient
├── index.html               # Entry point HTML
└── main.ts                  # Bootstrap Angular

server/
├── proxy.js                 # Express: YouTube API proxy, Socket.IO Jam server, static files
└── tunnel.js                # ngrok tunnel script
```

## Patrones y Convenciones

### Arquitectura Angular
- **Standalone components** — no NgModules, cada componente importa sus dependencias
- **Signals + computed** — para estado reactivo en componentes
- **BehaviorSubjects (RxJS)** — para servicios compartidos (PlayerStateService)
- **Vista por Signal** — `currentView` signal en lugar de Angular Router
- **Vistas**: `home`, `search`, `nowplaying`, `library`

### Estilos
- **Design system con CSS variables** definidas en `:root` de `styles.scss`
- **Colores actuales**: fondo oscuro (#080604), brass (#C8984C), rojo (#C44B3F), texto cream (#EDE4D6)
- **Tipografia**: Young Serif (display), Syne (body) — importadas via Google Fonts en styles.scss
- **Glass morphism**: backdrop-filter blur + bordes translucidos
- **Componentes usan** `styleUrl` (singular) apuntando a archivo .scss separado
- **SCSS pattern**: cada componente tiene su propio .scss con estilos encapsulados

### Servicios
- **YouTubeService**: carga IFrame API, reproduce videos, hace llamadas al proxy `/api/search`, `/api/trending`, `/api/video-info`
- **PlayerStateService**: estado centralizado con hooks para Jam (onSongAdded, onPaused, etc.)
- **JamService**: maneja conexion Socket.IO, sincronizacion de playlist y playback entre participantes

### Servidor Proxy (server/proxy.js)
- Puerto 3001
- Endpoints: POST `/api/search`, `/api/trending`, `/api/video-info`
- Parsea respuestas de YouTube InnerTube API
- Maneja sesiones Jam en memoria con codigos de 6 caracteres
- Grace period de 5 minutos para reconexion
- Sirve build estatico de Angular en produccion

## Notas
- No hay tests unitarios (skipTests: true en schematics)
- Cypress para E2E tests
- El YouTube player se oculta como iframe 1x1px
- Las sesiones Jam sincronizan playback cada 5 segundos (solo host)
- Correccion de drift > 2 segundos entre participantes
