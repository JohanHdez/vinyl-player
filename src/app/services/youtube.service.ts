import { Injectable, NgZone } from '@angular/core';
import { PlayerStateService } from './player-state.service';
import { Song } from '../models/song.model';
import { ArtistPage, CategoryPage, ExploreHome, PlaylistPage } from '../models/explore.model';
import { PROXY_URL } from './proxy-url';

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

  /** Callback fired once after next video starts playing */
  private onVideoStarted: (() => void) | null = null;

  constructor(
    private state: PlayerStateService,
    private ngZone: NgZone
  ) {}

  init(): void {
    this.loadIFrameAPI();
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
        onError: () => this.ngZone.run(() => this.onError()),
      },
    });
  }

  private onStateChange(yt: YTNamespace, playerState: number): void {
    const { ENDED, PLAYING, PAUSED } = yt.PlayerState;

    if (playerState === ENDED) {
      if (this.state.repeat$.value) {
        this.player?.seekTo(0);
        this.player?.playVideo();
        return;
      }
      this.state.setPlaying(false);
      this.stopProgressUpdate();
      // Si la cola terminó, PlayerState avisa con queueEnded$ y la radio continúa.
      this.state.playNext();
    }
    if (playerState === PLAYING) {
      this.state.setPlaying(true);
      this.startProgressUpdate();
      if (this.onVideoStarted) {
        const cb = this.onVideoStarted;
        this.onVideoStarted = null;
        cb();
      }
    }
    if (playerState === PAUSED) {
      this.state.setPlaying(false);
      this.stopProgressUpdate();
    }
  }

  private onError(): void {
    this.state.toast$.next('Esta canción no se puede reproducir. Paso a la siguiente…');
    setTimeout(() => this.state.playNext(), 1500);
  }

  loadVideo(videoId: string): void {
    if (!this.player || !this.playerReady) {
      this.pendingVideoId = videoId;
      this.state.toast$.next('Cargando reproductor...');
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
    if (this.playerReady) this.player?.playVideo();
  }

  pause(): void {
    if (this.playerReady) this.player?.pauseVideo();
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
      return { videoId, title: 'Video de YouTube', channel: '' };
    }
  }
}
