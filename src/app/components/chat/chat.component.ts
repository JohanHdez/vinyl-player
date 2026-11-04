import {
  AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatMessage, REACTIONS, Reaction } from '../../models/chat.model';
import { ViewMessage, toViewMessages, typingLabel } from '../../services/chat-view';
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
  readonly pickerOpen = signal(false);
  readonly pickerQuery = signal('');
  readonly pickerResults = signal<Song[]>([]);
  readonly pickerLoading = signal(false);
  readonly currentSong = signal<Song | null>(null);
  private readonly queuedIds = signal<ReadonlySet<string>>(new Set());

  readonly view = computed<ViewMessage[]>(() => toViewMessages(this.jam.messages(), this.jam.myId));
  readonly typingText = computed(() => typingLabel(this.jam.typing()));

  private subs: Subscription[] = [];
  private lastCount = 0;
  private stickToBottom = true;

  ngOnInit(): void {
    this.subs.push(
      this.state.playlist$.subscribe(list => this.queuedIds.set(new Set(list.map(s => s.videoId)))),
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

  isQueued(song: Song): boolean {
    return this.queuedIds().has(song.videoId);
  }

  addToQueue(song: Song): void {
    this.state.addToPlaylist({ ...song, source: 'user' });
  }

  playNow(song: Song): void {
    this.state.addToPlaylist({ ...song, source: 'user' });
    const idx = this.state.playlist$.value.findIndex(s => s.videoId === song.videoId);
    if (idx >= 0) this.state.play(idx);
  }

  react(message: ChatMessage, emoji: Reaction): void {
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
