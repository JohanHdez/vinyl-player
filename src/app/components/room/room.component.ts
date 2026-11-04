import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { JamService } from '../../services/jam.service';
import { PlayerStateService } from '../../services/player-state.service';
import { ChatComponent } from '../chat/chat.component';
import { JamPanelComponent } from '../jam-panel/jam-panel.component';
import { PlaylistComponent } from '../playlist/playlist.component';
import { ShareButtonComponent } from '../share-button/share-button.component';

const NAME_KEY = 'vinyl_jam_name';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [ChatComponent, JamPanelComponent, PlaylistComponent, ShareButtonComponent],
  templateUrl: './room.component.html',
  styleUrl: './room.component.scss',
})
export class RoomComponent implements OnInit, OnDestroy {
  readonly jam = inject(JamService);
  private readonly state = inject(PlayerStateService);

  readonly name = signal(localStorage.getItem(NAME_KEY) ?? '');
  readonly code = signal(this.jam.pendingJamCode());
  readonly error = signal('');
  readonly nowPlaying = toSignal(this.state.currentSong$);

  ngOnInit(): void {
    this.jam.setRoomVisible(true);
  }

  ngOnDestroy(): void {
    this.jam.setRoomVisible(false);
  }

  private validName(): string | null {
    const name = this.name().trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!name) {
      this.error.set('Escribe tu nombre para que los demás sepan quién eres.');
      return null;
    }
    this.error.set('');
    return name;
  }

  create(): void {
    const name = this.validName();
    if (name) this.jam.createSession(name);
  }

  join(): void {
    const name = this.validName();
    const code = this.code().trim().toUpperCase();
    if (!name) return;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.error.set('El código tiene 6 letras o números.');
      return;
    }
    this.jam.joinSession(code, name, true);
  }

  leave(): void {
    this.jam.leaveSession();
  }
}
