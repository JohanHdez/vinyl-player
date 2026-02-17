import { Component, OnInit, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JamService } from '../../services/jam.service';
import { PlayerStateService } from '../../services/player-state.service';
import { JamParticipant } from '../../models/jam-session.model';
import { Song } from '../../models/song.model';

const AVATAR_COLORS = [
  '#e94560', '#c9a84c', '#3498db', '#2ecc71',
  '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c',
];

@Component({
  selector: 'app-jam-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './jam-panel.component.html',
  styleUrl: './jam-panel.component.scss',
})
export class JamPanelComponent implements OnInit {
  @ViewChild('qrCanvas', { static: false }) qrCanvas!: ElementRef<HTMLCanvasElement>;

  sessionCode = signal('');
  participants = signal<JamParticipant[]>([]);
  currentSong = signal<Song | null>(null);
  qrReady = signal(false);
  isHost = signal(false);
  listenLocally = signal(true);

  constructor(
    private jam: JamService,
    private state: PlayerStateService
  ) {}

  ngOnInit(): void {
    const checkState = () => {
      this.sessionCode.set(this.jam.sessionCode());
      this.participants.set(this.jam.participants());
      this.currentSong.set(this.state.currentSong$.value);
      this.isHost.set(this.jam.isHost());
      this.listenLocally.set(this.jam.listenLocally());

      if (this.jam.sessionCode() && !this.qrReady()) {
        this.generateQR();
      }
      requestAnimationFrame(checkState);
    };
    requestAnimationFrame(checkState);
  }

  thumbUrl(): string {
    const song = this.currentSong();
    return song ? `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg` : '';
  }

  avatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  }

  avatarInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  private async generateQR(): Promise<void> {
    const code = this.jam.sessionCode();
    if (!code) return;

    setTimeout(async () => {
      if (!this.qrCanvas?.nativeElement) return;

      try {
        const QRCode = (await import('qrcode')).default;
        const jamUrl = `${window.location.origin}/?jam=${code}`;
        await QRCode.toCanvas(this.qrCanvas.nativeElement, jamUrl, {
          width: 160,
          margin: 2,
          color: {
            dark: '#f0f0f0',
            light: '#1a1a2e',
          },
        });
        this.qrReady.set(true);
      } catch (err) {
        console.error('QR generation failed:', err);
      }
    }, 100);
  }

  leaveSession(): void {
    this.jam.leaveSession();
  }

  copyCode(): void {
    navigator.clipboard.writeText(this.jam.sessionCode());
  }

  setListenMode(local: boolean): void {
    this.jam.switchListenMode(local);
  }
}
