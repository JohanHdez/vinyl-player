import { describe, expect, it } from 'vitest';
import { DICTS, TKey } from './dict';
import { initialLang, translate } from './i18n.service';
import { format } from './part';

describe('i18n', () => {
  it('el inglés tiene las mismas claves que el español, sin textos vacíos', () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(Object.keys(DICTS.es).sort());
    for (const lang of ['es', 'en'] as const) {
      for (const [k, v] of Object.entries(DICTS[lang])) expect(v.trim(), `${lang}:${k}`).not.toBe('');
    }
  });

  it('los dos idiomas usan los mismos {datos} en cada texto', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(DICTS.es) as TKey[]) expect(vars(DICTS.en[k]), k).toEqual(vars(DICTS.es[k]));
  });

  it('format reemplaza los datos y deja los que no vienen', () => {
    expect(format('{name} se unió a {room}', { name: 'Ana' })).toBe('Ana se unió a {room}');
  });

  it('traduce los mensajes del servidor', () => {
    expect(translate('en', 'srv.joined', { name: 'Ana' })).toBe('Ana joined the room');
    expect(translate('es', 'srv.joined', { name: 'Ana' })).toBe('Ana se unió a la sala');
  });

  it('idioma inicial: el guardado, si no el del dispositivo, y español por defecto', () => {
    expect(initialLang('en', ['es-CO'])).toBe('en');
    expect(initialLang(null, ['en-US', 'es'])).toBe('en');
    expect(initialLang(null, ['fr-FR', 'es-CO'])).toBe('es');
    expect(initialLang(null, ['fr-FR'])).toBe('es');
  });
});
