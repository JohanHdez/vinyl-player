import { Injectable, NgZone, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { PlayerStateService } from './player-state.service';
import { Song } from '../models/song.model';
import { ArtistPage, CategoryPage, ExploreHome, PlaylistPage } from '../models/explore.model';
import { PROXY_URL } from './proxy-url';
import { isBrowserPause } from './background-play';
import { I18nService } from '../i18n/i18n.service';

// Tipos mínimos del YouTube IFrame API: solo lo que usamos.
interface YTPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  setVolume(volume: number): void;
  getDuration(): number;
  getCurrentTime(): number;
}

interface YTNamespace {
  Player: new (elementId: string, options: object) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

@Injectable({ providedIn: 'root' })
export class YouTubeService {
  private player: YTPlayer | null = null;
  private playerReady = false;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private pendingVideoId: string | null = null;

  /**
   * Errores del reproductor (código del IFrame API + video que falló).
   * PlaybackRecoveryService decide si busca otra versión o pasa a la siguiente.
   */
  readonly playbackError$ = new Subject<{ code: number; videoId: string }>();
  private currentVideoId = '';

  /** Callback fired once after next video starts playing */
  private onVideoStarted: (() => void) | null = null;

  /**
   * Segundo plano: ¿la app quiere que suene? Solo pause() lo apaga, así una pausa
   * que no pidió nadie (el navegador al apagar la pantalla) se puede deshacer.
   */
  private wantsToPlay = false;
  /** Estado real del reproductor (la interfaz puede seguir mostrando "sonando"). */
  private reallyPlaying = false;
  private hiddenAt = 0;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly i18n = inject(I18nService);

  constructor(
    private state: PlayerStateService,
    private ngZone: NgZone
  ) {}

  init(): void {
    this.loadIFrameAPI();
    this.watchVisibility();
    this.state.playSong$.subscribe(song => this.loadVideo(song.videoId));
    this.state.volume$.subscribe(vol => this.player?.setVolume(vol));
  }

  private loadIFrameAPI(): void {
    if (window.YT?.Player) {
      this.createPlayer(window.YT);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      this.ngZone.run(() => window.YT && this.createPlayer(window.YT));
    };
  }

