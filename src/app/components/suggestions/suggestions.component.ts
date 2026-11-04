import { Component, Input, computed, inject } from '@angular/core';
import { Song } from '../../models/song.model';
import { RadioService } from '../../services/radio.service';

@Component({
  selector: 'app-suggestions',
  standalone: true,
  templateUrl: './suggestions.component.html',
  styleUrl: './suggestions.component.scss',
})
export class SuggestionsComponent {
  /** Cuántas sugerencias mostrar a la vez. */
  @Input() limit = 6;

  readonly radio = inject(RadioService);

  readonly visible = computed(() => this.radio.suggestions().slice(0, this.limit));
  readonly skeleton = Array.from({ length: 4 });

  thumbUrl(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/default.jpg`;
  }

  toggleAutoplay(): void {
    this.radio.setAutoplay(!this.radio.autoplay());
  }

  play(song: Song): void {
    this.radio.playNow(song);
  }

  add(event: Event, song: Song): void {
    event.stopPropagation();
    this.radio.addNext(song);
  }

  addAll(): void {
    this.radio.addMany(this.visible());
  }
}
