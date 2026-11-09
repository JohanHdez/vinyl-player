import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TPipe } from '../../i18n/i18n.service';

/**
 * Pregunta al entrar a una sala: ¿dónde quieres escuchar?
 * - En la sala: por los parlantes del anfitrión (el celular es solo control).
 * - En mi celular: también suena aquí, con audífonos, sincronizado con la sala.
 */
@Component({
  selector: 'app-listen-choice',
  standalone: true,
  imports: [TPipe],
  template: `
    <fieldset class="listen-choice">
      <legend>{{ 'rooms.where.legend' | t }}</legend>

      <label class="option" [class.selected]="!here">
        <input type="radio" [name]="name" [checked]="!here" (change)="pick(false)" />
        <span class="icon" aria-hidden="true">🔊</span>
        <span class="text">
          <strong>{{ 'rooms.where.roomTitle' | t }}</strong>
          <small>{{ 'rooms.where.roomText' | t }}</small>
        </span>
      </label>

      <label class="option" [class.selected]="here">
        <input type="radio" [name]="name" [checked]="here" (change)="pick(true)" />
        <span class="icon" aria-hidden="true">🎧</span>
        <span class="text">
          <strong>{{ 'rooms.where.hereTitle' | t }}</strong>
          <small>{{ 'rooms.where.hereText' | t }}</small>
        </span>
      </label>
    </fieldset>
  `,
  styles: [`
    .listen-choice { border: 0; margin: 4px 0 0; padding: 0; display: grid; gap: 8px; }
    legend { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-brass); margin-bottom: 8px; padding: 0; }
    .option {
      display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 10px;
      padding: 12px 14px; border-radius: var(--radius-md); cursor: pointer;
      border: 1px solid var(--glass-border); background: var(--bg-elevated);
      transition: border-color 0.15s, background 0.15s;
    }
    .option.selected { border-color: var(--accent-brass); background: rgba(200, 152, 76, 0.1); }
    .option:focus-within { outline: 2px solid var(--accent-bright); outline-offset: 2px; }
    input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent-brass); }
    .icon { font-size: 1.3rem; }
    .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    strong { font-size: 0.92rem; color: var(--text-primary); font-weight: 600; }
    small { font-size: 0.76rem; color: var(--text-secondary); line-height: 1.35; }
  `],
})
export class ListenChoiceComponent {
  /** true = escuchar en este dispositivo. */
  @Input() here = false;
  @Output() hereChange = new EventEmitter<boolean>();
  /** Nombre del grupo de radios (único por formulario). */
  @Input() name = 'listen-where';

  pick(value: boolean): void {
    this.here = value;
    this.hereChange.emit(value);
  }
}
