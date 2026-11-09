import { Injectable, computed, inject, signal } from '@angular/core';
import { Song } from '../models/song.model';
import { JamService } from './jam.service';
import { PlayerStateService } from './player-state.service';
import { YouTubeService } from './youtube.service';
import { RADIO_BATCH, pickRadioSongs, shouldExtend, withoutQueued } from './queue';
import { I18nService } from '../i18n/i18n.service';

/**
 * "Más de esto mismo": a partir de la canción que suena,
 *  - expone sugerencias parecidas para que la persona elija, y
 *  - con la radio automática activa, mantiene la cola llena para que la
 *    música nunca se detenga.
 */
@Injectable({ providedIn: 'root' })
export class RadioService {
  private readonly state = inject(PlayerStateService);
  private readonly yt = inject(YouTubeService);
  private readonly jam = inject(JamService);
  private readonly i18n = inject(I18nService);

  /** Canción a partir de la cual se calculan las sugerencias. */
  readonly seed = signal<Song | null>(null);
  readonly loading = signal(false);
  readonly autoplay = signal(this.state.autoplay$.value);

  private readonly related = signal<Song[]>([]);
  private readonly queue = signal<Song[]>([]);
  private readonly offset = signal(0);

  /** Sugerencias visibles: sin lo que ya está en la cola, rotables con `shuffleSuggestions`. */
  readonly suggestions = computed(() => {
    const fresh = withoutQueued(this.related(), this.queue());
    const start = fresh.length ? this.offset() % fresh.length : 0;
    return [...fresh.slice(start), ...fresh.slice(0, start)];
  });

  private readonly cache = new Map<string, Promise<Song[]>>();
  private started = false;

  /** Se llama una vez al arrancar la app. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.state.playlist$.subscribe(list => this.queue.set(list));
    this.state.autoplay$.subscribe(on => {
      this.autoplay.set(on);
      if (on) void this.extendIfNeeded();
    });
    this.state.currentSong$.subscribe(song => {
      if (song) void this.onSongChanged(song);
    });
    this.state.queueEnded$.subscribe(last => void this.onQueueEnded(last));
  }

  setAutoplay(enabled: boolean): void {
    this.state.setAutoplay(enabled);
  }

  /** Muestra otras sugerencias de la misma semilla. */
  shuffleSuggestions(): void {
    this.offset.update(o => o + 6);
  }

  playNow(song: Song): void {
    this.state.addToPlaylist({ ...song, source: 'user' });
    const idx = this.state.playlist$.value.findIndex(s => s.videoId === song.videoId);
    if (idx >= 0) this.state.play(idx);
  }

  addNext(song: Song): void {
    this.state.addToPlaylist({ ...song, source: 'user' });
  }

  /** Agrega varias sugerencias de una vez. */
  addMany(songs: Song[]): void {
    const added = this.state.addManyToPlaylist(songs.map(s => ({ ...s, source: 'user' as const })));
    this.state.toast$.next(added ? this.i18n.t('player.toast.addedMany', { count: added }) : this.i18n.t('player.toast.alreadyQueued'));
  }

  // ── Internos ──────────────────────────────────────────────

  private canControlQueue(): boolean {
    // En una Jam solo el anfitrión extiende la cola; los demás reciben sus cambios.
    return !this.jam.isInSession() || this.jam.isHost();
  }

  private fetchRelated(videoId: string): Promise<Song[]> {
    let pending = this.cache.get(videoId);
    if (!pending) {
      pending = this.yt.fetchRelated(videoId);
      this.cache.set(videoId, pending);
      // Si falló (lista vacía), permite reintentar más tarde.
      pending.then(list => { if (!list.length) this.cache.delete(videoId); });
    }
    return pending;
  }

  private async onSongChanged(song: Song): Promise<void> {
    if (this.seed()?.videoId === song.videoId) return;
    this.seed.set(song);
    this.offset.set(0);
    this.loading.set(true);
    const list = await this.fetchRelated(song.videoId);
    // Si mientras tanto cambió la canción, ignora esta respuesta.
    if (this.seed()?.videoId !== song.videoId) return;
    this.related.set(list);
    this.loading.set(false);
    await this.extendIfNeeded();
  }

  /** Con la radio activa, agrega canciones antes de que la cola se acabe. */
  private async extendIfNeeded(): Promise<number> {
    const seed = this.seed();
    if (!seed || !this.autoplay() || !this.canControlQueue()) return 0;
    if (!shouldExtend(this.state.playlistLength, this.state.currentIndex)) return 0;

    const candidates = await this.fetchRelated(seed.videoId);
    const exclude = new Set([...this.state.playedIds, ...this.state.playlist$.value.map(s => s.videoId)]);
    const picked = pickRadioSongs(candidates, exclude, RADIO_BATCH);
    const added = this.state.addManyToPlaylist(picked);
    if (added) this.state.toast$.next(this.i18n.t('player.toast.radioAdded', { count: added }));
    return added;
  }

  private async onQueueEnded(last: Song | null): Promise<void> {
    if (!this.autoplay() || !this.canControlQueue()) {
      this.state.toast$.next(this.i18n.t('player.toast.queueEnded'));
      return;
    }
    if (last && this.seed()?.videoId !== last.videoId) this.seed.set(last);
    const before = this.state.playlistLength;
    const added = await this.extendIfNeeded();
    if (added) {
      this.state.play(before);
    } else {
      this.state.toast$.next(this.i18n.t('player.toast.noMoreSimilar'));
    }
  }
}
