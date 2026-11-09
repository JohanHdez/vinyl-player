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
import { MediaSessionService } from './services/media-session.service';
import { LangSwitchComponent } from './components/lang-switch/lang-switch.component';
import { Song } from './models/song.model';

export type AppView = 'home' | 'explore' | 'search' | 'nowplaying' | 'library' | 'room' | 'terms';

/** Pestañas de la barra inferior en el celular. */
const TABS: { view: AppView; label: string; icon: string }[] = [
  { view: 'home', label: 'Inicio', icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { view: 'explore', label: 'Explorar', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-5.5-2.5 7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z' },
  { view: 'search', label: 'Buscar', icon: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { view: 'library', label: 'Biblioteca', icon: 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z' },
  { view: 'room', label: 'Salas', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z' },
];

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
    LangSwitchComponent,
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
  readonly tabs = TABS;

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
    private mediaSession: MediaSessionService,
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
    this.mediaSession.start();
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
    if (event.code === 'Space') event.preventDefault();
    // En una sala, el teclado solo maneja la música si eres anfitrión o co-anfitrión.
    if (this.jamService.isInSession() && !this.jamService.isHost()) {
      if (!this.jamService.isCohost()) return;
      if (event.code === 'Space') this.jamService.command('toggle');
      if (event.code === 'ArrowRight') this.jamService.command('next');
      if (event.code === 'ArrowLeft') this.jamService.command('prev');
      return;
    }
    if (event.code === 'Space') this.togglePlay();
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
