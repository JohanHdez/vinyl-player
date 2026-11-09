import { Injectable, NgZone, inject } from '@angular/core';
import { JamService } from './jam.service';
import { PlayerStateService } from './player-state.service';
import { YouTubeService } from './youtube.service';
import { mediaMetadataFor } from './background-play';

/**
 * Pantalla de bloqueo y notificación de música del sistema (Media Session API):
 * muestra qué suena y deja pausar o saltar sin abrir la app. También ayuda a que
 * el navegador trate la página como reproductor de música en segundo plano.
 * En una sala respeta los roles: el co-anfitrión manda la orden al anfitrión y un
 * invitado que escucha aquí solo pausa su propio dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class MediaSessionService {
  private readonly state = inject(PlayerStateService);
  private readonly yt = inject(YouTubeService);
  private readonly jam = inject(JamService);
  private readonly zone = inject(NgZone);
  private started = false;

  start(): void {
    if (this.started || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    this.started = true;
    const session = navigator.mediaSession;

    this.state.currentSong$.subscribe(song => {
      session.metadata = song ? new MediaMetadata(mediaMetadataFor(song)) : null;
    });
    this.state.isPlaying$.subscribe(playing => {
      session.playbackState = playing ? 'playing' : 'paused';
    });

    const on = (action: MediaSessionAction, fn: () => void) => {
      try {
        session.setActionHandler(action, () => this.zone.run(fn));
      } catch {
        // El navegador no soporta esta acción: se ignora.
      }
    };
    on('play', () => this.setPlaying(true));
    on('pause', () => this.setPlaying(false));
    on('nexttrack', () => this.skip('next'));
    on('previoustrack', () => this.skip('prev'));
  }

  private setPlaying(play: boolean): void {
    if (this.jam.isCohost()) {
      if (play !== this.state.isPlaying$.value) this.jam.command('toggle');
      return;
    }
    const ct = this.yt.getCurrentTime();
    if (play) this.yt.play();
    else this.yt.pause();
    // Solo el anfitrión (o alguien fuera de una sala) cambia la música de todos.
    if (!this.jam.canControl()) return;
    if (play) this.state.onResumed?.(ct);
    else this.state.onPaused?.(ct);
  }

  private skip(direction: 'next' | 'prev'): void {
    if (!this.jam.canControl()) return;
    if (this.jam.isCohost()) {
      this.jam.command(direction);
      return;
    }
    if (direction === 'next') {
      this.state.playNext();
    } else if (this.yt.getCurrentTime() > 3) {
      this.yt.seekTo(0);
      this.state.onSeeked?.(0);
    } else {
      this.state.playPrev();
    }
  }
}
