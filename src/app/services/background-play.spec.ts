import { describe, expect, it } from 'vitest';
import { BROWSER_PAUSE_WINDOW_MS, isBrowserPause, mediaMetadataFor } from './background-play';

describe('isBrowserPause', () => {
  it('reanuda si la pausa llega justo al apagar la pantalla', () => {
    expect(isBrowserPause({ wantsToPlay: true, hidden: true, msSinceHidden: 120 })).toBe(true);
  });

  it('respeta la pausa que la persona hace después, desde la pantalla de bloqueo', () => {
    expect(isBrowserPause({ wantsToPlay: true, hidden: true, msSinceHidden: BROWSER_PAUSE_WINDOW_MS + 1 })).toBe(false);
  });

  it('no reanuda si la app pidió la pausa o la página está a la vista', () => {
    expect(isBrowserPause({ wantsToPlay: false, hidden: true, msSinceHidden: 100 })).toBe(false);
    expect(isBrowserPause({ wantsToPlay: true, hidden: false, msSinceHidden: 100 })).toBe(false);
  });
});

describe('mediaMetadataFor', () => {
  it('usa el título, el canal y la miniatura de YouTube', () => {
    const m = mediaMetadataFor({ videoId: 'lTRiuFIWV54', title: '1 A.M', channel: 'Lofi Girl' });
    expect(m.title).toBe('1 A.M');
    expect(m.artist).toBe('Lofi Girl');
    expect(m.artwork[0].src).toBe('https://i.ytimg.com/vi/lTRiuFIWV54/mqdefault.jpg');
  });
});
