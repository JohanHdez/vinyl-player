import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Song } from '../../models/song.model';
import { TPipe } from '../../i18n/i18n.service';

@Component({
  selector: 'app-trending-grid',
  standalone: true,
  imports: [CommonModule, TPipe],
  templateUrl: './trending-grid.component.html',
  styleUrl: './trending-grid.component.scss',
})
export class TrendingGridComponent {
  /** Título de la sección; si viene vacío se muestra "Hits Mundiales" en el idioma elegido. */
  @Input() heading = '';
  @Input() songs: Song[] = [];
  @Input() loading = false;

  @Output() addToPlaylist = new EventEmitter<Song>();
  @Output() playNow = new EventEmitter<Song>();

  skeletonItems = Array(8).fill(0);

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