  private createPlayer(yt: YTNamespace): void {
    this.player = new yt.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          this.ngZone.run(() => {
            this.playerReady = true;
            this.player?.setVolume(this.state.volume$.value);
            // Play any video that was queued before player was ready
            if (this.pendingVideoId) {
              const vid = this.pendingVideoId;
              this.pendingVideoId = null;
              this.player?.loadVideoById(vid);
            }
          });
        },
        onStateChange: (e: { data: number }) => this.ngZone.run(() => this.onStateChange(yt, e.data)),
        onError: (e: { data: number }) => this.ngZone.run(() => this.onError(e.data)),
      },
    });
  }

  private onStateChange(yt: YTNamespace, playerState: number): void {
    const { ENDED, PLAYING, PAUSED } = yt.PlayerState;

    if (playerState !== PLAYING) this.reallyPlaying = false;
    if (playerState === ENDED) {
      // Terminó: no hay nada que reanudar hasta que se cargue la siguiente.
      this.wantsToPlay = false;
      if (this.state.repeat$.value) {
        this.wantsToPlay = true;
        this.player?.seekTo(0);
        this.player?.playVideo();
        return;
      }
      this.state.setPlaying(false);
      this.stopProgressUpdate();
      // Invitado de una sala escuchando en su dispositivo: espera la siguiente del anfitrión.
      if (this.state.guestMode) return;
      // Si la cola terminó, PlayerState avisa con queueEnded$ y la radio continúa.
      this.state.playNext();
    }
    if (playerState === PLAYING) {
      this.reallyPlaying = true;
      this.state.setPlaying(true);
      this.startProgressUpdate();
      if (this.onVideoStarted) {
        const cb = this.onVideoStarted;
        this.onVideoStarted = null;
        cb();
      }
    }
    if (playerState === PAUSED) {
      // Chrome y otros pausan al apagar la pantalla: se reanuda sin marcarlo como pausa.
      if (isBrowserPause({ wantsToPlay: this.wantsToPlay, hidden: document.hidden, msSinceHidden: Date.now() - this.hiddenAt })) {
        this.scheduleResume(250);
        return;
      }
      this.state.setPlaying(false);
      this.stopProgressUpdate();
    }
  }

  private onError(code: number): void {
    this.stopProgressUpdate();
    this.state.setPlaying(false);
    this.playbackError$.next({ code, videoId: this.currentVideoId });
  }

  loadVideo(videoId: string): void {
    this.currentVideoId = videoId;
    this.wantsToPlay = true;
    // Con la pantalla apagada, algunos navegadores cargan la siguiente pero no la arrancan.
    if (document.hidden) this.scheduleResume(1500);
    if (!this.player || !this.playerReady) {
      this.pendingVideoId = videoId;
      this.state.toast$.next(this.i18n.t('player.toast.loadingPlayer'));
      return;
    }
    this.player.loadVideoById(videoId);
  }

  /** Load a video and execute callback once it actually starts playing */
  loadVideoThen(videoId: string, callback: () => void): void {
    this.onVideoStarted = callback;
    this.loadVideo(videoId);
  }

  play(): void {
    this.wantsToPlay = true;
    if (this.playerReady) this.player?.playVideo();
  }

  pause(): void {
    this.wantsToPlay = false;
    this.cancelResume();
    if (this.playerReady) this.player?.pauseVideo();
  }

  // --- Segundo plano ---

  private watchVisibility(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        return;
      }
      // Al volver a la app: si debía estar sonando y no suena, arranca.
      if (this.wantsToPlay && !this.reallyPlaying) this.ngZone.run(() => this.resumeNow());
    });
  }

  private scheduleResume(delayMs: number): void {
    this.cancelResume();
    this.resumeTimer = setTimeout(() => this.ngZone.run(() => this.resumeNow()), delayMs);
  }

  private cancelResume(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
  }

  private resumeNow(): void {
    this.resumeTimer = null;
    if (this.wantsToPlay && this.playerReady && !this.reallyPlaying) this.player?.playVideo();
  }

  seekTo(seconds: number): void {
    if (this.playerReady) this.player?.seekTo(seconds, true);
  }

  getDuration(): number {
    return this.playerReady ? this.player?.getDuration() || 0 : 0;
  }

  getCurrentTime(): number {
    return this.playerReady ? this.player?.getCurrentTime() || 0 : 0;
  }

  private startProgressUpdate(): void {
    this.stopProgressUpdate();
    this.progressInterval = setInterval(() => {
      this.ngZone.run(() => this.state.updateTime(this.getCurrentTime(), this.getDuration()));
    }, 250);
  }

  private stopProgressUpdate(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  // --- Search via YouTube InnerTube API (proxied) ---

  extractVideoId(input: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = input.trim().match(p);
      if (m) return m[1];
    }
    return null;
  }

  /** POST a la API propia; devuelve el JSON o `null` si algo falla. */
  private async postJson<T>(endpoint: string, body: object): Promise<T | null> {
    try {
      const resp = await fetch(`${PROXY_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as T;
    } catch (err) {
      console.error(`[api/${endpoint}]`, err);
      return null;
    }
  }

  private async postItems(endpoint: string, body: object): Promise<Song[]> {
    return (await this.postJson<{ items?: Song[] }>(endpoint, body))?.items ?? [];
  }

  // --- Explorar ---

  fetchExplore(): Promise<ExploreHome | null> {
    return this.postJson<ExploreHome>('explore', {});
  }

  fetchCategory(params: string): Promise<CategoryPage | null> {
    return this.postJson<CategoryPage>('category', { params });
  }

  fetchArtist(id: string): Promise<ArtistPage | null> {
    return this.postJson<ArtistPage>('artist', { id });
  }

  fetchPlaylist(id: string): Promise<PlaylistPage | null> {
    return this.postJson<PlaylistPage>('playlist', { id });
  }

  search(query: string): Promise<Song[]> {
    return this.postItems('search', { query });
  }

  fetchTrending(): Promise<Song[]> {
    return this.postItems('trending', {});
  }

  /** Canciones parecidas a `videoId` (la radio de YouTube Music para esa canción). */
  fetchRelated(videoId: string): Promise<Song[]> {
    return this.postItems('related', { videoId });
  }

  async fetchVideoInfo(videoId: string): Promise<Song> {
    try {
      const resp = await fetch(`${PROXY_URL}/api/video-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch {
      return { videoId, title: this.i18n.t('player.yt.fallbackTitle'), channel: '' };
    }
  }
}
