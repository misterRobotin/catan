// ══════════════════════════════════════════════════════════════
//  server/modules/game.js — Lógica de estado de partida
// ══════════════════════════════════════════════════════════════

const { VMAP, generateBoard, computePortVertexIds, shuffle } = require('./board');
const { DEV_CARD_DECK, VICTORY_POINTS, DISCARD_THRESHOLD, COSTS, LONGEST_ROAD_MIN, LARGEST_ARMY_MIN } = require('./config');

// ── Utilidades de dados ────────────────────────────────────────
function rollDie() { return Math.floor(Math.random() * 6) + 1; }

// ── Crear estado inicial ───────────────────────────────────────
function createGameState(room) {
  const { hexes, ports } = generateBoard();
  const portVertexIds = computePortVertexIds(ports);
  const devDeck = shuffle([...DEV_CARD_DECK]);

  const players = room.players.map(p => ({
    id: p.id, name: p.name, color: p.color,
    resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    devCards: [], playedDevCards: [],
    settlements: [], cities: [], roads: [],
    points: 0, knightsPlayed: 0, longestRoadLength: 0,
    hasLargestArmy: false, hasLongestRoad: false,
    ports: [],
  }));

  return {
    phase: 'initRoll',       // initRoll | setup | main
    setupRound: 1,
    setupDirection: 1,
    currentPlayerIdx: 0,
    initRolls: {},
    initRollsNeeded: players.length,
    initRollOrder: players.map(p => p.id),
    initRollCurrentIdx: 0,
    players, hexes, ports, portVertexIds, devDeck,
    vertices: {},             // vertexId -> { owner, type }
    edges: {},                // edgeId   -> { owner }
    robberHex: hexes.findIndex(h => h.type === 'desert'),
    largestArmyOwner: null, longestRoadOwner: null,
    diceResult: null,
    turnPhase: 'preRoll',    // preRoll | postRoll | robber | discard
    discardQueue: [],
    tradeOffer: null,
    winner: null,
    log: [],
  };
}

// ── Puntos de victoria ─────────────────────────────────────────
function calcPoints(player) {
  let pts = player.settlements.length
    + player.cities.length * 2
    + (player.hasLargestArmy ? 2 : 0)
    + (player.hasLongestRoad ? 2 : 0);
  pts += player.devCards.filter(c => c.type === 'victory_point').length;
  return pts;
}

// Puntos visibles para el resto de jugadores: igual que calcPoints
// pero SIN sumar las cartas de Punto de Victoria no reveladas
// (solo se conocen tras jugar la carta / ganar la partida).
function calcPublicPoints(player) {
  return player.settlements.length
    + player.cities.length * 2
    + (player.hasLargestArmy ? 2 : 0)
    + (player.hasLongestRoad ? 2 : 0);
}

// Construye una copia del estado de juego segura para enviar a
// `viewerId`: oculta el tipo real de las cartas de desarrollo
// ajenas no jugadas, y sustituye los puntos reales de los rivales
// por sus puntos públicos (sin cartas de victoria ocultas).
function sanitizeStateFor(gs, viewerId) {
  const RESOURCE_KEYS = ['lumber', 'brick', 'wool', 'grain', 'ore'];
  return {
    ...gs,
    players: gs.players.map(p => {
      if (p.id === viewerId) {
        // El propio jugador ve todo, y además recibe sus ratios
        // de intercambio con el banco por recurso (4:1, 3:1 con
        // puerto genérico, 2:1 con puerto específico).
        const bankRatios = {};
        for (const r of RESOURCE_KEYS) bankRatios[r] = getBankRatio(p, r, gs);
        return { ...p, bankRatios };
      }
      return {
        ...p,
        points: calcPublicPoints(p),
        devCards: p.devCards.map(c =>
          c.played ? c : { type: '__hidden__', played: false, boughtThisTurn: c.boughtThisTurn }
        ),
      };
    }),
  };
}

// ── Carretera más larga ────────────────────────────────────────
function calcRoadLength(playerId, edges, vertices) {
  const myEdges = Object.entries(edges)
    .filter(([, e]) => e.owner === playerId)
    .map(([id]) => id);
  if (!myEdges.length) return 0;

  // Edge IDs are "vA|vB" — extract vertex IDs directly
  function getVertexIds(edgeId) {
    return edgeId.split('|');
  }

  const adj = {};
  for (const eid of myEdges) {
    const [vA, vB] = getVertexIds(eid);
    if (!adj[vA]) adj[vA] = [];
    if (!adj[vB]) adj[vB] = [];
    adj[vA].push({ edge: eid, other: vB });
    adj[vB].push({ edge: eid, other: vA });
  }

  let maxLen = 0;
  function dfs(v, used) {
    maxLen = Math.max(maxLen, used.size);
    for (const { edge, other } of (adj[v] || [])) {
      if (used.has(edge)) continue;
      const vData = vertices[other];
      if (vData && vData.owner !== playerId) continue;
      used.add(edge);
      dfs(other, used);
      used.delete(edge);
    }
  }
  for (const v of Object.keys(adj)) dfs(v, new Set());
  return maxLen;
}

