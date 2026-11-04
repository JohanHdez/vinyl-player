import { describe, expect, it } from 'vitest';
import { Song } from '../models/song.model';
import { keywords, rankAlternatives, searchQueryFor, similarity } from './recovery';

const song = (videoId: string, title: string, channel = ''): Song => ({ videoId, title, channel });

const donOmar = song('K5VZGDyX_qs', 'De niña a mujer Don Omar  original', 'ZeeBaaZ1');

describe('keywords', () => {
  it('quita tildes (también la ñ, para comparar "Niña" con "Nina"), signos y relleno', () => {
    expect(keywords('De Niña a Mujer (Official Video) - Don Omar')).toEqual(['nina', 'mujer', 'don', 'omar']);
    expect(keywords('Héctor "El Father"')).toEqual(['hector', 'father']);
  });
});

describe('searchQueryFor', () => {
  it('busca por el título limpio', () => {
    expect(searchQueryFor(donOmar)).toBe('nina mujer don omar');
  });
});

describe('similarity', () => {
  it('reconoce la misma canción aunque cambie la forma de escribirla', () => {
    expect(similarity(donOmar, song('zSeVzG-n6IQ', 'Héctor "El Father", Don Omar - De Nina A Mujer'))).toBe(1);
  });

  it('da puntaje bajo a otra canción', () => {
    expect(similarity(donOmar, song('x0000000000', 'Hay Algo En Ti', 'Zion & Lennox'))).toBe(0);
  });
});

describe('rankAlternatives', () => {
  const results = [
    song('K5VZGDyX_qs', 'De niña a mujer Don Omar original'), // la misma que falló
    song('aaaaaaaaaaa', 'Hay Algo En Ti', 'Zion & Lennox'), // otra canción
    song('bbbbbbbbbbb', 'De Niña A Mujer', 'Héctor y Tito'), // parcial: falta "Don Omar"
    song('ccccccccccc', 'Don Omar - De Niña a Mujer (Audio)', 'Don Omar'), // completa
  ];

  it('ordena por parecido y descarta la original, las probadas y otras canciones', () => {
    expect(rankAlternatives(donOmar, results, new Set()).map(s => s.videoId)).toEqual(['ccccccccccc']);
    expect(rankAlternatives(donOmar, results, new Set(), 0.5).map(s => s.videoId)).toEqual(['ccccccccccc', 'bbbbbbbbbbb']);
  });

  it('no repite versiones ya probadas', () => {
    expect(rankAlternatives(donOmar, results, new Set(['ccccccccccc']))).toEqual([]);
  });
});
