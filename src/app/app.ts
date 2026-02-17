import { Component, OnInit, OnDestroy, HostListener, signal, computed, ChangeDetectorRef, ApplicationRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TurntableComponent } from './components/turntable/turntable.component';
import { PlayerControlsComponent } from './components/player-controls/player-controls.component';
import { SearchBarComponent } from './components/search-bar/search-bar.component';
import { SearchResultsComponent } from './components/search-results/search-results.component';
import { PlaylistComponent } from './components/playlist/playlist.component';
import { TrendingGridComponent } from './components/trending-grid/trending-grid.component';
import { JamPanelComponent } from './components/jam-panel/jam-panel.component';
import { JamJoinComponent } from './components/jam-join/jam-join.component';
import { YouTubeService } from './services/youtube.service';
import { PlayerStateService } from './services/player-state.service';
import { JamService } from './services/jam.service';
import { Song } from './models/song.model';

export type AppView = 'home' | 'search' | 'nowplaying' | 'library';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TurntableComponent,
    PlayerControlsComponent,
    SearchBarComponent,
    SearchResultsComponent,
    PlaylistComponent,
    TrendingGridComponent,
    JamPanelComponent,
    JamJoinComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  isPlaying = signal(false);
  currentSong = signal<Song | null>(null);
  hasSong = computed(() => this.currentSong() !== null);
  searchResults = signal<Song[]>([]);
  searchLoading = signal(false);
  searchVisible = signal(false);
  trendingSongs = signal<Song[]>([]);
  trendingLoading = signal(false);
  jamActive = computed(() => this.jamService.isInSession());
  toastMessage = signal('');
  toastVisible = signal(false);

  // View management
  currentView = signal<AppView>('home');
  sidebarCollapsed = signal(false);

  currentThumb = computed(() => {
    const song = this.currentSong();
    return song ? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg` : '';
  });

  private toastTimeout: any;
  private subs: Subscription[] = [];

  constructor(
    private yt: YouTubeService,
    private state: PlayerStateService,
    private jamService: JamService,
    private appRef: ApplicationRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.yt.init();
    this.subs.push(
      this.state.isPlaying$.subscribe(p => {
        this.isPlaying.set(p);
      }),
      this.state.currentSong$.subscribe(s => {
        this.currentSong.set(s);
      }),
      this.state.toast$.subscribe(msg => this.showToast(msg))
    );
    this.loadInitialContent();
    this.jamService.checkUrlForJam();
    this.jamService.attemptRejoin();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  setView(view: AppView): void {
    this.currentView.set(view);
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  async loadInitialContent(): Promise<void> {
    this.trendingLoading.set(true);
    try {
      const songs = await this.yt.fetchTrending();
      this.trendingSongs.set(songs);
    } catch (err) {
      console.error('Failed to load trending:', err);
    } finally {
      this.trendingLoading.set(false);
    }
  }

  async onSearch(query: string): Promise<void> {
    const videoId = this.yt.extractVideoId(query);
    if (videoId) {
      this.searchLoading.set(true);
      this.searchVisible.set(true);
      this.currentView.set('search');
      this.searchResults.set([]);
      try {
        const song = await this.yt.fetchVideoInfo(videoId);
        this.state.addToPlaylist(song);
        this.state.play(this.state.playlistLength - 1);
        this.currentView.set('nowplaying');
      } finally {
        this.searchLoading.set(false);
        this.searchVisible.set(false);
      }
      return;
    }

    this.searchLoading.set(true);
    this.searchVisible.set(true);
    this.currentView.set('search');
    this.searchResults.set([]);
    try {
      const results = await this.yt.search(query);
      this.searchResults.set(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      this.searchLoading.set(false);
      this.appRef.tick();
    }
  }

  onAddToPlaylist(song: Song): void {
    this.state.addToPlaylist(song);
  }

  onPlayNow(song: Song): void {
    this.state.addToPlaylist(song);
    const playlist = this.state.playlist$.value;
    const idx = playlist.findIndex(s => s.videoId === song.videoId);
    if (idx >= 0) this.state.play(idx);
  }

  onStartJam(): void {
    this.jamService.createSession();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.togglePlay();
    }
    if (event.code === 'ArrowRight') this.state.playNext();
    if (event.code === 'ArrowLeft') this.state.playPrev();
  }

  private togglePlay(): void {
    if (this.state.currentIndex < 0 && this.state.playlistLength > 0) {
      this.state.play(0);
      return;
    }
    if (this.state.currentIndex < 0) return;
    if (this.isPlaying()) {
      const ct = this.yt.getCurrentTime();
      this.yt.pause();
      if (this.state.onPaused) this.state.onPaused(ct);
    } else {
      const ct = this.yt.getCurrentTime();
      this.yt.play();
      if (this.state.onResumed) this.state.onResumed(ct);
    }
  }

  private showToast(msg: string): void {
    this.toastMessage.set(msg);
    this.toastVisible.set(true);
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastVisible.set(false);
    }, 2500);
  }
}
