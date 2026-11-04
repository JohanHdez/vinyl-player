import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { MIN_QUERY_LENGTH, addRecent, readRecent, shouldSearch } from '../../services/search-input';

const DEBOUNCE_MS = 450;

/**
 * Buscador que busca solo mientras escribes (desde 3 letras), con botón para
 * borrar y búsquedas recientes. Pegar un enlace de YouTube también funciona.
 */
@Component({
  selector: 'app-search-bar',
  standalone: true,
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent implements AfterViewInit, OnDestroy {
  @Output() search = new EventEmitter<string>();
  /** Texto con el que empieza (p. ej. lo que se escribía en Inicio). */
  @Input() set initial(value: string | null | undefined) {
    if (value && value !== this.query()) {
      this.query.set(value);
      this.lastEmitted = value.trim();
    }
  }
  /** Pone el cursor en el campo al aparecer. */
  @Input() autofocus = false;

  @ViewChild('input') private input?: ElementRef<HTMLInputElement>;

  readonly query = signal('');
  readonly focused = signal(false);
  readonly recent = signal<string[]>(readRecent());
  readonly minLength = MIN_QUERY_LENGTH;

  private timer?: ReturnType<typeof setTimeout>;
  private lastEmitted = '';

  ngAfterViewInit(): void {
    if (this.autofocus && this.input) {
      const el = this.input.nativeElement;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  onInput(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    if (!shouldSearch(value)) return;
    // Un enlace pegado se busca al instante; el texto espera a que dejes de escribir.
    const delay = /youtu\.?be/.test(value) ? 0 : DEBOUNCE_MS;
    this.timer = setTimeout(() => this.emit(value), delay);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      clearTimeout(this.timer);
      this.emit(this.query(), true);
    }
    if (event.key === 'Escape') this.clear();
  }

  pick(term: string): void {
    this.query.set(term);
    this.emit(term, true);
  }

  clear(): void {
    clearTimeout(this.timer);
    this.query.set('');
    this.lastEmitted = '';
  }

  private emit(value: string, force = false): void {
    const q = value.trim();
    if (!q || (!force && q === this.lastEmitted)) return;
    this.lastEmitted = q;
    this.recent.set(addRecent(q));
    this.search.emit(q);
  }
}
