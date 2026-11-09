import { Component, inject } from '@angular/core';
import { I18nService, TPipe } from '../../i18n/i18n.service';
import { Lang } from '../../i18n/dict';

/** Selector de idioma ES / EN (cambia al instante y se recuerda en este dispositivo). */
@Component({
  selector: 'app-lang-switch',
  standalone: true,
  imports: [TPipe],
  template: `
    <div class="lang-switch" role="group" [attr.aria-label]="'lang.label' | t">
      @for (l of langs; track l) {
        <button type="button" [class.active]="i18n.lang() === l" [attr.aria-pressed]="i18n.lang() === l"
                [attr.lang]="l" [title]="('lang.' + l) | t" (click)="i18n.setLang(l)">{{ l.toUpperCase() }}</button>
      }
    </div>
  `,
  styles: [`
    .lang-switch {
      display: inline-flex;
      padding: 3px;
      gap: 2px;
      border-radius: 999px;
      border: 1px solid var(--glass-border);
      background: var(--bg-elevated);
    }
    button {
      min-width: 40px;
      min-height: 32px;
      padding: 4px 10px;
      border: 0;
      border-radius: 999px;
      background: none;
      color: var(--text-secondary);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease;
    }
    button:hover, button:focus-visible { color: var(--text-primary); }
    button.active { background: var(--accent-brass); color: #1a120b; }
  `],
})
export class LangSwitchComponent {
  readonly i18n = inject(I18nService);
  readonly langs: Lang[] = ['es', 'en'];
}
