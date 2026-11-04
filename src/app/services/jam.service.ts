import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { PlayerStateService } from './player-state.service';
import { YouTubeService } from './youtube.service';
import { JamParticipant } from '../models/jam-session.model';
import { Song } from '../models/song.model';
import { ChatMessage, Reaction } from '../models/chat.model';
import { PROXY_URL } from './proxy-url';

@Injectable({ providedIn: 'root' })
export class JamService {
  private socket: Socket | null = null;
  private readonly SERVER_URL = PROXY_URL;
  private suppressEmit = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastTypingSent = 0;

  isInSession = signal(false);
  isHost = signal(false);
  listenLocally = signal(true);
  sessionId = signal('');
  sessionCode = signal('');
  participants = signal<JamParticipant[]>([]);
  joinDialogOpen = signal(false);
  pendingJamCode = signal('');

  // ── Chat de la sala ──
  messages = signal<ChatMessage[]>([]);
  /** Nombres de quienes están escribiendo ahora. */
  typing = signal<string[]>([]);
  /** Mensajes nuevos mientras la sala no está a la vista. */
  unread = signal(0);
  myName = signal(localStorage.getItem('vinyl_jam_name') ?? '');
  private roomVisible = false;

  /** Mi id en la sala (para alinear mis mensajes a la derecha). */
  get myId(): string {
    return this.socket?.id ?? '';
  }

  constructor(
    private state: PlayerStateService,
    private yt: YouTubeService
  ) {
    // Wire hooks so playlist mutations emit socket events
    this.state.onSongAdded = (song: Song) => {
      if (!this.suppressEmit) this.emitAddSong(song);
    };
    this.state.onSongRemoved = (index: number) => {
      if (!this.suppressEmit) this.emitRemoveSong(index);
    };
    // Solo el anfitrión reemplaza versiones bloqueadas, y lo comparte con todos.
    this.state.onSongReplaced = (index: number, song: Song) => {
      if (!this.suppressEmit && this.socket && this.isInSession() && this.isHost()) {
        this.socket.emit('replace-song', { index, song });
      }
    };
    this.state.onSongPlayed = (index: number) => {
      if (!this.suppressEmit) this.emitPlaySong(index);
    };
    this.state.onPaused = (currentTime: number) => {
      if (!this.suppressEmit) this.emitPause(currentTime);
    };
    this.state.onResumed = (currentTime: number) => {
      if (!this.suppressEmit) this.emitResume(currentTime);
    };
    this.state.onSeeked = (currentTime: number) => {
      if (!this.suppressEmit) this.emitSeek(currentTime);
    };
  }

  checkUrlForJam(): void {
    const params = new URLSearchParams(window.location.search);
    const jamCode = params.get('jam');
    if (jamCode) {
      this.pendingJamCode.set(jamCode);
      this.joinDialogOpen.set(true);
    }
  }

  createSession(name = 'Anfitrión'): void {
    this.myName.set(name);
    this.listenLocally.set(true);
    this.connect();
    // Send current playlist state so guests can sync
    const playlist = this.state.playlist$.value;
    const currentIndex = this.state.currentIndex;
    const currentTime = this.yt.getCurrentTime();
    const duration = this.yt.getDuration();
    const isPlaying = this.state.isPlaying$.value;
    this.socket!.emit('create-session', {
      name,
      playlist,
      currentIndex,
      currentTime,
      duration,
      isPlaying,
    });
  }

  joinSession(code: string, name: string, listenLocally: boolean = true): void {
    this.myName.set(name);
    localStorage.setItem('vinyl_jam_name', name);
    this.listenLocally.set(listenLocally);
    this.connect();
    this.socket!.emit('join-session', { code, name, listenLocally });
  }

