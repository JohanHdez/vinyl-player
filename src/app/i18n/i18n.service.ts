import { Injectable, Pipe, PipeTransform, effect, inject, signal } from '@angular/core';
import { DICTS, Lang, TKey } from './dict';
import { Params, format } from './part';

const KEY = 'vinyl.lang';

/** Idioma inicial: el que eligió la persona; si no, el del dispositivo (español o inglés). */
export function initialLang(saved: string | null, browser: readonly string[]): Lang {
  if (saved === 'es' || saved === 'en') return saved;
  const first = browser.find(l => /^(es|en)\b/i.test(l));
  return first?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

/** Traducción pura (sin Angular), para funciones y pruebas. */
export function translate(lang: Lang, key: TKey, params?: Params): string {
  return format(DICTS[lang][key] ?? DICTS.es[key] ?? key, params);
}

/**
 * Idioma de la app (español / inglés). Cambia al instante, sin recargar, y se recuerda
 * en este dispositivo. En las plantillas: {{ 'clave' | t }} o {{ 'clave' | t: { name: x } }}.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(initialLang(readSaved(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]));

  constructor() {
    effect(() => {
      if (typeof document !== 'undefined') document.documentElement.lang = this.lang();
    });
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Sin almacenamiento (modo privado): dura solo esta visita.
    }
  }

  t(key: TKey, params?: Params): string {
    return translate(this.lang(), key, params);
  }

  /**
   * Texto que llega del servidor: si trae una clave conocida se traduce; si no
   * (salas guardadas antes de este cambio), se muestra el texto tal cual.
   */
  server(key: string | undefined, params: Params | undefined, fallback: string): string {
    const full = key ? (`srv.${key}` as TKey) : null;
    return full && full in DICTS.es ? this.t(full, params) : fallback;
  }
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** {{ 'clave' | t }} — se vuelve a evaluar al cambiar de idioma (pipe impuro, es barato). */
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TKey, params?: Params): string {
    return this.i18n.t(key, params);
  }
}
