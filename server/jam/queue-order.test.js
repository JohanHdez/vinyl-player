"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { orderQueue, toggleVote, playNow } = require("./queue-order");

const s = (id, extra = {}) => ({ videoId: id, title: id, ...extra });
const ids = (list) => list.map((x) => x.videoId);

test("la más votada de las que esperan suena primero", () => {
  const list = [s("ya-sono"), s("suena"), s("a", { addedAt: 1 }), s("b", { addedAt: 2, votes: ["u1", "u2"] }), s("c", { addedAt: 3, votes: ["u1"] })];
  assert.deepEqual(ids(orderQueue(list, 1)), ["ya-sono", "suena", "b", "c", "a"]);
});

test("a igualdad de votos, los pedidos van antes que la radio y luego por llegada", () => {
  const list = [s("suena"), s("radio1", { source: "radio", addedAt: 1 }), s("pedida2", { addedAt: 3 }), s("pedida1", { addedAt: 2 })];
  assert.deepEqual(ids(orderQueue(list, 0)), ["suena", "pedida1", "pedida2", "radio1"]);
});

test("lo que suena y lo que ya sonó no se mueve aunque tenga menos votos", () => {
  const list = [s("suena"), s("x", { votes: ["u1", "u2", "u3"] })];
  assert.deepEqual(ids(orderQueue(list, 0)), ["suena", "x"]);
});

test("sin nada sonando ordena toda la cola", () => {
  assert.deepEqual(ids(orderQueue([s("a"), s("b", { votes: ["u"] })], -1)), ["b", "a"]);
});

test("toggleVote pone y quita el voto; no se vota lo que ya suena", () => {
  const list = [s("suena"), s("a")];
  assert.equal(toggleVote(list, 0, "a", "u1"), true);
  assert.deepEqual(list[1].votes, ["u1"]);
  toggleVote(list, 0, "a", "u1");
  assert.deepEqual(list[1].votes, []);
  assert.equal(toggleVote(list, 0, "suena", "u1"), false);
  assert.equal(toggleVote(list, 0, "no-existe", "u1"), false);
});

test("orderQueue no modifica la cola original", () => {
  const list = [s("a"), s("b", { votes: ["u"] })];
  orderQueue(list, -1);
  assert.deepEqual(ids(list), ["a", "b"]);
});

test("playNow: elegir una canción de más abajo no da por sonadas las que se saltó", () => {
  const list = [s("sono"), s("suena"), s("a"), s("b"), s("elegida"), s("c")];
  const current = playNow(list, 1, 4);
  assert.equal(current, 2);
  assert.deepEqual(ids(list), ["sono", "suena", "elegida", "a", "b", "c"]);
  // Las que esperaban siguen después de la actual, listas para votar
  assert.deepEqual(ids(list.slice(current + 1)), ["a", "b", "c"]);
});

test("playNow: volver a poner una que ya sonó la trae al frente sin mover el historial", () => {
  const list = [s("vieja"), s("otra"), s("suena"), s("a")];
  const current = playNow(list, 2, 0);
  assert.deepEqual(ids(list), ["otra", "suena", "vieja", "a"]);
  assert.equal(current, 2);
});

test("playNow: sin nada sonando la elegida queda de primera", () => {
  const list = [s("a"), s("b"), s("c")];
  assert.equal(playNow(list, -1, 2), 0);
  assert.deepEqual(ids(list), ["c", "a", "b"]);
});

test("playNow: la misma que suena solo vuelve a empezar", () => {
  const list = [s("a"), s("b")];
  assert.equal(playNow(list, 1, 1), 1);
  assert.deepEqual(ids(list), ["a", "b"]);
});
