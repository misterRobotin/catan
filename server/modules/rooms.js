// ══════════════════════════════════════════════════════════════
//  server/modules/rooms.js — Gestión de salas
// ══════════════════════════════════════════════════════════════

const { v4: uuidv4 } = require('uuid');
const { PLAYER_COLORS, MIN_PLAYERS, MAX_PLAYERS } = require('./config');
const { createGameState, sanitizeStateFor } = require('./game');

// Estado global de salas
const rooms = {};

// ── Helpers ────────────────────────────────────────────────────
function pickColor(usedColors) {
  const avail = PLAYER_COLORS.filter(c => !usedColors.includes(c));
  return avail[Math.floor(Math.random() * avail.length)];
}

function roomPublicData(room) {
  return {
    id: room.id,
    name: room.name,
    creatorId: room.creatorId,
    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
    started: room.started,
  };
}

function broadcastRooms(io) {
  const list = Object.values(rooms)
    .filter(r => !r.started)
    .map(roomPublicData);
  io.emit('rooms:list', list);
}

// ── Operaciones de sala ────────────────────────────────────────
function createRoom(socket, { playerName }, io) {
  const roomId = uuidv4().slice(0, 6).toUpperCase();
  const color = pickColor([]);
  const player = { id: socket.id, name: playerName, color };
  const room = { id: roomId, name: `Sala de ${playerName}`, creatorId: socket.id, players: [player], started: false, gameState: null };
  rooms[roomId] = room;
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.emit('room:joined', roomPublicData(room));
  broadcastRooms(io);
}

function joinRoom(socket, { roomId, playerName }, io) {
  const room = rooms[roomId];
  if (!room) return socket.emit('error', 'Sala no encontrada');
  if (room.started) return socket.emit('error', 'La partida ya empezó');
  if (room.players.length >= MAX_PLAYERS) return socket.emit('error', 'Sala llena');

  const color = pickColor(room.players.map(p => p.color));
  const player = { id: socket.id, name: playerName, color };
  room.players.push(player);
  socket.join(roomId);
  socket.data.roomId = roomId;
  io.to(roomId).emit('room:updated', roomPublicData(room));
  socket.emit('room:joined', roomPublicData(room));
  broadcastRooms(io);
}

function leaveRoom(socket, io) {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms[roomId]) return;
  const room = rooms[roomId];

  if (room.creatorId === socket.id) {
    io.to(roomId).emit('room:closed', { reason: 'El creador abandonó la sala' });
    for (const p of room.players) {
      const s = io.sockets.sockets.get(p.id);
      if (s) { s.leave(roomId); s.data.roomId = null; }
    }
    delete rooms[roomId];
  } else {
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(roomId);
    socket.data.roomId = null;
    io.to(roomId).emit('room:updated', roomPublicData(room));
    socket.emit('room:left');
  }
  broadcastRooms(io);
}

function startGame(socket, io) {
  const roomId = socket.data.roomId;
  const room = rooms[roomId];
  if (!room) return;
  if (room.creatorId !== socket.id) return socket.emit('error', 'Solo el creador puede iniciar');
  if (room.players.length < MIN_PLAYERS) return socket.emit('error', `Mínimo ${MIN_PLAYERS} jugadores`);

  room.started = true;
  room.gameState = createGameState(room);
  broadcastRooms(io);
  for (const player of room.gameState.players) {
    const pSocket = io.sockets.sockets.get(player.id);
    if (pSocket) pSocket.emit('game:started', sanitizeStateFor(room.gameState, player.id));
  }
}

function handleDisconnect(socket, io) {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms[roomId]) return;
  const room = rooms[roomId];

  if (room.creatorId === socket.id) {
    io.to(roomId).emit('room:closed', { reason: 'El creador se desconectó' });
    delete rooms[roomId];
    broadcastRooms(io);
  } else {
    room.players = room.players.filter(p => p.id !== socket.id);
    io.to(roomId).emit('room:updated', roomPublicData(room));
    broadcastRooms(io);
  }
}

module.exports = {
  rooms,
  roomPublicData, broadcastRooms,
  createRoom, joinRoom, leaveRoom, startGame, handleDisconnect,
};