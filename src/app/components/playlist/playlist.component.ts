import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { PlayerStateService } from '../../services/player-state.service';
import { Song } from '../../models/song.model';

@Component({
  selector: 'app-playlist',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './playlist.component.html',
  styleUrl: './playlist.component.scss',
})
export class PlaylistComponent implements OnInit, OnDestroy {
  playlist = signal<Song[]>([]);
  currentIndex = signal(-1);
  isPlaying = signal(false);

  private subs: Subscription[] = [];

  constructor(private state: PlayerStateService) {}

  ngOnInit(): void {
    this.subs.push(
      this.state.playlist$.subscribe(p => this.playlist.set(p)),
      this.state.currentIndex$.subscribe(i => this.currentIndex.set(i)),
      this.state.isPlaying$.subscribe(p => this.isPlaying.set(p))
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  playSong(index: number): void {
    this.state.play(index);
  }

  remove(event: MouseEvent, index: number): void {
    event.stopPropagation();
    this.state.removeFromPlaylist(index);
  }

  thumbUrl(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/default.jpg`;
  }
}
