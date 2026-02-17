import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { PlayerStateService } from './player-state.service';
import { YouTubeService } from './youtube.service';
import { JamParticipant } from '../models/jam-session.model';
import { Song } from '../models/song.model';
import { PROXY_URL } from './proxy-url';

@Injectable({ providedIn: 'root' })
export class JamService {
  private socket: Socket | null = null;
  private readonly SERVER_URL = PROXY_URL;
  private suppressEmit = false;
  private syncInterval: any = null;

  isInSession = signal(false);
  isHost = signal(false);
  sessionId = signal('');
  sessionCode = signal('');
  participants = signal<JamParticipant[]>([]);
  joinDialogOpen = signal(false);
  pendingJamCode = signal('');

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

  createSession(): void {
    this.connect();
    this.socket!.emit('create-session', { name: 'Host' });
  }

  joinSession(code: string, name: string): void {
    this.connect();
    this.socket!.emit('join-session', { code, name });
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
    this.sessionId.set('');
    this.sessionCode.set('');
    this.participants.set([]);
    localStorage.removeItem('vinyl_jam_code');
    localStorage.removeItem('vinyl_jam_name');
  }

  attemptRejoin(): void {
    const code = localStorage.getItem('vinyl_jam_code');
    const name = localStorage.getItem('vinyl_jam_name');
    if (!code || !name) return;
    this.connect();
    this.socket!.emit('rejoin-session', { code, name });
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
    if (this.socket && this.isInSession() && this.isHost()) {
      this.socket.emit('play-song', { index });
    }
  }

  private startSyncInterval(): void {
    this.stopSyncInterval();
    if (!this.isHost()) return;
    this.syncInterval = setInterval(() => {
      if (this.socket && this.isInSession() && this.isHost()) {
        const currentTime = this.yt.getCurrentTime();
        const isPlaying = this.state.isPlaying$.value;
        this.socket.emit('sync-playback', { currentTime, isPlaying });
      }
    }, 5000);
  }

  private stopSyncInterval(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private connect(): void {
    if (this.socket) return;

    this.socket = io(this.SERVER_URL, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('session-created', (data: { sessionId: string; code: string }) => {
      this.sessionId.set(data.sessionId);
      this.sessionCode.set(data.code);
      this.isHost.set(true);
      this.isInSession.set(true);
      localStorage.setItem('vinyl_jam_code', data.code);
      localStorage.setItem('vinyl_jam_name', 'Host');
      this.startSyncInterval();
    });

    this.socket.on('session-joined', (data: { sessionId: string; code: string; participants: JamParticipant[]; isHost?: boolean }) => {
      this.sessionId.set(data.sessionId);
      this.sessionCode.set(data.code);
      this.isInSession.set(true);
      this.participants.set(data.participants);
      this.joinDialogOpen.set(false);
      if (data.isHost) {
        this.isHost.set(true);
        this.startSyncInterval();
      }
      const storedName = localStorage.getItem('vinyl_jam_name');
      if (!storedName) {
        const me = data.participants.find(p => !p.isHost);
        localStorage.setItem('vinyl_jam_name', me?.name || 'Invitado');
      }
      localStorage.setItem('vinyl_jam_code', data.code);
    });

    this.socket.on('participant-joined', (data: { participants: JamParticipant[] }) => {
      this.participants.set(data.participants);
      this.state.toast$.next('Un participante se unio al Jam');
    });

    this.socket.on('participant-left', (data: { participants: JamParticipant[] }) => {
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

    this.socket.on('song-removed', (data: { index: number }) => {
      this.suppressEmit = true;
      this.state.removeFromPlaylist(data.index);
      this.suppressEmit = false;
    });

    this.socket.on('song-played', (data: { index: number }) => {
      this.suppressEmit = true;
      this.state.play(data.index);
      this.suppressEmit = false;
    });

    this.socket.on('song-paused', (data: { currentTime: number }) => {
      this.suppressEmit = true;
      this.yt.seekTo(data.currentTime);
      this.yt.pause();
      this.suppressEmit = false;
    });

    this.socket.on('song-resumed', (data: { currentTime: number }) => {
      this.suppressEmit = true;
      this.yt.seekTo(data.currentTime);
      this.yt.play();
      this.suppressEmit = false;
    });

    this.socket.on('song-seeked', (data: { currentTime: number }) => {
      this.suppressEmit = true;
      this.yt.seekTo(data.currentTime);
      this.suppressEmit = false;
    });

    this.socket.on('playback-synced', (data: { currentTime: number; isPlaying: boolean }) => {
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
    });

    this.socket.on('sync-state', (data: { playlist: Song[]; currentIndex: number; isPlaying?: boolean; currentTime?: number }) => {
      this.suppressEmit = true;
      for (const song of data.playlist) {
        this.state.addToPlaylist(song);
      }
      if (data.currentIndex >= 0) {
        this.state.play(data.currentIndex);
        // Delay seek/pause to allow video to load
        setTimeout(() => {
          if (data.currentTime && data.currentTime > 0) {
            this.yt.seekTo(data.currentTime);
          }
          if (data.isPlaying === false) {
            this.yt.pause();
          }
        }, 1500);
      }
      this.suppressEmit = false;
    });

    this.socket.on('session-expired', () => {
      localStorage.removeItem('vinyl_jam_code');
      localStorage.removeItem('vinyl_jam_name');
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
