import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Song } from '../../models/song.model';
import { Artist, ArtistPage, Category, CategoryPage, ExploreHome, PlaylistPage, PlaylistRef } from '../../models/explore.model';
import { PlayerStateService } from '../../services/player-state.service';
import { YouTubeService } from '../../services/youtube.service';
import { SearchResultsComponent } from '../search-results/search-results.component';
import { TrendingGridComponent } from '../trending-grid/trending-grid.component';
import { I18nService, TPipe } from '../../i18n/i18n.service';

/** Pantallas dentro de Explorar; se apilan para poder volver atrás. */
type Page =
  | { kind: 'home' }
  | { kind: 'category'; category: Category; data?: CategoryPage }
  | { kind: 'artist'; artist: Artist; data?: ArtistPage }
  | { kind: 'playlist'; playlist: PlaylistRef; data?: PlaylistPage };

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [SearchResultsComponent, TrendingGridComponent, TPipe],
  templateUrl: './explore.component.html',
  styleUrl: './explore.component.scss',
})
export class ExploreComponent implements OnInit {
  private readonly yt = inject(YouTubeService);
  private readonly state = inject(PlayerStateService);
  private readonly i18n = inject(I18nService);

  readonly home = signal<ExploreHome | null>(null);
  readonly stack = signal<Page[]>([{ kind: 'home' }]);
  readonly loading = signal(false);
  readonly failed = signal(false);

  readonly page = computed(() => this.stack()[this.stack().length - 1]);
  readonly canGoBack = computed(() => this.stack().length > 1);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    const data = await this.yt.fetchExplore();
    this.home.set(data);
    this.failed.set(!data);
    this.loading.set(false);
  }

  back(): void {
    if (this.canGoBack()) this.stack.update(s => s.slice(0, -1));
  }

  openCategory(category: Category): void {
    void this.open({ kind: 'category', category }, () => this.yt.fetchCategory(category.params));
  }

  openArtist(artist: Artist): void {
    void this.open({ kind: 'artist', artist }, () => this.yt.fetchArtist(artist.id));
  }

  openPlaylist(playlist: PlaylistRef): void {
    void this.open({ kind: 'playlist', playlist }, () => this.yt.fetchPlaylist(playlist.id));
  }

  /** Apila la página, carga sus datos y los guarda en la misma entrada. */
  private async open<P extends Exclude<Page, { kind: 'home' }>>(page: P, load: () => Promise<P['data'] | null>): Promise<void> {
    this.stack.update(s => [...s, page]);
    this.loading.set(true);
    this.failed.set(false);
    window.scrollTo?.({ top: 0 });
    const data = await load();
    this.loading.set(false);
    if (!data) {
      this.failed.set(true);
      return;
    }
    this.stack.update(s => s.map(p => (p === page ? ({ ...page, data } as Page) : p)));
  }

  // ── Reproducción ─────────────────────────────────────────

  playNow(song: Song): void {
    this.state.addToPlaylist(song);
    const idx = this.state.playlist$.value.findIndex(s => s.videoId === song.videoId);
    if (idx >= 0) this.state.play(idx);
  }

  add(song: Song): void {
    this.state.addToPlaylist(song);
  }

  /** Pone todas las canciones en la cola y empieza por la primera. */
  playAll(songs: Song[] | undefined): void {
    if (!songs?.length) return;
    const added = this.state.addManyToPlaylist(songs);
    const idx = this.state.playlist$.value.findIndex(s => s.videoId === songs[0].videoId);
    if (idx >= 0) this.state.play(idx);
    this.state.toast$.next(added ? this.i18n.t('player.toast.inQueue', { count: added }) : this.i18n.t('player.toast.alreadyQueued'));
  }

  queueAll(songs: Song[] | undefined): void {
    if (!songs?.length) return;
    const added = this.state.addManyToPlaylist(songs);
    this.state.toast$.next(added ? this.i18n.t('player.toast.addedMany', { count: added }) : this.i18n.t('player.toast.alreadyQueued'));
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }
}
