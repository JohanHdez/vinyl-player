import { Injectable, inject } from '@angular/core';
import { filter, take } from 'rxjs';
import { Song } from '../models/song.model';
import { JamService } from './jam.service';
import { PlayerStateService } from './player-state.service';
import { YouTubeService } from './youtube.service';
import { BLOCKED_ERRORS, MAX_ATTEMPTS, rankAlternatives, searchQueryFor } from './recovery';

/** Recuperación en curso para una posición de la cola. */
interface Attempt {
  index: number;
  original: Song;
  candidates: Song[];
  tried: Set<string>;
}

/**
 * Cuando YouTube no deja reproducir un video fuera de youtube.com, prueba otras
 * versiones de la misma canción y deja en la cola la primera que suene.
 * Si ninguna funciona, avisa y pasa a la siguiente.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackRecoveryService {
  private readonly state = inject(PlayerStateService);
  private readonly yt = inject(YouTubeService);
  private readonly jam = inject(JamService);

  private attempt: Attempt | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.yt.playbackError$.subscribe(({ code, videoId }) => void this.onError(code, videoId));
  }

  private async onError(code: number, videoId: string): Promise<void> {
    const index = this.state.currentIndex;
    const song = this.state.playlist$.value[index];
    if (!song || song.videoId !== videoId) return;

    if (!BLOCKED_ERRORS.has(code)) {
      this.skip('Esta canción no se puede reproducir. Paso a la siguiente…');
      return;
    }

    // En una sala, el anfitrión busca la otra versión y la comparte con todos.
    if (this.jam.isInSession() && !this.jam.isHost()) {
      this.state.toast$.next('Esa versión está bloqueada fuera de YouTube; el anfitrión buscará otra…');
      return;
    }

    // Primer error en esta posición: busca versiones alternativas una sola vez.
    if (!this.attempt || this.attempt.index !== index) {
      this.state.toast$.next(`«${song.title}» no se puede reproducir aquí. Buscando otra versión…`);
      const tried = new Set([song.videoId]);
      const results = await this.yt.search(searchQueryFor(song));
      this.attempt = { index, original: song, candidates: rankAlternatives(song, results, tried), tried };
    }

    this.tryNext();
  }

  private tryNext(): void {
    const attempt = this.attempt;
    if (!attempt) return;
    const attemptsLeft = attempt.tried.size <= MAX_ATTEMPTS;
    const next = attemptsLeft ? attempt.candidates.find(c => !attempt.tried.has(c.videoId)) : undefined;

    if (!next) {
      this.state.replaceSong(attempt.index, attempt.original);
      this.attempt = null;
      this.skip(`Ninguna versión de «${attempt.original.title}» se puede reproducir fuera de YouTube. Paso a la siguiente.`);
      return;
    }

    attempt.tried.add(next.videoId);
    const replacement: Song = { ...next, source: attempt.original.source };
    this.state.replaceSong(attempt.index, replacement);
    this.state.play(attempt.index);

    // Si esta versión empieza a sonar, la recuperación terminó bien.
    this.state.isPlaying$.pipe(filter(Boolean), take(1)).subscribe(() => {
      if (this.attempt === attempt && this.state.currentSong$.value?.videoId === replacement.videoId) {
        this.attempt = null;
        const by = replacement.channel ? ` (${replacement.channel})` : '';
        this.state.toast$.next(`Esa versión estaba bloqueada; puse otra de «${attempt.original.title}»${by}`);
      }
    });
  }

  private skip(message: string): void {
    this.state.toast$.next(message);
    setTimeout(() => this.state.playNext(), 1500);
  }
}