  leaveSession(): void {
    this.stopSyncInterval();
    if (this.socket) {
      this.socket.emit('leave-session');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isInSession.set(false);
    this.isHost.set(false);
    this.listenLocally.set(true);
    this.sessionId.set('');
    this.sessionCode.set('');
    this.participants.set([]);
    this.messages.set([]);
    this.typing.set([]);
    this.unread.set(0);
    localStorage.removeItem('vinyl_jam_code');
    localStorage.removeItem('vinyl_jam_name');
    localStorage.removeItem('vinyl_jam_listen');
  }

  attemptRejoin(): void {
    const code = localStorage.getItem('vinyl_jam_code');
    const name = localStorage.getItem('vinyl_jam_name');
    if (!code || !name) return;
    const listen = localStorage.getItem('vinyl_jam_listen') !== 'false';
    this.listenLocally.set(listen);
    this.connect();
    this.socket!.emit('rejoin-session', { code, name, listenLocally: listen });
  }

  switchListenMode(listenLocally: boolean): void {
    this.listenLocally.set(listenLocally);
    localStorage.setItem('vinyl_jam_listen', String(listenLocally));
    if (this.socket && this.isInSession()) {
      this.socket.emit('update-listen-mode', { listenLocally });
    }
    // If switching to local: start playing the current song via YouTube
    if (listenLocally && this.state.currentIndex >= 0) {
      const playlist = this.state.playlist$.value;
      const song = playlist[this.state.currentIndex];
      if (song) {
        this.yt.loadVideoThen(song.videoId, () => {
          const ct = this.state.currentTime$.value;
          if (ct > 0) this.yt.seekTo(ct);
          if (!this.state.isPlaying$.value) this.yt.pause();
        });
      }
    }
    // If switching to remote: stop local YouTube playback
    if (!listenLocally) {
      this.yt.pause();
    }
  }

  // ── Chat ──────────────────────────────────────────────

  sendMessage(text: string): void {
    const clean = text.trim();
    if (clean && this.socket && this.isInSession()) this.socket.emit('chat-message', { text: clean });
  }

  shareSong(song: Song, text = ''): void {
    if (this.socket && this.isInSession()) {
      const { videoId, title, channel, duration } = song;
      this.socket.emit('share-song', { song: { videoId, title, channel, duration }, text });
    }
  }

  react(messageId: string, emoji: Reaction): void {
    if (this.socket && this.isInSession()) this.socket.emit('react', { messageId, emoji });
  }

  /** Avisa que estoy escribiendo, como máximo una vez cada 2 s. */
  notifyTyping(): void {
    const now = Date.now();
    if (now - this.lastTypingSent < 2000 || !this.socket || !this.isInSession()) return;
    this.lastTypingSent = now;
    this.socket.emit('typing');
  }

  /** La vista de la sala avisa si está abierta, para contar no leídos. */
  setRoomVisible(visible: boolean): void {
    this.roomVisible = visible;
    if (visible) this.unread.set(0);
  }

  private receiveMessage(message: ChatMessage): void {
    this.messages.update(list => [...list.slice(-199), message]);
    // Si escribió, ya no está "escribiendo".
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

  private typingNames = new Map<string, string>();

  private clearTyping(id: string): void {
    clearTimeout(this.typingTimers.get(id));
    this.typingTimers.delete(id);
    const name = this.typingNames.get(id);
    this.typingNames.delete(id);
    if (name) this.typing.update(names => names.filter(n => n !== name));
  }

  emitPause(currentTime: number): void {
    if (this.socket && this.isInSession() && this.isHost()) {
      this.socket.emit('pause-song', { currentTime });
    }
  }

  emitResume(currentTime: number): void {
    if (this.socket && this.isInSession() && this.isHost()) {
      this.socket.emit('resume-song', { currentTime });
    }
  }

  emitSeek(currentTime: number): void {
    if (this.socket && this.isInSession() && this.isHost()) {
      this.socket.emit('seek-song', { currentTime });
    }
  }

  private emitAddSong(song: Song): void {
    if (this.socket && this.isInSession()) {
      this.socket.emit('add-song', { song });
    }
  }

  private emitRemoveSong(index: number): void {
    if (this.socket && this.isInSession()) {
      this.socket.emit('remove-song', { index });
    }
  }

  private emitPlaySong(index: number): void {
    if (this.socket && this.isInSession()) {
      this.socket.emit('play-song', { index });
    }
  }

  private startSyncInterval(): void {
    this.stopSyncInterval();
    if (!this.isHost()) return;
    this.syncInterval = setInterval(() => {
      if (this.socket && this.isInSession() && this.isHost()) {
        const currentTime = this.yt.getCurrentTime();
        const duration = this.yt.getDuration();
        const isPlaying = this.state.isPlaying$.value;
        this.socket.emit('sync-playback', { currentTime, duration, isPlaying });
      }
    }, 5000);
  }

  private stopSyncInterval(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /** Whether this client should control YouTube playback */
  private get shouldPlayLocally(): boolean {
    return this.listenLocally() || this.isHost();
  }

  private connect(): void {
    if (this.socket) return;

    this.socket = io(this.SERVER_URL, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('session-created', (data: { sessionId: string; code: string; messages?: ChatMessage[] }) => {
      this.messages.set(data.messages ?? []);
      this.sessionId.set(data.sessionId);
      this.sessionCode.set(data.code);
      this.isHost.set(true);
      this.isInSession.set(true);
      localStorage.setItem('vinyl_jam_code', data.code);
      localStorage.setItem('vinyl_jam_name', this.myName());
      localStorage.setItem('vinyl_jam_listen', 'true');
      this.startSyncInterval();
    });

    this.socket.on('session-joined', (data: { sessionId: string; code: string; participants: JamParticipant[]; isHost?: boolean; messages?: ChatMessage[] }) => {
      this.messages.set(data.messages ?? []);
      this.sessionId.set(data.sessionId);
      this.sessionCode.set(data.code);
      this.isInSession.set(true);
      this.participants.set(data.participants);
      this.joinDialogOpen.set(false);
      if (data.isHost) {
        this.isHost.set(true);
        this.listenLocally.set(true);
        this.startSyncInterval();
      }
      const storedName = localStorage.getItem('vinyl_jam_name');
      if (!storedName) {
        const me = data.participants.find(p => !p.isHost);
        localStorage.setItem('vinyl_jam_name', me?.name || 'Invitado');
      }
      localStorage.setItem('vinyl_jam_code', data.code);
      localStorage.setItem('vinyl_jam_listen', String(this.listenLocally()));
    });

    this.socket.on('participant-joined', (data: { participants: JamParticipant[] }) => {
      this.participants.set(data.participants);
    });

    this.socket.on('chat-message', (message: ChatMessage) => this.receiveMessage(message));

    this.socket.on('chat-reaction', (data: { messageId: string; reactions: ChatMessage['reactions'] }) => {
      this.messages.update(list => list.map(m => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
    });

    this.socket.on('typing', (data: { id: string; name: string }) => this.markTyping(data.id, data.name));

    this.socket.on('chat-error', (data: { message: string }) => this.state.toast$.next(data.message));

    this.socket.on('participant-left', (data: { participants: JamParticipant[] }) => {
      this.participants.set(data.participants);
    });

    this.socket.on('participant-updated', (data: { participants: JamParticipant[] }) => {
      this.participants.set(data.participants);
    });

    this.socket.on('participant-disconnected', (data: { participants: JamParticipant[]; disconnectedName: string }) => {
      this.participants.set(data.participants);
      this.state.toast$.next(`${data.disconnectedName} se desconecto (5 min para reconectar)`);
    });

    this.socket.on('song-added', (data: { song: Song }) => {
      this.suppressEmit = true;
      this.state.addToPlaylist(data.song);
      this.suppressEmit = false;
    });

    this.socket.on('song-replaced', (data: { index: number; song: Song }) => {
      this.suppressEmit = true;
      this.state.replaceSong(data.index, data.song);
      if (data.index === this.state.currentIndex && this.shouldPlayLocally) this.state.play(data.index);
      this.suppressEmit = false;
    });

    this.socket.on('song-removed', (data: { index: number }) => {
      this.suppressEmit = true;
      this.state.removeFromPlaylist(data.index);
      this.suppressEmit = false;
    });

    this.socket.on('song-played', (data: { index: number }) => {
      this.suppressEmit = true;
      if (this.shouldPlayLocally) {
        this.state.play(data.index);
      } else {
        this.state.setCurrentSongDisplay(data.index);
        this.state.setPlaying(true);
      }
      this.suppressEmit = false;
    });

    this.socket.on('song-paused', (data: { currentTime: number }) => {
      this.suppressEmit = true;
      if (this.shouldPlayLocally) {
        this.yt.seekTo(data.currentTime);
        this.yt.pause();
      } else {
        this.state.updateTime(data.currentTime, this.state.duration$.value);
        this.state.setPlaying(false);
      }
      this.suppressEmit = false;
    });

    this.socket.on('song-resumed', (data: { currentTime: number }) => {
      this.suppressEmit = true;
      if (this.shouldPlayLocally) {
        this.yt.seekTo(data.currentTime);
        this.yt.play();
      } else {
        this.state.updateTime(data.currentTime, this.state.duration$.value);
        this.state.setPlaying(true);
      }
      this.suppressEmit = false;
    });

    this.socket.on('song-seeked', (data: { currentTime: number }) => {
      this.suppressEmit = true;
      if (this.shouldPlayLocally) {
        this.yt.seekTo(data.currentTime);
      } else {
        this.state.updateTime(data.currentTime, this.state.duration$.value);
      }
      this.suppressEmit = false;
    });

    this.socket.on('playback-synced', (data: { currentTime: number; duration?: number; isPlaying: boolean }) => {
      if (this.shouldPlayLocally) {
        // Only correct if drift > 2 seconds
        const localTime = this.yt.getCurrentTime();
        const drift = Math.abs(localTime - data.currentTime);
        if (drift > 2) {
          this.yt.seekTo(data.currentTime);
        }
        const localPlaying = this.state.isPlaying$.value;
        if (data.isPlaying && !localPlaying) {
          this.yt.play();
        } else if (!data.isPlaying && localPlaying) {
          this.yt.pause();
        }
      } else {
        // Remote listening: update display only
        const duration = data.duration || this.state.duration$.value;
        this.state.updateTime(data.currentTime, duration);
        this.state.setPlaying(data.isPlaying);
      }
    });

    this.socket.on('sync-state', (data: { playlist: Song[]; currentIndex: number; isPlaying?: boolean; currentTime?: number; duration?: number }) => {
      this.suppressEmit = true;
      this.state.suppressToast = true;
      for (const song of data.playlist) {
        this.state.addToPlaylist(song);
      }
      this.state.suppressToast = false;
      if (data.currentIndex >= 0) {
        if (this.shouldPlayLocally) {
          // Use the current song's videoId to load directly with callback
          const playlist = this.state.playlist$.value;
          const song = playlist[data.currentIndex];
          if (song) {
            this.state.setCurrentSongDisplay(data.currentIndex);
            this.yt.loadVideoThen(song.videoId, () => {
              if (data.currentTime && data.currentTime > 0) {
                this.yt.seekTo(data.currentTime);
              }
              if (data.isPlaying === false) {
                this.yt.pause();
              }
            });
          }
        } else {
          // Remote listening: show song info without YouTube
          this.state.setCurrentSongDisplay(data.currentIndex);
          if (data.currentTime) {
            const duration = data.duration || 0;
            this.state.updateTime(data.currentTime, duration);
          }
          this.state.setPlaying(data.isPlaying ?? false);
        }
      }
      this.suppressEmit = false;
    });

    this.socket.on('session-expired', () => {
      localStorage.removeItem('vinyl_jam_code');
      localStorage.removeItem('vinyl_jam_name');
      localStorage.removeItem('vinyl_jam_listen');
      this.state.toast$.next('La sesion Jam ha expirado');
    });

    this.socket.on('error', (data: { message: string }) => {
      this.state.toast$.next(data.message);
    });

    this.socket.on('disconnect', () => {
      this.stopSyncInterval();
      this.isInSession.set(false);
      this.isHost.set(false);
    });
  }
}
