import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, input, output, signal } from '@angular/core';
import { Song } from '../../models/song.model';
import { YouTubeService } from '../../services/youtube.service';
import { TKey } from '../../i18n/dict';
import { TPipe } from '../../i18n/i18n.service';

/**
 * Buscador de canciones para pedir música: se usa en el chat de la sala (comparte
 * la canción) y en la cola (la agrega directo). Busca mientras escribes, desde 3 letras.
 */
@Component({
  selector: 'app-song-picker',
  standalone: true,
  imports: [TPipe],
  templateUrl: './song-picker.component.html',
  styleUrl: './song-picker.component.scss',
})
export class SongPickerComponent implements AfterViewInit, OnDestroy {
  private readonly yt = inject(YouTubeService);

  /** Lo que suena ahora, para ofrecer "compartir lo que suena" (opcional). */
  readonly current = input<Song | null>(null);
  /** Claves de traducción (se traducen en la plantilla, así cambian con el idioma). */
  readonly currentLabel = input<TKey>('rooms.picker.current');
  readonly placeholder = input<TKey>('rooms.picker.ph');
  readonly picked = output<Song>();

  @ViewChild('field') private field?: ElementRef<HTMLInputElement>;

  readonly query = signal('');
  readonly results = signal<Song[]>([]);
  readonly loading = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    // Se abre para buscar: el cursor ya queda en el campo.
    this.field?.nativeElement.focus({ preventScroll: true });
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  onInput(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    if (value.trim().length >= 3) this.timer = setTimeout(() => void this.search(), 450);
  }

  async search(): Promise<void> {
    const q = this.query().trim();
    if (!q) return;
    this.loading.set(true);
    this.results.set(await this.yt.search(q));
    this.loading.set(false);
  }

  pick(song: Song): void {
    this.picked.emit(song);
    this.query.set('');
    this.results.set([]);
  }

  thumb(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }
}
