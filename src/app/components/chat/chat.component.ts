import {
  AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatMessage, REACTIONS, Reaction } from '../../models/chat.model';
import { CardState, ViewMessage, cardState, toViewMessages, typingLabel } from '../../services/chat-view';
import { Song } from '../../models/song.model';
import { JamService } from '../../services/jam.service';
import { PlayerStateService } from '../../services/player-state.service';
import { YouTubeService } from '../../services/youtube.service';
import { ShareButtonComponent } from '../share-button/share-button.component';

const AVATAR_COLORS = ['#c44b3f', '#c8984c', '#3d8bd9', '#3f9b6a', '#9b6bd1', '#d9823d', '#2fa59c', '#d4577a'];

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [ShareButtonComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  readonly jam = inject(JamService);
  private readonly state = inject(PlayerStateService);
  private readonly yt = inject(YouTubeService);

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  readonly reactions = REACTIONS;
  readonly draft = signal('');
  /** En el celular: mensaje al que se le están mostrando las reacciones (al tocarlo). */
  readonly reactingTo = signal<string | null>(null);
  readonly pickerOpen = signal(false);
  readonly pickerQuery = signal('');
  readonly pickerResults = signal<Song[]>([]);
  readonly pickerLoading = signal(false);
  readonly currentSong = signal<Song | null>(null);
  /** Cola y canción actual de la sala, para el estado de las tarjetas del chat. */
  private readonly queue = signal<Song[]>([]);
  private readonly playingIndex = signal(-1);

  readonly view = computed<ViewMessage[]>(() => toViewMessages(this.jam.messages(), this.jam.myId));
  readonly typingText = computed(() => typingLabel(this.jam.typing()));

  private subs: Subscription[] = [];
  private lastCount = 0;
  private stickToBottom = true;

  ngOnInit(): void {
    this.subs.push(
      this.state.playlist$.subscribe(list => this.queue.set(list)),
      this.state.currentIndex$.subscribe(i => this.playingIndex.set(i)),
      this.state.currentSong$.subscribe(song => this.currentSong.set(song))
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /** Baja al último mensaje cuando llega uno nuevo, salvo que estés leyendo arriba. */
  ngAfterViewChecked(): void {
    const count = this.jam.messages().length;
    if (count !== this.lastCount && this.stickToBottom && this.scroller) {
      const el = this.scroller.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
    this.lastCount = count;
  }

  onScroll(): void {
    const el = this.scroller?.nativeElement;
    if (el) this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // ── Escribir ─────────────────────────────────────────────

  onInput(value: string): void {
    this.draft.set(value);
    if (value.trim()) this.jam.notifyTyping();
  }

  onKeydown(event: KeyboardEvent): void {
    // Enter envía; Shift+Enter hace salto de línea (como en Messenger).
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.stickToBottom = true;
    this.jam.sendMessage(text);
    this.draft.set('');
  }

  // ── Compartir canciones ─────────────────────────────────

  togglePicker(): void {
    this.pickerOpen.update(v => !v);
  }

  shareCurrent(): void {
    const song = this.currentSong();
    if (!song) return;
    this.share(song);
  }

  private pickerTimer?: ReturnType<typeof setTimeout>;

  /** Busca solo mientras escribes, desde 3 letras. */
  onPickerInput(value: string): void {
    this.pickerQuery.set(value);
    clearTimeout(this.pickerTimer);
    if (value.trim().length >= 3) this.pickerTimer = setTimeout(() => void this.searchSongs(), 450);
  }

  async searchSongs(): Promise<void> {
    const q = this.pickerQuery().trim();
    if (!q) return;
    this.pickerLoading.set(true);
    this.pickerResults.set(await this.yt.search(q));
    this.pickerLoading.set(false);
  }

  share(song: Song): void {
    this.stickToBottom = true;
    this.jam.shareSong(song, this.draft().trim());
    this.draft.set('');
    this.pickerOpen.set(false);
    this.pickerResults.set([]);
    this.pickerQuery.set('');
  }

  // ── Acciones sobre mensajes ─────────────────────────────

  /** ¿La canción del chat suena, ya sonó, espera turno o no está en la cola? */
  cardOf(song: Song): CardState {
    return cardState(song, this.queue(), this.playingIndex());
  }

  votedByMe(song: Song): boolean {
    return !!song.votes?.includes(this.jam.myId);
  }

  vote(song: Song): void {
    this.jam.vote(song.videoId);
  }

  isQueued(song: Song): boolean {
    return this.cardOf(song).kind !== 'missing';
  }

  addToQueue(song: Song): void {
    this.state.addToPlaylist({ ...song, source: 'user' });
  }

  playNow(song: Song): void {
    this.state.addToPlaylist({ ...song, source: 'user' });
    const idx = this.state.playlist$.value.findIndex(s => s.videoId === song.videoId);
    if (idx >= 0) this.state.play(idx);
  }

  toggleReact(event: Event, id: string): void {
    if ((event.target as HTMLElement).closest('button, a')) return;
    this.reactingTo.update(current => (current === id ? null : id));
  }

  react(message: ChatMessage, emoji: Reaction): void {
    this.reactingTo.set(null);
    this.jam.react(message.id, emoji);
  }

  // ── Presentación ────────────────────────────────────────

  time(ts: number): string {
    return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }

  color(name: string): string {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  thumb(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }

}
