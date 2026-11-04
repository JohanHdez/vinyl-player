import { describe, expect, it } from 'vitest';
import { Song } from '../models/song.model';
import { nextIndex, pickRadioSongs, prevIndex, remainingAfter, shouldExtend, withoutQueued } from './queue';

const song = (id: string, channel = 'Artista ' + id): Song => ({
  videoId: id.padEnd(11, '_'),
  title: 'Canción ' + id,
  channel,
});

describe('nextIndex', () => {
  it('avanza en orden y devuelve null al final (ya no vuelve al inicio)', () => {
    expect(nextIndex(3, 0, { shuffle: false })).toBe(1);
    expect(nextIndex(3, 2, { shuffle: false })).toBeNull();
    expect(nextIndex(0, -1, { shuffle: false })).toBeNull();
  });

  it('en aleatorio nunca repite la actual', () => {
    for (const r of [0, 0.3, 0.5, 0.99]) {
      expect(nextIndex(4, 2, { shuffle: true, random: () => r })).not.toBe(2);
    }
    expect(nextIndex(1, 0, { shuffle: true })).toBeNull();
  });
});

describe('prevIndex', () => {
  it('retrocede y se queda en la primera', () => {
    expect(prevIndex(3, 2)).toBe(1);
    expect(prevIndex(3, 0)).toBe(0);
    expect(prevIndex(0, -1)).toBeNull();
  });
});

describe('radio: cuándo extender', () => {
  it('cuenta las canciones restantes', () => {
    expect(remainingAfter(5, 1)).toBe(3);
    expect(remainingAfter(5, -1)).toBe(5);
    expect(remainingAfter(1, 0)).toBe(0);
  });

  it('extiende cuando quedan menos de 2 por delante', () => {
    expect(shouldExtend(1, 0)).toBe(true);
    expect(shouldExtend(3, 1)).toBe(true);
    expect(shouldExtend(4, 1)).toBe(false);
  });
});

describe('pickRadioSongs', () => {
  it('excluye lo que ya está en la cola o ya sonó y marca el origen', () => {
    const picked = pickRadioSongs([song('a'), song('b'), song('c')], new Set([song('b').videoId]), 5);
    expect(picked.map((s) => s.title)).toEqual(['Canción a', 'Canción c']);
    expect(picked.every((s) => s.source === 'radio')).toBe(true);
  });

  it('respeta la cantidad pedida y no repite ids', () => {
    const picked = pickRadioSongs([song('a'), song('a'), song('b'), song('c')], new Set(), 2);
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((s) => s.videoId)).size).toBe(2);
  });

  it('evita tres seguidas del mismo artista si hay alternativas', () => {
    const list = [song('a', 'X'), song('b', 'X'), song('c', 'X'), song('d', 'Y')];
    const picked = pickRadioSongs(list, new Set(), 4);
    expect(picked.map((s) => s.channel)).toEqual(['X', 'X', 'Y', 'X']);
  });
});

describe('withoutQueued', () => {
  it('quita de las sugerencias lo que ya está en la cola', () => {
    expect(withoutQueued([song('a'), song('b')], [song('a')]).map((s) => s.title)).toEqual(['Canción b']);
  });
});
