import { Component, OnInit, OnDestroy, HostListener, signal, computed, effect, ChangeDetectorRef, ApplicationRef } from '@angular/core';
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
import { SuggestionsComponent } from './components/suggestions/suggestions.component';
import { ExploreComponent } from './components/explore/explore.component';
import { RoomComponent } from './components/room/room.component';
import { ShareButtonComponent } from './components/share-button/share-button.component';
import { TermsComponent } from './components/terms/terms.component';
import { songIdFromSearch } from './services/share';
import { YouTubeService } from './services/youtube.service';
import { PlayerStateService } from './services/player-state.service';
import { JamService } from './services/jam.service';
import { RadioService } from './services/radio.service';
import { PlaybackRecoveryService } from './services/playback-recovery.service';
import { Song } from './models/song.model';

export type AppView = 'home' | 'explore' | 'search' | 'nowplaying' | 'library' | 'room' | 'terms';

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
    SuggestionsComponent,
    ExploreComponent,
    RoomComponent,
    ShareButtonComponent,
    TermsComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  isPlaying = signal(false);
  currentSong = signal<Song | null>(null);
  hasSong = computed(() => this.currentSong() !== null);
  searchResults = signal<Song[]>([]);
  /** Última búsqueda, para que la vista Buscar continúe lo que se escribía en Inicio. */
  lastQuery = signal('');
  searchLoading = signal(false);
  searchVisible = signal(false);
  trendingSongs = signal<Song[]>([]);
  trendingLoading = signal(false);
  jamActive = computed(() => this.jamService.isInSession());
  unread = computed(() => this.jamService.unread());
  toastMessage = signal('');
  toastVisible = signal(false);

  // View management
  currentView = signal<AppView>('home');
  sidebarCollapsed = signal(false);
  mobileMenuOpen = signal(false);

  // Top progress bar
  currentTime = signal(0);
  duration = signal(0);
  barProgress = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0
  );
  barHoverPercent = signal(-1);
  barHoverTime = signal('');

  currentThumb = computed(() => {
    const song = this.currentSong();
    return song ? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg` : '';
  });

  private toastTimeout?: ReturnType<typeof setTimeout>;
  private subs: Subscription[] = [];

  constructor(
    private yt: YouTubeService,
    private state: PlayerStateService,
    private jamService: JamService,
    readonly radio: RadioService,
    private recovery: PlaybackRecoveryService,
    private appRef: ApplicationRef,
    private cdr: ChangeDetectorRef
  ) {
    // Al entrar o crear una sala, muestra la sala.
    let wasInSession = false;
    effect(() => {
      const inSession = this.jamService.isInSession();
      if (inSession && !wasInSession) this.currentView.set('room');
      wasInSession = inSession;
    });
  }

  ngOnInit(): void {
    this.yt.init();
    this.radio.start();
    this.recovery.start();
    this.subs.push(
      this.state.isPlaying$.subscribe(p => {
        this.isPlaying.set(p);
      }),
      this.state.currentSong$.subscribe(s => {
        this.currentSong.set(s);
      }),
      this.state.toast$.subscribe(msg => this.showToast(msg)),
      this.state.currentTime$.subscribe(t => this.currentTime.set(t)),
      this.state.duration$.subscribe(d => this.duration.set(d))
    );
    this.loadInitialContent();
    void this.openSharedSong();
    if (new URLSearchParams(location.search).get('view') === 'terminos') this.currentView.set('terms');
    this.jamService.checkUrlForJam();
    this.jamService.attemptRejoin();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  setView(view: AppView): void {
    this.currentView.set(view);
    this.mobileMenuOpen.set(false);
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
    this.lastQuery.set(query);
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

  /** Si se abrió un enlace compartido (?song=ID), pone esa canción y muestra el tocadiscos. */
  private async openSharedSong(): Promise<void> {
    const videoId = songIdFromSearch(location.search);
    if (!videoId) return;
    const url = new URL(location.href);
    url.searchParams.delete('song');
    history.replaceState({}, '', url.toString());

    const song = await this.yt.fetchVideoInfo(videoId);
    this.state.addToPlaylist({ ...song, source: 'user' });
    const idx = this.state.playlist$.value.findIndex(s => s.videoId === videoId);
    if (idx >= 0) this.state.play(idx);
    this.currentView.set('nowplaying');
    this.state.toast$.next('Te compartieron esta canción. Si no suena, toca ▶');
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

  onBarProgressClick(event: MouseEvent): void {
    if (this.jamService.isInSession() && !this.jamService.isHost()) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    if (this.duration() > 0) {
      const seekTime = pct * this.duration();
      this.yt.seekTo(seekTime);
      if (this.state.onSeeked) this.state.onSeeked(seekTime);
    }
  }

  onBarProgressHover(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    this.barHoverPercent.set(Math.max(0, Math.min(100, pct)));
    if (this.duration() > 0) {
      const time = (pct / 100) * this.duration();
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60);
      this.barHoverTime.set(`${m}:${s.toString().padStart(2, '0')}`);
    }
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
