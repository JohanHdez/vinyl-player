# Vinyl Player

## Descripcion
Aplicacion web de reproductor de musica estilo vinyl/tocadiscos con integracion de YouTube, sesiones colaborativas "Jam" en tiempo real via Socket.IO, y una interfaz dark con estetica warm analog hi-fi.

## Stack Tecnologico
- **Framework**: Angular 21 (standalone components, Signals)
- **Lenguaje**: TypeScript 5.9
- **Estilos**: SCSS (inline style language)
- **Backend**: Express 5 + Socket.IO (Node.js)
- **Tunnel**: ngrok (para compartir sesiones Jam entre dispositivos)
- **Idioma UI**: Espanol

## Comandos
- `npm start` — Angular dev server (puerto 4200)
- `npm run proxy` — Servidor Express proxy + Socket.IO (puerto 3001)
- `npm run build` — Build de produccion
- `npm run tunnel` — Tunel ngrok para compartir sesiones Jam (requiere NGROK_AUTHTOKEN en .env)
- `npm run cy:open` / `npm run cy:run` — Cypress E2E tests

## Configuracion de Entorno
- Archivo `.env` en la raiz del proyecto (NO se sube a git):
  - `NGROK_AUTHTOKEN` — Token de autenticacion de ngrok
- ngrok configurado globalmente en `C:\Users\123\AppData\Local\ngrok\ngrok.yml`
- ngrok CLI instalado via winget en `C:\Users\123\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe`

## Levantar la App para Jam (acceso remoto)
1. `npm run build` — Compilar Angular
2. `npm run proxy` — Levantar servidor Express en puerto 3001 (sirve la app + API + Socket.IO)
3. Abrir ngrok: `ngrok http 3001` (o `npm run tunnel` si se tiene @ngrok/ngrok instalado)
4. Compartir la URL publica de ngrok

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
│   │   └── jam-join/        # Modal para unirse a sesion Jam (con seleccion de dispositivo)
│   ├── services/
│   │   ├── youtube.service.ts      # YouTube IFrame API + proxy API calls
│   │   ├── player-state.service.ts # Estado global (playlist, playback, BehaviorSubjects)
│   │   ├── jam.service.ts          # Socket.IO, sesiones colaborativas, modo escucha
│   │   └── proxy-url.ts            # Resolucion de URL del proxy segun entorno
│   └── models/
│       ├── song.model.ts           # Interface Song {videoId, title, channel}
│       └── jam-session.model.ts    # Interfaces JamSession, JamParticipant, JamEvent
├── styles.scss              # Variables CSS globales, tipografia, noise overlay, ambient
├── index.html               # Entry point HTML
└── main.ts                  # Bootstrap Angular

server/
├── proxy.js                 # Express: YouTube API proxy, Socket.IO Jam server, static files
└── tunnel.js                # ngrok tunnel script (usa @ngrok/ngrok)

.env                         # Variables de entorno (NGROK_AUTHTOKEN) — NO en git
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
- **Colores**: fondo oscuro (#080604), brass (#C8984C), rojo (#C44B3F), texto cream (#EDE4D6)
- **Tipografia**: Young Serif (display), Syne (body) — importadas via Google Fonts
- **Glass morphism**: backdrop-filter blur + bordes translucidos
- **Componentes usan** `styleUrl` (singular) apuntando a archivo .scss separado

### Servicios
- **YouTubeService**: carga IFrame API, reproduce videos, hace llamadas al proxy `/api/search`, `/api/trending`, `/api/video-info`
- **PlayerStateService**: estado centralizado con hooks para Jam (onSongAdded, onPaused, etc.). Metodo `setCurrentSongDisplay()` actualiza UI sin disparar YouTube.
- **JamService**: maneja conexion Socket.IO, sincronizacion de playlist y playback entre participantes. Signal `listenLocally` controla si el audio se reproduce localmente o en el host.

### Jam Sessions
- **Crear sesion**: Host genera codigo de 6 caracteres + QR code
- **Unirse**: Invitados escanean QR o ingresan codigo, eligen nombre y modo de escucha
- **Modos de escucha**:
  - "En mi dispositivo" — audio se reproduce en el dispositivo del invitado (sincronizado)
  - "En el host" — solo control de playlist, audio en dispositivo del host
- **Sincronizacion**: host emite sync-playback cada 5 segundos con currentTime, duration, isPlaying
- **Drift correction**: si diferencia > 2 segundos, se corrige posicion
- **Reconexion**: grace period de 5 minutos, localStorage guarda codigo/nombre/modo

### Servidor Proxy (server/proxy.js)
- Puerto 3001
- Endpoints: POST `/api/search`, `/api/trending`, `/api/video-info`
- Parsea respuestas de YouTube InnerTube API
- Maneja sesiones Jam en memoria con codigos de 6 caracteres
- Participantes almacenan `listenLocally` flag
- Emite `duration` en sync-playback y sync-state
- Grace period de 5 minutos para reconexion
- Sirve build estatico de Angular en produccion

### Proxy URL Resolution (proxy-url.ts)
- Local dev (puerto 4200): apunta a `http://localhost:3001`
- Servido desde proxy (puerto 3001): usa `''` (mismo origen)
- Remoto (ngrok/tunnel): usa `''` (mismo origen)
- Override manual via query param `?proxy=URL`

## Notas
- No hay tests unitarios (skipTests: true en schematics)
- Cypress para E2E tests
- El YouTube player se oculta como iframe 1x1px
- GitHub repo: https://github.com/JohanHdez/vinyl-player
- ngrok authtoken almacenado en `.env` y en config global de ngrok
