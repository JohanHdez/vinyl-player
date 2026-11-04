import { Injectable, computed, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { PlayerStateService } from './player-state.service';
import { YouTubeService } from './youtube.service';
import { JamParticipant } from '../models/jam-session.model';
import { Song } from '../models/song.model';
import { ChatMessage, Reaction } from '../models/chat.model';
import { MyRoom, RoomStatus, forgetRoom, rememberRoom } from './my-rooms';
import { PROXY_URL } from './proxy-url';

const KEY_CURRENT = 'vinyl_jam_code';
const KEY_NAME = 'vinyl_jam_name';
const KEY_ROOMS = 'vinyl_my_rooms';
const KEY_LISTEN = 'vinyl_listen_here';

function readRooms(): MyRoom[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY_ROOMS) ?? '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Salas en tiempo real. Reglas (las mismas que aplica el servidor):
 * - Solo suena en el dispositivo del anfitrión; los invitados son control remoto.
 * - Una persona puede crear todas las salas que quiera ("Mis salas") y volver
 *   a cualquiera como anfitrión con la llave guardada en este dispositivo.
 * - Cada dispositivo está en una sala a la vez.
 */
@Injectable({ providedIn: 'root' })
export class JamService {
  private socket: Socket | null = null;
  private suppressEmit = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private typingNames = new Map<string, string>();
  private lastTypingSent = 0;
  private roomVisible = false;
  /** Sala a la que volver si se cae la conexión. */
  private rejoinCode = '';

  isInSession = signal(false);
  isHost = signal(false);
  /**
   * Invitado: además de ser control remoto, puede escuchar la sala en su
   * dispositivo (con audífonos), sincronizado con el anfitrión. Por defecto no.
   */
  listenHere = signal(localStorage.getItem(KEY_LISTEN) === '1');
  /** ¿Suena la música en este dispositivo? Anfitrión siempre; invitado si lo pidió. */
  listenLocally = computed(() => this.isHost() || this.listenHere());
  /** Último estado de reproducción conocido de la sala, para calcular por dónde va. */
  private roomClock = { time: 0, playing: false, at: Date.now() };
  connected = signal(true);
  hostOnline = signal(true);
  sessionId = signal('');
  sessionCode = signal('');
  roomName = signal('');
  participants = signal<JamParticipant[]>([]);
  joinDialogOpen = signal(false);
  pendingJamCode = signal('');
  myRooms = signal<MyRoom[]>(readRooms());

  // ── Chat de la sala ──
  messages = signal<ChatMessage[]>([]);
  /** Nombres de quienes están escribiendo ahora. */
  typing = signal<string[]>([]);
  /** Mensajes nuevos mientras la sala no está a la vista. */
  unread = signal(0);
  myName = signal(localStorage.getItem(KEY_NAME) ?? '');

  /** Mi id en la sala (para alinear mis mensajes a la derecha). */
  get myId(): string {
    return this.socket?.id ?? '';
  }

  constructor(
    private state: PlayerStateService,
    private yt: YouTubeService
  ) {
    // Los cambios locales de la cola se envían a la sala.
    this.state.onSongAdded = (song: Song) => {
      if (!this.suppressEmit && this.inRoom()) this.socket!.emit('add-song', { song });
    };
    this.state.onSongRemoved = (index: number) => {
      if (!this.suppressEmit && this.inRoom() && this.isHost()) this.socket!.emit('remove-song', { index });
    };
    this.state.onSongReplaced = (index: number, song: Song) => {
      if (!this.suppressEmit && this.inRoom() && this.isHost()) this.socket!.emit('replace-song', { index, song });
    };
    this.state.onSongPlayed = (index: number) => {
      if (!this.suppressEmit && this.inRoom() && this.isHost()) this.socket!.emit('play-song', { index });
    };
    this.state.onPaused = (currentTime: number) => this.emitPause(currentTime);
    this.state.onResumed = (currentTime: number) => this.emitResume(currentTime);
    this.state.onSeeked = (currentTime: number) => this.emitSeek(currentTime);
  }

  private inRoom(): boolean {
    return !!this.socket && this.isInSession();
  }

  checkUrlForJam(): void {
    const jamCode = new URLSearchParams(window.location.search).get('jam');
    if (jamCode) {
      this.pendingJamCode.set(jamCode.toUpperCase());
      this.joinDialogOpen.set(true);
    }
  }

  // ── Entrar y salir ────────────────────────────────────────

  /** Crea una sala nueva con lo que esté en la cola. Sin límite de salas por persona. */
  createSession(name: string, roomName: string): void {
    this.setName(name);
    this.connect();
    this.socket!.emit('create-session', {
      name,
      roomName,
      playlist: this.state.playlist$.value,
      currentIndex: this.state.currentIndex,
    });
  }

  joinSession(code: string, name: string): void {
    this.setName(name);
    this.connect();
    this.socket!.emit('join-session', { code: code.trim().toUpperCase(), name });
  }

  /** Vuelve a una de "Mis salas" como anfitrión. */
  openMyRoom(code: string): void {
    const room = this.myRooms().find(r => r.code === code);
    if (!room) return;
    this.connect();
    this.socket!.emit('rejoin-session', { code, name: this.myName() || 'Anfitrión', hostKey: room.hostKey });
  }

  forgetMyRoom(code: string): void {
    this.saveRooms(forgetRoom(this.myRooms(), code));
  }

  /** Estado de "Mis salas" (si existen, cuántas personas hay, si el anfitrión está). */
  async roomsStatus(): Promise<RoomStatus[]> {
    const codes = this.myRooms().map(r => r.code);
    if (!codes.length) return [];
    try {
      const resp = await fetch(`${PROXY_URL}/api/rooms/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
      });
      return resp.ok ? ((await resp.json()).rooms as RoomStatus[]) : [];
    } catch {
      return [];
    }
  }

  /** Activa o desactiva "escuchar aquí" (solo aplica a invitados). */
  setListenHere(on: boolean): void {
    this.listenHere.set(on);
    localStorage.setItem(KEY_LISTEN, on ? '1' : '0');
    if (!this.isInSession() || this.isHost()) return;
    if (!on) {
      this.yt.pause();
      this.state.toast$.next('Listo: tu celular vuelve a ser solo control');
      return;
    }
    const index = this.state.currentIndex;
    if (index >= 0 && this.hostOnline()) {
      this.followHere(index, this.roomTime(), this.roomClock.playing);
      this.state.toast$.next('🎧 Escuchando la sala en este dispositivo');
    } else {
      this.state.toast$.next('🎧 Cuando suene algo en la sala, también lo escucharás aquí');
    }
  }

  leaveSession(): void {
    if (this.isInSession() && !this.isHost() && this.listenHere()) this.yt.pause();
    this.stopSyncInterval();
    this.rejoinCode = '';
    if (this.socket) {
      this.socket.emit('leave-session');
      this.socket.disconnect();
      this.socket = null;
    }
    this.resetRoomState();
    localStorage.removeItem(KEY_CURRENT);
  }

  /** Al recargar la página, vuelve a la sala en la que estaba. */
  attemptRejoin(): void {
    const code = localStorage.getItem(KEY_CURRENT);
    const name = localStorage.getItem(KEY_NAME);
    if (!code || !name) return;
    const hostKey = this.myRooms().find(r => r.code === code)?.hostKey;
    this.connect();
    this.socket!.emit('rejoin-session', { code, name, hostKey });
  }

  // ── Chat ──────────────────────────────────────────────

  sendMessage(text: string): void {
    const clean = text.trim();
    if (clean && this.inRoom()) this.socket!.emit('chat-message', { text: clean });
  }

  shareSong(song: Song, text = ''): void {
    if (!this.inRoom()) return;
    const { videoId, title, channel, duration } = song;
    this.socket!.emit('share-song', { song: { videoId, title, channel, duration }, text });
  }

  react(messageId: string, emoji: Reaction): void {
    if (this.inRoom()) this.socket!.emit('react', { messageId, emoji });
  }

  /** Votar adelanta una canción de la cola (o quita el voto). */
  vote(videoId: string): void {
    if (this.inRoom()) this.socket!.emit('vote-song', { videoId });
  }

  /** Avisa que estoy escribiendo, como máximo una vez cada 2 s. */
  notifyTyping(): void {
    const now = Date.now();
    if (now - this.lastTypingSent < 2000 || !this.inRoom()) return;
    this.lastTypingSent = now;
    this.socket!.emit('typing');
  }

  /** La vista de la sala avisa si está abierta, para contar no leídos. */
  setRoomVisible(visible: boolean): void {
    this.roomVisible = visible;
    if (visible) this.unread.set(0);
  }

  // ── Reproducción (solo anfitrión) ─────────────────────────

  emitPause(currentTime: number): void {
    if (!this.suppressEmit && this.inRoom() && this.isHost()) this.socket!.emit('pause-song', { currentTime });
  }

  emitResume(currentTime: number): void {
    if (!this.suppressEmit && this.inRoom() && this.isHost()) this.socket!.emit('resume-song', { currentTime });
  }

  emitSeek(currentTime: number): void {
    if (!this.suppressEmit && this.inRoom() && this.isHost()) this.socket!.emit('seek-song', { currentTime });
  }

  // ── Internos ──────────────────────────────────────────────

  private setName(name: string): void {
    this.myName.set(name);
    localStorage.setItem(KEY_NAME, name);
  }

  private saveRooms(rooms: MyRoom[]): void {
    this.myRooms.set(rooms);
    localStorage.setItem(KEY_ROOMS, JSON.stringify(rooms));
  }

  private resetRoomState(): void {
    this.isInSession.set(false);
    this.isHost.set(false);
    this.state.guestMode = false;
    this.sessionId.set('');
    this.sessionCode.set('');
    this.roomName.set('');
    this.participants.set([]);
    this.messages.set([]);
    this.typing.set([]);
    this.unread.set(0);
    this.hostOnline.set(true);
  }

  private enterRoom(data: RoomSnapshot): void {
    this.messages.set(data.messages ?? []);
    this.sessionId.set(data.sessionId);
    this.sessionCode.set(data.code);
    this.roomName.set(data.roomName ?? '');
    this.participants.set(data.participants ?? []);
    this.hostOnline.set(data.hostOnline ?? true);
    this.isHost.set(!!data.isHost);
    this.isInSession.set(true);
    this.joinDialogOpen.set(false);
    this.rejoinCode = data.code;
    localStorage.setItem(KEY_CURRENT, data.code);

    // Invitado: control remoto, nunca suena en su dispositivo.
    this.state.guestMode = !data.isHost;
    if (data.isHost) {
      this.startSyncInterval();
    } else {
      this.stopSyncInterval();
      this.yt.pause();
    }
  }

  private receiveMessage(message: ChatMessage): void {
    this.messages.update(list => [...list.slice(-199), message]);
    if (message.authorId) this.clearTyping(message.authorId);
    if (!this.roomVisible && message.authorId !== this.myId && message.type !== 'system') {
      this.unread.update(n => n + 1);
    }
  }

  private markTyping(id: string, name: string): void {
    clearTimeout(this.typingTimers.get(id));
    this.typingTimers.set(id, setTimeout(() => this.clearTyping(id), 3500));
    this.typing.update(names => (names.includes(name) ? names : [...names, name]));
    this.typingNames.set(id, name);
  }

  private clearTyping(id: string): void {
    clearTimeout(this.typingTimers.get(id));
    this.typingTimers.delete(id);
    const name = this.typingNames.get(id);
    this.typingNames.delete(id);
    if (name) this.typing.update(names => names.filter(n => n !== name));
  }

  private startSyncInterval(): void {
    this.stopSyncInterval();
    this.syncInterval = setInterval(() => {
      if (this.inRoom() && this.isHost()) {
        this.socket!.emit('sync-playback', {
          currentTime: this.yt.getCurrentTime(),
          duration: this.yt.getDuration(),
          isPlaying: this.state.isPlaying$.value,
        });
      }
    }, 5000);
  }

  private stopSyncInterval(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /** ¿Este invitado está escuchando la sala en su dispositivo? */
  private get hearsHere(): boolean {
    return this.isInSession() && !this.isHost() && this.listenHere();
  }

  private setClock(time: number, playing: boolean): void {
    this.roomClock = { time, playing, at: Date.now() };
  }

  /** Por dónde va la canción en la sala ahora mismo (estimado). */
  private roomTime(): number {
    const { time, playing, at } = this.roomClock;
    return playing ? time + (Date.now() - at) / 1000 : time;
  }

  /** Invitado con audífonos: pone en su dispositivo lo que suena en la sala. */
  private followHere(index: number, time: number, playing: boolean): void {
    const song = this.state.playlist$.value[index];
    if (!song) return;
    this.yt.loadVideoThen(song.videoId, () => {
      // El video tarda en cargar: calcula por dónde va la sala justo cuando ya puede sonar.
      const at = playing ? Math.max(time, this.roomTime()) : time;
      if (at > 1) this.yt.seekTo(at);
      if (!playing) this.yt.pause();
    });
  }

  /** Aplica un cambio que viene de la sala sin reenviarlo. */
  private remote(fn: () => void): void {
    this.suppressEmit = true;
    try {
      fn();
    } finally {
      this.suppressEmit = false;
    }
  }

  private connect(): void {
    if (this.socket) return;
    this.socket = io(PROXY_URL, { transports: ['websocket', 'polling'] });
    const socket = this.socket;

    // Si se cayó la conexión y vuelve, regresa sola a la sala.
    socket.on('connect', () => {
      this.connected.set(true);
      if (this.rejoinCode && this.isInSession()) {
        const hostKey = this.myRooms().find(r => r.code === this.rejoinCode)?.hostKey;
        socket.emit('rejoin-session', { code: this.rejoinCode, name: this.myName(), hostKey });
      }
    });
    socket.on('disconnect', () => {
      this.connected.set(false);
      this.stopSyncInterval();
    });

    socket.on('session-created', (data: RoomSnapshot & { hostKey: string }) => {
      this.saveRooms(rememberRoom(this.myRooms(), { code: data.code, name: data.roomName ?? 'Sala', hostKey: data.hostKey, createdAt: Date.now() }));
      this.enterRoom({ ...data, isHost: true });
    });

    socket.on('session-joined', (data: RoomSnapshot) => this.enterRoom(data));

    socket.on('host-status', (data: { online: boolean }) => {
      this.hostOnline.set(data.online);
      if (!data.online && this.hearsHere) this.yt.pause();
    });

    for (const event of ['participant-joined', 'participant-left', 'participant-updated', 'participant-disconnected']) {
      socket.on(event, (data: { participants: JamParticipant[] }) => this.participants.set(data.participants));
    }

    socket.on('chat-message', (message: ChatMessage) => this.receiveMessage(message));
    socket.on('chat-reaction', (data: { messageId: string; reactions: ChatMessage['reactions'] }) => {
      this.messages.update(list => list.map(m => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
    });
    socket.on('typing', (data: { id: string; name: string }) => this.markTyping(data.id, data.name));
    socket.on('chat-error', (data: { message: string }) => this.state.toast$.next(data.message));
    socket.on('vote-error', (data: { message: string }) => this.state.toast$.next(data.message));

    // ── Cola ──
    // El servidor manda la cola completa ya ordenada por votos tras cada cambio.
    socket.on('queue-updated', (data: { playlist: Song[]; currentIndex: number }) =>
      this.remote(() => {
        // El anfitrión conserva la canción que está sonando en su dispositivo.
        const playingId = this.state.currentSong$.value?.videoId;
        const index = this.isHost() && playingId ? data.playlist.findIndex(s => s.videoId === playingId) : data.currentIndex;
        this.state.resetPlaylist(data.playlist, index);
      })
    );
    socket.on('song-added', (data: { song: Song }) =>
      this.remote(() => {
        const prev = this.state.suppressToast;
        this.state.suppressToast = true;
        this.state.addToPlaylist(data.song);
        this.state.suppressToast = prev;
      })
    );
    socket.on('song-replaced', (data: { index: number; song: Song }) =>
      this.remote(() => {
        this.state.replaceSong(data.index, data.song);
        if (data.index !== this.state.currentIndex) return;
        if (this.isHost()) this.state.play(data.index);
        else if (this.hearsHere) this.followHere(data.index, 0, true);
      })
    );
    socket.on('song-removed', (data: { index: number }) =>
      this.remote(() => this.state.removeFromPlaylist(data.index, { remote: true }))
    );

    // ── Reproducción: el anfitrión reproduce; los invitados ven qué suena y,
    //    si activaron "escuchar aquí", lo siguen en su dispositivo ──
    socket.on('song-played', (data: { index: number }) =>
      this.remote(() => {
        this.setClock(0, true);
        if (this.isHost()) {
          this.state.play(data.index);
          return;
        }
        this.state.setCurrentSongDisplay(data.index);
        this.state.setPlaying(true);
        if (this.hearsHere) this.followHere(data.index, 0, true);
      })
    );
    socket.on('song-paused', (data: { currentTime: number }) =>
      this.remote(() => {
        this.setClock(data.currentTime, false);
        if (this.hearsHere) this.yt.pause();
        this.state.updateTime(data.currentTime, this.state.duration$.value);
        this.state.setPlaying(false);
      })
    );
    socket.on('song-resumed', (data: { currentTime: number }) =>
      this.remote(() => {
        this.setClock(data.currentTime, true);
        if (this.hearsHere) {
          this.yt.seekTo(data.currentTime);
          this.yt.play();
        }
        this.state.updateTime(data.currentTime, this.state.duration$.value);
        this.state.setPlaying(true);
      })
    );
    socket.on('song-seeked', (data: { currentTime: number }) =>
      this.remote(() => {
        this.setClock(data.currentTime, this.roomClock.playing);
        if (this.hearsHere) this.yt.seekTo(data.currentTime);
        this.state.updateTime(data.currentTime, this.state.duration$.value);
      })
    );
    socket.on('playback-synced', (data: { currentTime: number; duration?: number; isPlaying: boolean }) => {
      if (this.isHost()) return;
      this.setClock(data.currentTime, data.isPlaying);
      if (this.hearsHere) {
        // Corrige el desfase solo si pasa de 2 s, para no cortar el audio a cada rato.
        if (Math.abs(this.yt.getCurrentTime() - data.currentTime) > 2) this.yt.seekTo(data.currentTime);
        if (data.isPlaying && !this.state.isPlaying$.value) this.yt.play();
        if (!data.isPlaying && this.state.isPlaying$.value) this.yt.pause();
        return; // el reproductor local ya actualiza el tiempo y el estado
      }
      this.state.updateTime(data.currentTime, data.duration || this.state.duration$.value);
      this.state.setPlaying(data.isPlaying);
    });

    // Al entrar: la cola de la sala reemplaza la local.
    socket.on('sync-state', (data: { playlist: Song[]; currentIndex: number; isPlaying?: boolean; currentTime?: number; duration?: number }) =>
      this.remote(() => {
        this.state.resetPlaylist(data.playlist, -1);
        if (data.currentIndex < 0 || !data.playlist[data.currentIndex]) return;
        this.state.setCurrentSongDisplay(data.currentIndex);
        if (this.isHost()) {
          // El anfitrión retoma la canción donde iba (en pausa si estaba en pausa).
          this.yt.loadVideoThen(data.playlist[data.currentIndex].videoId, () => {
            if (data.currentTime && data.currentTime > 0) this.yt.seekTo(data.currentTime);
            if (!data.isPlaying) this.yt.pause();
          });
        } else {
          this.setClock(data.currentTime ?? 0, !!data.isPlaying);
          this.state.updateTime(data.currentTime ?? 0, data.duration ?? 0);
          this.state.setPlaying(!!data.isPlaying);
          if (this.hearsHere) this.followHere(data.currentIndex, data.currentTime ?? 0, !!data.isPlaying);
        }
      })
    );

    socket.on('session-expired', (data?: { code?: string }) => {
      if (data?.code) this.forgetMyRoom(data.code);
      localStorage.removeItem(KEY_CURRENT);
      this.rejoinCode = '';
      this.resetRoomState();
      this.state.toast$.next('Esa sala ya no existe. Puedes crear una nueva.');
    });

    socket.on('error', (data: { message: string }) => this.state.toast$.next(data.message));
  }
}

interface RoomSnapshot {
  sessionId: string;
  code: string;
  roomName?: string;
  participants?: JamParticipant[];
  isHost?: boolean;
  hostOnline?: boolean;
  messages?: ChatMessage[];
}
