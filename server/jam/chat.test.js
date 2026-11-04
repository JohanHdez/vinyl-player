"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const chat = require("./chat");

test("cleanText recorta, normaliza espacios y rechaza vacíos", () => {
  assert.equal(chat.cleanText("  hola   mundo  "), "hola mundo");
  assert.equal(chat.cleanText("a\n\n\n\nb"), "a\n\nb");
  assert.equal(chat.cleanText("   "), null);
  assert.equal(chat.cleanText(42), null);
  assert.equal(chat.cleanText("x".repeat(900)).length, chat.MAX_TEXT);
});

test("cleanName usa un nombre por defecto y limita el largo", () => {
  assert.equal(chat.cleanName(""), "Invitado");
  assert.equal(chat.cleanName("  Ana \n María "), "Ana María");
  assert.equal(chat.cleanName("x".repeat(80)).length, 30);
});

test("cleanSong exige un videoId válido", () => {
  assert.equal(chat.cleanSong({ videoId: "../etc", title: "x" }), null);
  assert.equal(chat.cleanSong({ videoId: "lTRiuFIWV54", title: "  " }), null);
  assert.deepEqual(chat.cleanSong({ videoId: "lTRiuFIWV54", title: "Lofi", channel: "Lofi Girl", extra: 1 }), {
    videoId: "lTRiuFIWV54",
    title: "Lofi",
    channel: "Lofi Girl",
  });
});

test("appendMessage conserva solo los últimos 100", () => {
  const history = [];
  for (let i = 0; i < 120; i++) chat.appendMessage(history, chat.createMessage({ type: "text", author: "A", text: String(i) }));
  assert.equal(history.length, chat.HISTORY_SIZE);
  assert.equal(history[0].text, "20");
});

test("toggleReaction pone y quita la reacción de cada persona", () => {
  const history = [];
  const msg = chat.appendMessage(history, chat.createMessage({ type: "text", author: "A", text: "hola" }));
  chat.toggleReaction(history, msg.id, "🔥", "u1");
  chat.toggleReaction(history, msg.id, "🔥", "u2");
  assert.deepEqual(msg.reactions["🔥"], ["u1", "u2"]);
  chat.toggleReaction(history, msg.id, "🔥", "u1");
  assert.deepEqual(msg.reactions["🔥"], ["u2"]);
  chat.toggleReaction(history, msg.id, "🔥", "u2");
  assert.equal(msg.reactions["🔥"], undefined);
  assert.equal(chat.toggleReaction(history, msg.id, "💩", "u1"), null, "solo emojis permitidos");
});

test("las reacciones no aplican a mensajes del sistema", () => {
  const history = [];
  const sys = chat.appendMessage(history, chat.createMessage({ type: "system", author: "", text: "Ana se unió" }));
  assert.equal(chat.toggleReaction(history, sys.id, "🔥", "u1"), null);
});

test("RateLimiter permite N mensajes por ventana", () => {
  let now = 0;
  const limiter = new chat.RateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.ok(limiter.allow("a"));
  assert.ok(limiter.allow("a"));
  assert.ok(!limiter.allow("a"));
  assert.ok(limiter.allow("b"), "cada persona tiene su propio límite");
  now = 1000;
  assert.ok(limiter.allow("a"));
});
