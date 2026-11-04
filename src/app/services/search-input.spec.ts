import { describe, expect, it } from 'vitest';
import { shouldSearch, withRecent } from './search-input';

describe('shouldSearch', () => {
  it('busca desde 3 letras', () => {
    expect(shouldSearch('bl')).toBe(false);
    expect(shouldSearch('  bl  ')).toBe(false);
    expect(shouldSearch('ble')).toBe(true);
  });

  it('busca de inmediato si es un enlace de YouTube', () => {
    expect(shouldSearch('youtu.be/x')).toBe(true);
  });
});

describe('withRecent', () => {
  it('pone la última de primera, sin repetir y con máximo 6', () => {
    let list: string[] = [];
    for (const t of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']) list = withRecent(list, t);
    expect(list).toEqual(['a7', 'a6', 'a5', 'a4', 'a3', 'a2']);
    expect(withRecent(['Feid', 'Karol G'], 'feid')).toEqual(['feid', 'Karol G']);
  });

  it('no guarda enlaces ni vacíos', () => {
    expect(withRecent(['x'], 'https://youtu.be/abc')).toEqual(['x']);
    expect(withRecent(['x'], '   ')).toEqual(['x']);
  });
});
