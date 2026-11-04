import { describe, expect, it } from 'vitest';
import { ChatMessage } from '../models/chat.model';
import { GROUP_WINDOW_MS, cardState, toViewMessages, typingLabel } from './chat-view';

let n = 0;
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: String(n++),
  type: 'text',
  authorId: 'a',
  author: 'Ana',
  text: 'hola',
  ts: 0,
  reactions: {},
  ...over,
});

describe('toViewMessages', () => {
  it('marca mis mensajes', () => {
    const [mine, other] = toViewMessages([msg({ authorId: 'me' }), msg({ authorId: 'x' })], 'me');
    expect(mine.mine).toBe(true);
    expect(other.mine).toBe(false);
  });

  it('agrupa mensajes seguidos del mismo autor', () => {
    const view = toViewMessages([msg({ ts: 0 }), msg({ ts: 1000 }), msg({ authorId: 'b', ts: 2000 })], 'me');
    expect(view.map(v => v.firstOfGroup)).toEqual([true, false, true]);
  });

  it('corta el grupo tras 5 minutos o después de un aviso del sistema', () => {
    const view = toViewMessages(
      [msg({ ts: 0 }), msg({ ts: GROUP_WINDOW_MS + 1 }), msg({ type: 'system', authorId: null, ts: GROUP_WINDOW_MS + 2 }), msg({ ts: GROUP_WINDOW_MS + 3 })],
      'me'
    );
    expect(view.map(v => v.firstOfGroup)).toEqual([true, true, true, true]);
  });

  it('cuenta reacciones y sabe cuáles son mías', () => {
    const [v] = toViewMessages([msg({ reactions: { '🔥': ['me', 'x'], '❤️': ['x'], '😂': [] } })], 'me');
    expect(v.reactionList).toEqual([
      { emoji: '🔥', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ]);
  });
});

describe('typingLabel', () => {
  it('describe quién escribe', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['Ana'])).toBe('Ana está escribiendo…');
    expect(typingLabel(['Ana', 'Luis'])).toBe('Ana y Luis están escribiendo…');
    expect(typingLabel(['A', 'B', 'C'])).toBe('Varias personas están escribiendo…');
  });
});

describe('cardState', () => {
  const q = [
    { videoId: 'a', title: 'A', channel: '' },
    { videoId: 'b', title: 'B', channel: '' },
    { videoId: 'c', title: 'C', channel: '', replacedFrom: ['bloq'] },
  ];

  it('distingue la que ya sonó, la que suena y las que esperan', () => {
    expect(cardState({ videoId: 'a' }, q, 1).kind).toBe('played');
    expect(cardState({ videoId: 'b' }, q, 1).kind).toBe('playing');
    expect(cardState({ videoId: 'c' }, q, 1).kind).toBe('upcoming');
  });

  it('encuentra una canción aunque se haya reemplazado por otra versión', () => {
    const s = cardState({ videoId: 'bloq' }, q, 1);
    expect(s.kind).toBe('upcoming');
    expect(s.kind !== 'missing' && s.song.videoId).toBe('c');
  });

  it('marca como ausente lo que no está en la cola', () => {
    expect(cardState({ videoId: 'z' }, q, 1).kind).toBe('missing');
  });
});
