import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { JamService } from '../../services/jam.service';
import { PlayerStateService } from '../../services/player-state.service';
import { ROOM_NAME_IDEAS, RoomStatus, cleanRoomName } from '../../services/my-rooms';
import { ChatComponent } from '../chat/chat.component';
import { JamPanelComponent } from '../jam-panel/jam-panel.component';
import { PlaylistComponent } from '../playlist/playlist.component';
import { ShareButtonComponent } from '../share-button/share-button.component';
import { ListenChoiceComponent } from '../listen-choice/listen-choice.component';

const NAME_KEY = 'vinyl_jam_name';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [ChatComponent, JamPanelComponent, PlaylistComponent, ShareButtonComponent, ListenChoiceComponent],
  templateUrl: './room.component.html',
  styleUrl: './room.component.scss',
})
export class RoomComponent implements OnInit, OnDestroy {
  readonly jam = inject(JamService);
  private readonly state = inject(PlayerStateService);

  readonly ideas = ROOM_NAME_IDEAS;
  readonly name = signal(localStorage.getItem(NAME_KEY) ?? '');
  readonly roomName = signal('');
  readonly code = signal(this.jam.pendingJamCode());
  readonly error = signal('');
  /** ¿Dónde quiere escuchar quien se une? Por defecto, lo que eligió la última vez. */
  listenHere = this.jam.listenHere();
  readonly mode = signal<'create' | 'join'>(this.jam.pendingJamCode() ? 'join' : 'create');
  readonly statuses = signal<Map<string, RoomStatus>>(new Map());
  readonly nowPlaying = toSignal(this.state.currentSong$);
  readonly queueLength = computed(() => this.playlist()?.length ?? 0);
  private readonly playlist = toSignal(this.state.playlist$);

  /** Pestaña visible en el celular (en computador se ven todas). */
  readonly tab = signal<'chat' | 'cola' | 'sala'>('chat');
  /** Mensajes que llegaron mientras mirabas la cola o la info de la sala. */
  readonly chatBadge = signal(0);
  private seenMessages = 0;

  constructor() {
    // Cuenta los mensajes que llegan mientras miras otra pestaña (en el celular).
    effect(() => {
      const total = this.jam.messages().length;
      if (this.tab() !== 'chat') this.chatBadge.set(Math.max(0, total - this.seenMessages));
    });
  }

  setTab(tab: 'chat' | 'cola' | 'sala'): void {
    this.tab.set(tab);
    if (tab === 'chat') {
      this.chatBadge.set(0);
      this.seenMessages = this.jam.messages().length;
    }
  }

  ngOnInit(): void {
    this.jam.setRoomVisible(true);
    this.seenMessages = this.jam.messages().length;
    void this.refreshStatuses();
  }

  ngOnDestroy(): void {
    this.jam.setRoomVisible(false);
  }

  async refreshStatuses(): Promise<void> {
    const list = await this.jam.roomsStatus();
    this.statuses.set(new Map(list.map(s => [s.code, s])));
  }

  status(code: string): RoomStatus | undefined {
    return this.statuses().get(code);
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
    if (!name) return;
    const room = cleanRoomName(this.roomName()) || `Sala de ${name}`;
    this.jam.createSession(name, room);
  }

  join(): void {
    const name = this.validName();
    const code = this.code().trim().toUpperCase();
    if (!name) return;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.error.set('El código tiene 6 letras o números.');
      return;
    }
    this.jam.setListenHere(this.listenHere);
    this.jam.joinSession(code, name);
  }

  open(code: string): void {
    if (!this.name().trim()) this.name.set('Anfitrión');
    this.jam.openMyRoom(code);
  }

  forget(code: string): void {
    this.jam.forgetMyRoom(code);
  }

  /** Vuelve a "Mis salas". Si eres anfitrión, la música de esta sala se pausa. */
  backToRooms(): void {
    this.jam.leaveSession();
    void this.refreshStatuses();
  }
}
