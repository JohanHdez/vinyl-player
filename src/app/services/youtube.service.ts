import { Injectable, NgZone } from '@angular/core';
import { PlayerStateService } from './player-state.service';
import { Song } from '../models/song.model';
import { PROXY_URL } from './proxy-url';

declare var YT: any;

@Injectable({ providedIn: 'root' })
export class YouTubeService {
  private player: any = null;
  private playerReady = false;
  private progressInterval: any = null;

  private readonly PROXY_URL = PROXY_URL;

  constructor(
    private state: PlayerStateService,
    private ngZone: NgZone
  ) {}

  init(): void {
    this.loadIFrameAPI();
    this.state.playSong$.subscribe(song => this.loadVideo(song.videoId));
    this.state.volume$.subscribe(vol => {
      if (this.playerReady) this.player.setVolume(vol);
    });
  }

  private loadIFrameAPI(): void {
    if ((window as any).YT && (window as any).YT.Player) {
      this.createPlayer();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    (window as any).onYouTubeIframeAPIReady = () => {
      this.ngZone.run(() => this.createPlayer());
    };
  }

  private createPlayer(): void {
    this.player = new YT.Player('yt-player', {
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
            this.player.setVolume(this.state.volume$.value);
          });
        },
        onStateChange: (e: any) => this.ngZone.run(() => this.onStateChange(e)),
        onError: () => this.ngZone.run(() => this.onError()),
      },
    });
  }

  private onStateChange(e: any): void {
    if (e.data === YT.PlayerState.ENDED) {
      if (this.state.repeat$.value) {
        this.player.seekTo(0);
        this.player.playVideo();
      } else {
        this.state.playNext();
      }
    }
    if (e.data === YT.PlayerState.PLAYING) {
      this.state.setPlaying(true);
      this.startProgressUpdate();
    }
    if (e.data === YT.PlayerState.PAUSED) {
      this.state.setPlaying(false);
      this.stopProgressUpdate();
    }
  }

  private onError(): void {
    this.state.toast$.next('Error al reproducir. Intentando siguiente...');
    setTimeout(() => this.state.playNext(), 1500);
  }

  loadVideo(videoId: string): void {
    if (!this.playerReady) {
      this.state.toast$.next('Cargando reproductor...');
      return;
    }
    this.player.loadVideoById(videoId);
  }

  play(): void {
    if (this.playerReady) this.player.playVideo();
  }

  pause(): void {
    if (this.playerReady) this.player.pauseVideo();
  }

  seekTo(seconds: number): void {
    if (this.playerReady) this.player.seekTo(seconds, true);
  }

  getDuration(): number {
    if (this.playerReady && this.player.getDuration) {
      return this.player.getDuration() || 0;
    }
    return 0;
  }

  getCurrentTime(): number {
    if (this.playerReady && this.player.getCurrentTime) {
      return this.player.getCurrentTime() || 0;
    }
    return 0;
  }

  private startProgressUpdate(): void {
    this.stopProgressUpdate();
    this.progressInterval = setInterval(() => {
      this.ngZone.run(() => {
        const current = this.getCurrentTime();
        const duration = this.getDuration();
        this.state.updateTime(current, duration);
      });
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
      /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = input.trim().match(p);
      if (m) return m[1];
    }
    return null;
  }

  async search(query: string): Promise<Song[]> {
    try {
      const resp = await fetch(`${this.PROXY_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return (data.items || []) as Song[];
    } catch (err) {
      console.error('Search error:', err);
      return [];
    }
  }

  async fetchTrending(): Promise<Song[]> {
    try {
      const resp = await fetch(`${this.PROXY_URL}/api/trending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return (data.items || []) as Song[];
    } catch (err) {
      console.error('Trending error:', err);
      return [];
    }
  }

  async fetchVideoInfo(videoId: string): Promise<Song> {
    try {
      const resp = await fetch(`${this.PROXY_URL}/api/video-info`, {
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
