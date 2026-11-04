import { Component, ElementRef, HostListener, Input, computed, inject, signal } from '@angular/core';
import { Song } from '../../models/song.model';
import { PlayerStateService } from '../../services/player-state.service';
import { ShareContent, roomShare, songShare, whatsappUrl } from '../../services/share';

/**
 * Botón "Compartir" con menú: WhatsApp, copiar enlace y el menú nativo del
 * teléfono (Web Share API) cuando existe. Sirve para una canción o una sala.
 */
@Component({
  selector: 'app-share-button',
  standalone: true,
  templateUrl: './share-button.component.html',
  styleUrl: './share-button.component.scss',
})
export class ShareButtonComponent {
  private readonly state = inject(PlayerStateService);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly _song = signal<Song | null>(null);
  private readonly _room = signal('');
  private readonly _nowPlaying = signal('');

  @Input() set song(value: Song | null | undefined) { this._song.set(value ?? null); }
  /** Código de sala: si se da, se comparte la sala en vez de la canción. */
  @Input() set roomCode(value: string | null | undefined) { this._room.set(value ?? ''); }
  /** Título de lo que suena, para mencionarlo en la invitación a la sala. */
  @Input() set nowPlaying(value: string | null | undefined) { this._nowPlaying.set(value ?? ''); }
  @Input() label = 'Compartir';
  /** `pill`: botón con texto · `icon`: solo ícono · `inline`: texto pequeño (tarjetas del chat). */
  @Input() variant: 'pill' | 'icon' | 'inline' = 'pill';

  readonly open = signal(false);
  readonly canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  readonly content = computed<ShareContent | null>(() => {
    const origin = location.origin;
    if (this._room()) return roomShare(origin, this._room(), this._nowPlaying() || undefined);
    const song = this._song();
    return song ? songShare(origin, song) : null;
  });

  readonly whatsapp = computed(() => {
    const c = this.content();
    return c ? whatsappUrl(c) : '';
  });

  readonly isLocalhost = /^(localhost|127\.)/.test(location.hostname);

  toggle(event: Event): void {
    event.stopPropagation();
    this.open.update(v => !v);
  }

  async copy(): Promise<void> {
    const c = this.content();
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.url);
      this.state.toast$.next('Enlace copiado');
    } catch {
      window.prompt('Copia este enlace:', c.url);
    }
    this.open.set(false);
  }

  async nativeShare(): Promise<void> {
    const c = this.content();
    if (!c) return;
    try {
      await navigator.share({ title: 'Vinyl Player', text: c.text, url: c.url });
    } catch {
      // La persona canceló el menú: no es un error.
    }
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
