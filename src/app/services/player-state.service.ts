import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Song } from '../models/song.model';

@Injectable({ providedIn: 'root' })
export class PlayerStateService {
  private playlist: Song[] = [];
  private _currentIndex = -1;

  readonly playlist$ = new BehaviorSubject<Song[]>([]);
  readonly currentIndex$ = new BehaviorSubject<number>(-1);
  readonly currentSong$ = new BehaviorSubject<Song | null>(null);
  readonly isPlaying$ = new BehaviorSubject<boolean>(false);
  readonly shuffle$ = new BehaviorSubject<boolean>(false);
  readonly repeat$ = new BehaviorSubject<boolean>(false);
  readonly currentTime$ = new BehaviorSubject<number>(0);
  readonly duration$ = new BehaviorSubject<number>(0);
  readonly volume$ = new BehaviorSubject<number>(80);

  readonly playSong$ = new Subject<Song>();
  readonly toast$ = new Subject<string>();

  // Jam integration hooks - set by JamService
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

  addToPlaylist(song: Song): boolean {
    if (this.playlist.some(s => s.videoId === song.videoId)) {
      this.toast$.next('Ya esta en la lista');
      return false;
    }
    this.playlist.push(song);
    this.playlist$.next([...this.playlist]);
    this.toast$.next('Agregada a la lista');
    if (this.onSongAdded) this.onSongAdded(song);
    return true;
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
    this.currentIndex$.next(index);
    this.currentSong$.next(song);
    this.playSong$.next(song);
    if (this.onSongPlayed) this.onSongPlayed(index);
  }

  playNext(): void {
    if (this.playlist.length === 0) return;
    let next: number;
    if (this.shuffle$.value) {
      next = Math.floor(Math.random() * this.playlist.length);
    } else {
      next = (this._currentIndex + 1) % this.playlist.length;
    }
    this.play(next);
  }

  playPrev(): void {
    if (this.playlist.length === 0) return;
    if (this.currentTime$.value > 3) {
      this.currentTime$.next(0);
      return;
    }
    let prev: number;
    if (this.shuffle$.value) {
      prev = Math.floor(Math.random() * this.playlist.length);
    } else {
      prev = (this._currentIndex - 1 + this.playlist.length) % this.playlist.length;
    }
    this.play(prev);
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
