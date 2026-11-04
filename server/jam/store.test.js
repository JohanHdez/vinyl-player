"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRoomStore } = require("./store");

test("guarda y vuelve a cargar salas sin datos de conexión", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vinyl-rooms-"));
  const file = path.join(dir, "rooms.json");
  const store = createRoomStore({ file });
  store.saveNow([{ code: "ABC123", name: "Gym", hostKey: "k", hostId: "socket-1", participants: [{ id: "x" }], playlist: [], currentIndex: -1, messages: [], createdAt: 1, lastActiveAt: 2 }]);
  const [room] = store.load();
  assert.equal(room.code, "ABC123");
  assert.equal(room.hostKey, "k");
  assert.equal(room.hostId, undefined, "no guarda sockets");
  assert.equal(room.participants, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("sin archivo o con archivo dañado devuelve una lista vacía", () => {
  assert.deepEqual(createRoomStore().load(), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vinyl-rooms-"));
  const file = path.join(dir, "rooms.json");
  fs.writeFileSync(file, "{roto");
  assert.deepEqual(createRoomStore({ file, logger: { error() {} } }).load(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
