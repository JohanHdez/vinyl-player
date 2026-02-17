import { Component, Input, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { PlayerStateService } from '../../services/player-state.service';
import { Song } from '../../models/song.model';

@Component({
  selector: 'app-turntable',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './turntable.component.html',
  styleUrl: './turntable.component.scss',
})
export class TurntableComponent implements OnInit, OnDestroy {
  @Input() isPlaying = false;

  currentSong = signal<Song | null>(null);
  private subs: Subscription[] = [];

  thumbUrl = computed(() => {
    const song = this.currentSong();
    return song ? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg` : '';
  });

  constructor(private state: PlayerStateService) {}

  ngOnInit(): void {
    this.subs.push(
      this.state.currentSong$.subscribe(s => this.currentSong.set(s))
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