// ── Tarjetas especiales (ejército / carretera) ─────────────────
function updateSpecialCards(gs) {
  let maxKnights = gs.largestArmyOwner
    ? (gs.players.find(p => p.id === gs.largestArmyOwner)?.knightsPlayed || 0)
    : LARGEST_ARMY_MIN - 1;
  for (const p of gs.players) {
    if (p.knightsPlayed > maxKnights) {
      maxKnights = p.knightsPlayed;
      if (gs.largestArmyOwner && gs.largestArmyOwner !== p.id) {
        const prev = gs.players.find(x => x.id === gs.largestArmyOwner);
        if (prev) prev.hasLargestArmy = false;
      }
      gs.largestArmyOwner = p.id;
      p.hasLargestArmy = true;
    }
  }

  let maxRoad = gs.longestRoadOwner
    ? calcRoadLength(gs.longestRoadOwner, gs.edges, gs.vertices)
    : LONGEST_ROAD_MIN - 1;
  for (const p of gs.players) {
    p.longestRoadLength = calcRoadLength(p.id, gs.edges, gs.vertices);
    const len = p.longestRoadLength;
    if (len > maxRoad) {
      maxRoad = len;
      if (gs.longestRoadOwner && gs.longestRoadOwner !== p.id) {
        const prev = gs.players.find(x => x.id === gs.longestRoadOwner);
        if (prev) prev.hasLongestRoad = false;
      }
      gs.longestRoadOwner = p.id;
      p.hasLongestRoad = true;
    }
  }
}

// ── Distribución de recursos ───────────────────────────────────
function distributeResources(gs, diceValue) {
  if (diceValue === 7) return { gained: {}, producers: {} };
  const gained = {}, producers = {};
  for (const p of gs.players) { gained[p.id] = {}; producers[p.id] = {}; }
  for (const [vId, vData] of Object.entries(gs.vertices)) {
    if (!vData) continue;
    const player = gs.players.find(p => p.id === vData.owner);
    if (!player) continue;
    for (const hexId of (VMAP[vId] || [])) {
      const hex = gs.hexes[hexId];
      if (!hex || hex.number !== diceValue || hex.hasRobber || !hex.resource) continue;
      const amt = vData.type === 'city' ? 2 : 1;
      gained[player.id][hex.resource] = (gained[player.id][hex.resource] || 0) + amt;
      producers[player.id][hex.resource] = producers[player.id][hex.resource] || [];
      if (!producers[player.id][hex.resource].includes(hexId))
        producers[player.id][hex.resource].push(hexId);
    }
  }
  gs.pendingResources = gained;
  return { gained, producers };
}

// ── Verificar victoria ─────────────────────────────────────────
function checkWinner(gs) {
  for (const p of gs.players) {
    updateSpecialCards(gs);
    p.points = calcPoints(p);
    if (p.points >= VICTORY_POINTS) { gs.winner = p.id; return true; }
  }
  return false;
}

// ── Validar arista conectada ───────────────────────────────────
function isEdgeConnectedServer(edgeId, playerId, gs) {
  const parts = edgeId.split('|');
  if (parts.length !== 2) return false;
  const [vA, vB] = parts;
  const hasOwnVertex = vid => gs.vertices[vid]?.owner === playerId;
  const hasAdjacentRoad = vid => Object.entries(gs.edges).some(([eid, edata]) => {
    if (eid === edgeId || edata.owner !== playerId) return false;
    const [a, b] = eid.split('|');
    return a === vid || b === vid;
  });
  return hasOwnVertex(vA) || hasOwnVertex(vB) || hasAdjacentRoad(vA) || hasAdjacentRoad(vB);
}

// ── Ratio de intercambio con el banco ─────────────────────────
function getBankRatio(player, resource, gs) {
  const playerVertices = new Set(
    Object.entries(gs.vertices)
      .filter(([, v]) => v?.owner === player.id)
      .map(([vid]) => vid)
  );
  let best = 4;
  for (let i = 0; i < (gs.ports || []).length; i++) {
    const port = gs.ports[i];
    const verts = (gs.portVertexIds || [])[i] || [];
    if (!verts.some(v => playerVertices.has(v))) continue;
    if (port.resource === resource) return 2;
    if (port.resource === null && best > 3) best = 3;
  }
  return best;
}

// ── Avanzar turno de setup ─────────────────────────────────────
function advanceSetup(gs) {
  const n = gs.players.length;
  if (gs.setupRound === 1) {
    if (gs.currentPlayerIdx < n - 1) {
      gs.currentPlayerIdx++;
    } else {
      gs.setupRound = 2;
    }
  } else {
    if (gs.currentPlayerIdx > 0) {
      gs.currentPlayerIdx--;
    } else {
      gs.phase = 'main';
      gs.currentPlayerIdx = 0;
      gs.turnPhase = 'preRoll';
      gs.log.push('¡La partida comienza! Turno de ' + gs.players[0].name);
    }
  }
}

module.exports = {
  rollDie, createGameState, calcPoints, calcPublicPoints, sanitizeStateFor, updateSpecialCards,
  distributeResources, checkWinner, isEdgeConnectedServer, calcRoadLength,
  getBankRatio, advanceSetup,
};