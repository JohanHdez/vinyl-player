import { Component } from '@angular/core';
import { TPipe } from '../../i18n/i18n.service';

/** Términos de uso y privacidad: proyecto personal, sin fines comerciales. */
// Textos en src/app/i18n/parts/terms.ts (español e inglés); cambian al instante con el idioma.
@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [TPipe],
  template: `
    <article class="terms">
      <header class="view-header">
        <h1 class="view-title font-display">{{ 'terms.title' | t }}</h1>
        <p class="view-subtitle">{{ 'terms.updated' | t }}</p>
      </header>

      <section>
        <h2>{{ 'terms.what.title' | t }}</h2>
        <p>
          {{ 'terms.what.p1A' | t }} <strong>{{ 'terms.what.p1Strong' | t }}</strong>{{ 'terms.what.p1B' | t }}
        </p>
      </section>

      <section>
        <h2>{{ 'terms.music.title' | t }}</h2>
        <p>
          {{ 'terms.music.p1A' | t }}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">{{ 'terms.music.p1Link' | t }}</a>{{ 'terms.music.p1B' | t }}
        </p>
        <p>{{ 'terms.music.p2' | t }}</p>
      </section>

      <section>
        <h2>{{ 'terms.rooms.title' | t }}</h2>
        <p>{{ 'terms.rooms.p1' | t }}</p>
      </section>

      <section>
        <h2>{{ 'terms.privacy.title' | t }}</h2>
        <ul>
          <li>{{ 'terms.privacy.li1' | t }}</li>
          <li>{{ 'terms.privacy.li2' | t }}</li>
          <li>{{ 'terms.privacy.li3' | t }}</li>
          <li>{{ 'terms.privacy.li4' | t }}</li>
        </ul>
      </section>

      <section>
        <h2>{{ 'terms.liability.title' | t }}</h2>
        <p>{{ 'terms.liability.p1' | t }}</p>
      </section>

      <section>
        <h2>{{ 'terms.contact.title' | t }}</h2>
        <p>{{ 'terms.contact.p1A' | t }} <a href="mailto:jshernandezo97@gmail.com">jshernandezo97&#64;gmail.com</a>{{ 'terms.contact.p1B' | t }}</p>
      </section>
    </article>
  `,
  styles: [`
    :host { display: block; }
    .terms { max-width: 760px; }
    section { margin-top: 26px; }
    h2 { font-family: 'Syne', sans-serif; font-size: 1.05rem; color: var(--text-primary); margin-bottom: 8px; }
    p, li { color: var(--text-secondary); font-size: 0.93rem; line-height: 1.6; }
    p + p { margin-top: 10px; }
    ul { padding-left: 18px; display: grid; gap: 6px; }
    a { color: var(--accent-bright); }
    strong { color: var(--text-primary); }
  `],
})
export class TermsComponent {}
