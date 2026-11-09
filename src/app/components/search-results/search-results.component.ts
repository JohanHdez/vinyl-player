import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Song } from '../../models/song.model';
import { TPipe } from '../../i18n/i18n.service';

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [CommonModule, TPipe],
  templateUrl: './search-results.component.html',
  styleUrl: './search-results.component.scss',
})
export class SearchResultsComponent {
  /** Título del panel; si viene vacío se muestra "Resultados de búsqueda" en el idioma elegido. */
  @Input() heading = '';
  @Input() results: Song[] = [];
  @Input() loading = false;
  @Input() visible = false;

  @Output() addToPlaylist = new EventEmitter<Song>();
  @Output() playNow = new EventEmitter<Song>();

  onAdd(event: MouseEvent, song: Song): void {
    event.stopPropagation();
    this.addToPlaylist.emit(song);
  }

  onPlay(song: Song): void {
    this.playNow.emit(song);
  }

  thumbUrl(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }
}
