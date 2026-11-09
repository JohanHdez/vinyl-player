import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { PlayerStateService } from '../../services/player-state.service';
import { JamService } from '../../services/jam.service';
import { Song } from '../../models/song.model';

@Component({
  selector: 'app-playlist',
  standalone: true,
  templateUrl: './playlist.component.html',
  styleUrl: './playlist.component.scss',
})
export class PlaylistComponent implements OnInit, OnDestroy {
  private readonly state = inject(PlayerStateService);
  readonly jam = inject(JamService);

  playlist = signal<Song[]>([]);
  currentIndex = signal(-1);
  isPlaying = signal(false);

  /** En una sala se vota; fuera de una sala la cola es solo tuya. */
  readonly inRoom = computed(() => this.jam.isInSession());
  /** Reproducir y quitar es del anfitrión y los co-anfitriones (o tuyo si no estás en una sala). */
  readonly canControl = computed(() => this.jam.canControl());

  private subs: Subscription[] = [];

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
    if (!this.canControl()) return;
    if (this.jam.isCohost()) this.jam.command('play', this.playlist()[index]?.videoId);
    else this.state.play(index);
  }

  remove(event: MouseEvent, index: number): void {
    event.stopPropagation();
    this.state.removeFromPlaylist(index);
  }

  vote(event: MouseEvent, song: Song): void {
    event.stopPropagation();
    this.jam.vote(song.videoId);
  }

  votes(song: Song): number {
    return song.votes?.length ?? 0;
  }

  votedByMe(song: Song): boolean {
    return !!song.votes?.includes(this.jam.myId);
  }

  thumbUrl(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/default.jpg`;
  }
}
