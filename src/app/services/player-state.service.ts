import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Song } from '../models/song.model';
import { nextIndex, prevIndex } from './queue';

const AUTOPLAY_KEY = 'vinyl.autoplay';

function readAutoplayPreference(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class PlayerStateService {
  private playlist: Song[] = [];
  private _currentIndex = -1;
  /** Ids que ya sonaron en esta sesión: la radio no los repite. */
  private readonly played = new Set<string>();

  readonly playlist$ = new BehaviorSubject<Song[]>([]);
  readonly currentIndex$ = new BehaviorSubject<number>(-1);
  readonly currentSong$ = new BehaviorSubject<Song | null>(null);
  readonly isPlaying$ = new BehaviorSubject<boolean>(false);
  readonly shuffle$ = new BehaviorSubject<boolean>(false);
  readonly repeat$ = new BehaviorSubject<boolean>(false);
  /** Radio automática: al acabarse la cola sigue con canciones parecidas. */
  readonly autoplay$ = new BehaviorSubject<boolean>(readAutoplayPreference());
  readonly currentTime$ = new BehaviorSubject<number>(0);
  readonly duration$ = new BehaviorSubject<number>(0);
  readonly volume$ = new BehaviorSubject<number>(80);

  readonly playSong$ = new Subject<Song>();
  readonly toast$ = new Subject<string>();
  /** Se emite cuando se pide la siguiente canción y la cola ya no tiene más. */
  readonly queueEnded$ = new Subject<Song | null>();

  // Jam integration hooks - set by JamService
  suppressToast = false;
  onSongAdded: ((song: Song) => void) | null = null;
  onSongRemoved: ((index: number) => void) | null = null;
  onSongPlayed: ((index: number) => void) | null = null;
  onPaused: ((currentTime: number) => void) | null = null;
  onResumed: ((currentTime: number) => void) | null = null;
  onSeeked: ((currentTime: number) => void) | null = null;

  get currentIndex(): number {
    return this._currentIndex;
  }

  get playlistLength(): number {
    return this.playlist.length;
  }

  get playedIds(): ReadonlySet<string> {
    return this.played;
  }

  addToPlaylist(song: Song): boolean {
    if (this.playlist.some(s => s.videoId === song.videoId)) {
      if (!this.suppressToast) this.toast$.next('Ya esta en la lista');
      return false;
    }
    this.playlist.push(song);
    this.playlist$.next([...this.playlist]);
    if (!this.suppressToast) this.toast$.next('Agregada a la lista');
    if (this.onSongAdded) this.onSongAdded(song);
    return true;
  }

  /** Agrega varias canciones sin un aviso por cada una. Devuelve cuántas entraron. */
  addManyToPlaylist(songs: Song[]): number {
    const previous = this.suppressToast;
    this.suppressToast = true;
    try {
      return songs.filter(song => this.addToPlaylist(song)).length;
    } finally {
      this.suppressToast = previous;
    }
  }

  removeFromPlaylist(index: number): void {
    const wasPlaying = index === this._currentIndex;
    this.playlist.splice(index, 1);

    if (index < this._currentIndex) {
      this._currentIndex--;
    } else if (index === this._currentIndex) {
      this._currentIndex = -1;
      if (wasPlaying) {
        this.currentSong$.next(null);
        this.isPlaying$.next(false);
      }
    }

    this.currentIndex$.next(this._currentIndex);
    this.playlist$.next([...this.playlist]);
    if (this.onSongRemoved) this.onSongRemoved(index);
  }

  play(index: number): void {
    if (index < 0 || index >= this.playlist.length) return;
    this._currentIndex = index;
    const song = this.playlist[index];
    this.played.add(song.videoId);
    this.currentIndex$.next(index);
    this.currentSong$.next(song);
    this.playSong$.next(song);
    if (this.onSongPlayed) this.onSongPlayed(index);
  }

  /** Update display state without triggering YouTube playback */
  setCurrentSongDisplay(index: number): void {
    if (index < 0 || index >= this.playlist.length) return;
    this._currentIndex = index;
    const song = this.playlist[index];
    this.played.add(song.videoId);
    this.currentIndex$.next(index);
    this.currentSong$.next(song);
  }

  playNext(): void {
    const next = nextIndex(this.playlist.length, this._currentIndex, { shuffle: this.shuffle$.value });
    if (next === null) {
      this.queueEnded$.next(this.currentSong$.value);
      return;
    }
    this.play(next);
  }

  playPrev(): void {
    if (this.currentTime$.value > 3) {
      this.currentTime$.next(0);
      return;
    }
    const prev = prevIndex(this.playlist.length, this._currentIndex);
    if (prev !== null) this.play(prev);
  }

  toggleShuffle(): void {
    const val = !this.shuffle$.value;
    this.shuffle$.next(val);
    this.toast$.next(val ? 'Aleatorio activado' : 'Aleatorio desactivado');
  }

  toggleRepeat(): void {
    const val = !this.repeat$.value;
    this.repeat$.next(val);
    this.toast$.next(val ? 'Repetir activado' : 'Repetir desactivado');
  }

  setAutoplay(enabled: boolean): void {
    this.autoplay$.next(enabled);
    try {
      localStorage.setItem(AUTOPLAY_KEY, enabled ? 'on' : 'off');
    } catch {
      // Sin almacenamiento (modo privado): la preferencia dura solo esta sesión.
    }
    this.toast$.next(enabled ? 'Radio automática activada' : 'Radio automática desactivada');
  }

  setVolume(vol: number): void {
    this.volume$.next(vol);
  }

  setPlaying(playing: boolean): void {
    this.isPlaying$.next(playing);
  }

  updateTime(current: number, duration: number): void {
    this.currentTime$.next(current);
    this.duration$.next(duration);
  }
}
