import { describe, expect, it } from 'vitest';
import { roomShare, songIdFromSearch, songShare, whatsappUrl } from './share';
import { translate } from '../i18n/i18n.service';
import { TKey } from '../i18n/dict';
import { Params } from '../i18n/part';

const es = (k: TKey, p?: Params) => translate('es', k, p);
const en = (k: TKey, p?: Params) => translate('en', k, p);

const ORIGIN = 'https://demo.ngrok-free.dev';
const song = { videoId: 'wVFbmHVJRfA', title: 'Nunca Es Suficiente', channel: 'Los Ángeles Azules' };

describe('songShare', () => {
  it('arma un enlace que abre la canción y un texto con título y artista', () => {
    const s = songShare(ORIGIN, song, es);
    expect(s.url).toBe('https://demo.ngrok-free.dev/?song=wVFbmHVJRfA');
    expect(s.text).toBe('🎵 Escucha «Nunca Es Suficiente» de Los Ángeles Azules conmigo en Vinyl');
  });

  it('omite el artista si no lo hay', () => {
    expect(songShare(ORIGIN, { ...song, channel: '' }, es).text).toBe('🎵 Escucha «Nunca Es Suficiente» conmigo en Vinyl');
  });

  it('escribe el texto en inglés si se elige inglés', () => {
    expect(songShare(ORIGIN, song, en).text).toBe('🎵 Listen to “Nunca Es Suficiente” by Los Ángeles Azules with me on Vinyl');
  });
});

describe('roomShare', () => {
  it('invita con el código en mayúsculas y menciona lo que suena', () => {
    const s = roomShare(ORIGIN, 'abc123', es, 'Tormentos');
    expect(s.url).toBe('https://demo.ngrok-free.dev/?jam=ABC123');
    expect(s.text).toContain('código ABC123');
    expect(s.text).toContain('Ahora suena «Tormentos».');
  });

  it('sin canción no la menciona, y en inglés también lleva el código', () => {
    expect(roomShare(ORIGIN, 'abc123', es).text).toBe('🎧 Únete a mi sala en Vinyl (código ABC123): chateamos y armamos la música entre todos.');
    expect(roomShare(ORIGIN, 'abc123', en, 'Tormentos').text).toContain('code ABC123');
  });
});

describe('whatsappUrl', () => {
  it('codifica texto y enlace para wa.me', () => {
    const url = whatsappUrl({ text: 'Hola & chao', url: 'https://x/?song=a' });
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hola & chao\nhttps://x/?song=a');
  });
});

describe('songIdFromSearch', () => {
  it('acepta solo ids de YouTube válidos', () => {
    expect(songIdFromSearch('?song=wVFbmHVJRfA')).toBe('wVFbmHVJRfA');
    expect(songIdFromSearch('?song=<script>')).toBeNull();
    expect(songIdFromSearch('?jam=ABC123')).toBeNull();
  });
});
