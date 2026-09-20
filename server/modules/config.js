// ══════════════════════════════════════════════════════════════
//  server/modules/config.js — Constantes del servidor
//  Para cambiar parámetros del juego edita /config/game.config.json
//  (que se sirve también al cliente).
// ══════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');

// Cargar game.config.json una sola vez al arrancar
let _cfg = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '../../config/game.config.json'), 'utf8');
  _cfg = JSON.parse(raw);
} catch (e) {
  console.warn('[config] No se pudo leer game.config.json, usando defaults:', e.message);
}

// ── Reglas de sala ─────────────────────────────────────────────
const MIN_PLAYERS = _cfg.room?.minPlayers ?? 3;
const MAX_PLAYERS = _cfg.room?.maxPlayers ?? 4;

// ── Puntos de victoria ─────────────────────────────────────────
const VICTORY_POINTS = _cfg.game?.victoryPoints ?? 10;
const ROBBER_THRESHOLD = _cfg.game?.robberThreshold ?? 7;
const DISCARD_THRESHOLD = _cfg.game?.discardThreshold ?? 7;
const LONGEST_ROAD_MIN = _cfg.game?.longestRoadMin ?? 5;
const LARGEST_ARMY_MIN = _cfg.game?.largestArmyMin ?? 3;

// ── Tablero ────────────────────────────────────────────────────
const PLAYER_COLORS = _cfg.playerColors ?? ['blue', 'yellow', 'green', 'purple'];

const TERRAIN_TYPES = Object.entries(_cfg.terrain ?? {
  forest: { resource: 'lumber', count: 4 },
  hills: { resource: 'brick', count: 3 },
  pasture: { resource: 'wool', count: 4 },
  fields: { resource: 'grain', count: 4 },
  mountain: { resource: 'ore', count: 3 },
  desert: { resource: null, count: 1 },
}).map(([type, v]) => ({ type, resource: v.resource, count: v.count }));

const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const STANDARD_BOARD_LAYOUT = [
  [0, 0], [0, 1], [0, 2],
  [1, 0], [1, 1], [1, 2], [1, 3],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
  [3, 0], [3, 1], [3, 2], [3, 3],
  [4, 0], [4, 1], [4, 2],
];

const DEV_CARD_DECK = (() => {
  const deck = [];
  const cards = _cfg.devCards ?? {
    knight: { count: 14 },
    victory_point: { count: 5 },
    road_building: { count: 2 },
    year_of_plenty: { count: 2 },
    monopoly: { count: 2 },
  };
  for (const [type, v] of Object.entries(cards)) {
    for (let i = 0; i < (v.count ?? 0); i++) deck.push(type);
  }
  return deck;
})();

const PORT_TYPES = [
  { resource: 'lumber', ratio: 2 },
  { resource: 'brick', ratio: 2 },
  { resource: 'wool', ratio: 2 },
  { resource: 'grain', ratio: 2 },
  { resource: 'ore', ratio: 2 },
  { resource: null, ratio: 3 },
  { resource: null, ratio: 3 },
  { resource: null, ratio: 3 },
  { resource: null, ratio: 3 },
];

const ALL_PORT_POSITIONS = [
  { hexIdx: 0, edge: 4 },
  { hexIdx: 1, edge: 4 },
  { hexIdx: 2, edge: 5 },
  { hexIdx: 6, edge: 0 },
  { hexIdx: 11, edge: 0 },
  { hexIdx: 12, edge: 2 },
  { hexIdx: 15, edge: 0 },
  { hexIdx: 16, edge: 2 },
  { hexIdx: 17, edge: 1 },
];

// ── Costes de construcción ─────────────────────────────────────
const COSTS = _cfg.costs ?? {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devcard: { wool: 1, grain: 1, ore: 1 },
};

module.exports = {
  MIN_PLAYERS, MAX_PLAYERS,
  VICTORY_POINTS, ROBBER_THRESHOLD, DISCARD_THRESHOLD,
  LONGEST_ROAD_MIN, LARGEST_ARMY_MIN,
  PLAYER_COLORS,
  TERRAIN_TYPES, NUMBER_TOKENS, STANDARD_BOARD_LAYOUT,
  DEV_CARD_DECK, PORT_TYPES, ALL_PORT_POSITIONS,
  COSTS,
};