import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { PlayerStateService } from '../../services/player-state.service';
import { YouTubeService } from '../../services/youtube.service';
import { JamService } from '../../services/jam.service';
import { Song } from '../../models/song.model';

@Component({
  selector: 'app-player-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-controls.component.html',
  styleUrl: './player-controls.component.scss',
})
export class PlayerControlsComponent implements OnInit, OnDestroy {
  currentSong = signal<Song | null>(null);
  isPlaying = signal(false);
  shuffle = signal(false);
  repeat = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  volume = signal(80);

  progressPercent = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0
  );

  thumbUrl = computed(() => {
    const song = this.currentSong();
    return song ? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg` : '';
  });

  controlsDisabled = computed(() =>
    this.jam.isInSession() && !this.jam.isHost()
  );

  hoverPercent = signal(0);
  hoverTime = signal('');
  showHoverTooltip = signal(false);

  private subs: Subscription[] = [];

  constructor(
    private state: PlayerStateService,
    private yt: YouTubeService,
    private jam: JamService
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.state.currentSong$.subscribe(s => this.currentSong.set(s)),
      this.state.isPlaying$.subscribe(p => this.isPlaying.set(p)),
      this.state.shuffle$.subscribe(s => this.shuffle.set(s)),
      this.state.repeat$.subscribe(r => this.repeat.set(r)),
      this.state.currentTime$.subscribe(t => this.currentTime.set(t)),
      this.state.duration$.subscribe(d => this.duration.set(d)),
      this.state.volume$.subscribe(v => this.volume.set(v))
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  togglePlay(): void {
    if (this.controlsDisabled()) return;
    if (!this.currentSong() && this.state.playlistLength > 0) {
      this.state.play(0);
      return;
    }
    if (!this.currentSong()) return;
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

  next(): void {
    if (this.controlsDisabled()) return;
    this.state.playNext();
  }

  prev(): void {
    if (this.controlsDisabled()) return;
    if (this.currentTime() > 3) {
      this.yt.seekTo(0);
      if (this.state.onSeeked) this.state.onSeeked(0);
      return;
    }
    this.state.playPrev();
  }

  toggleShuffle(): void {
    this.state.toggleShuffle();
  }

  toggleRepeat(): void {
    this.state.toggleRepeat();
  }

  onProgressClick(event: MouseEvent): void {
    if (this.controlsDisabled()) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width;
    if (this.duration() > 0) {
      const seekTime = pct * this.duration();
      this.yt.seekTo(seekTime);
      if (this.state.onSeeked) this.state.onSeeked(seekTime);
    }
  }

  onProgressHover(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    this.hoverPercent.set(Math.max(0, Math.min(100, pct)));
    if (this.duration() > 0) {
      const time = (pct / 100) * this.duration();
      this.hoverTime.set(this.formatTime(time));
    }
    this.showHoverTooltip.set(true);
  }

  onProgressLeave(): void {
    this.showHoverTooltip.set(false);
  }

  onVolumeChange(event: Event): void {
    const val = +(event.target as HTMLInputElement).value;
    this.state.setVolume(val);
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
