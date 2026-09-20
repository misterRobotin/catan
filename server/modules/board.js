// ══════════════════════════════════════════════════════════════
//  server/modules/board.js — Generación del tablero y mapas
//  de vértices/aristas
// ══════════════════════════════════════════════════════════════

const {
  TERRAIN_TYPES, NUMBER_TOKENS, STANDARD_BOARD_LAYOUT,
  PORT_TYPES,
} = require('./config');

// ── Utilidades ─────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Cálculo del mapa de vértices (server-side) ─────────────────
const _S3 = Math.sqrt(3);
const _ROWS = [3, 4, 5, 4, 3];

function _hexCorners(cx, cy, R) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
}

function buildVertexMap() {
  const R = 120, hexW = _S3 * R, vs = R * 1.5;
  const startY = 1000 - 2 * vs;
  const hexes = [];
  _ROWS.forEach((size, row) => {
    const startX = 1000 - size * hexW / 2 + hexW / 2;
    const cy = startY + row * vs;
    for (let col = 0; col < size; col++) {
      hexes.push({ corners: _hexCorners(startX + col * hexW, cy, R) });
    }
  });

  const snap = {}, v2h = {}, snapToVid = {};
  hexes.forEach((hp, hIdx) => {
    hp.corners.forEach(c => {
      const sk = Math.round(c.x / 5) * 5 + ',' + Math.round(c.y / 5) * 5;
      if (!snap[sk]) {
        snap[sk] = 'v' + Object.keys(snap).length;
        v2h[snap[sk]] = [];
      }
      if (!v2h[snap[sk]].includes(hIdx)) v2h[snap[sk]].push(hIdx);
      snapToVid[sk] = snap[sk];
    });
  });
  return { v2h, snapToVid };
}

const { v2h: VMAP, snapToVid: SNAP_TO_VID } = buildVertexMap();
console.log('[SERVER] VMAP vertices:', Object.keys(VMAP).length);

// ── Calcular vértices de cada puerto ───────────────────────────
function computePortVertexIds(ports) {
  const R = 120, hexW = _S3 * R, vs = R * 1.5;
  const startY = 1000 - 2 * vs;
  const hexCenters = [];
  _ROWS.forEach((size, row) => {
    const startX = 1000 - size * hexW / 2 + hexW / 2;
    const cy = startY + row * vs;
    for (let col = 0; col < size; col++) hexCenters.push({ cx: startX + col * hexW, cy });
  });

  return ports.map(slot => {
    const hc = hexCenters[slot.hexIdx];
    if (!hc) return [];
    const corners = _hexCorners(hc.cx, hc.cy, R);
    const c1 = corners[slot.edge];
    const c2 = corners[(slot.edge + 1) % 6];
    const sk1 = Math.round(c1.x / 5) * 5 + ',' + Math.round(c1.y / 5) * 5;
    const sk2 = Math.round(c2.x / 5) * 5 + ',' + Math.round(c2.y / 5) * 5;
    return [SNAP_TO_VID[sk1], SNAP_TO_VID[sk2]].filter(Boolean);
  });
}

// ── Aristas de borde (contorno exterior del tablero) ───────────
// Se usan para colocar los puertos en posiciones realmente
// aleatorias en cada partida, en vez de un set fijo.
function buildBorderRing() {
  const R = 120, hexW = _S3 * R, vs = R * 1.5;
  const startY = 1000 - 2 * vs;
  const hexCenters = [];
  _ROWS.forEach((size, row) => {
    const startX = 1000 - size * hexW / 2 + hexW / 2;
    const cy = startY + row * vs;
    for (let col = 0; col < size; col++) hexCenters.push({ cx: startX + col * hexW, cy });
  });

  const vkey = p => Math.round(p.x / 5) * 5 + ',' + Math.round(p.y / 5) * 5;

  // Cuenta cuántos hexágonos comparten cada arista; las de borde
  // solo pertenecen a 1 hexágono (el otro lado da al mar).
  const edgeMap = {};
  hexCenters.forEach((hc, h) => {
    const corners = _hexCorners(hc.cx, hc.cy, R);
    for (let e = 0; e < 6; e++) {
      const c1 = corners[e], c2 = corners[(e + 1) % 6];
      const k1 = vkey(c1), k2 = vkey(c2);
      const key = [k1, k2].sort().join('|');
      if (!edgeMap[key]) edgeMap[key] = { hexes: [], v1: k1, v2: k2 };
      edgeMap[key].hexes.push({ hexIdx: h, edge: e });
    }
  });

  const borderEntries = Object.entries(edgeMap).filter(([, v]) => v.hexes.length === 1);

  // Recorre el anillo exterior en orden, para poder espaciar
  // los puertos de forma pareja alrededor del contorno.
  const vertexToEdges = {};
  borderEntries.forEach(([key, v]) => {
    const rep = v.hexes[0];
    const entry = { key, v1: v.v1, v2: v.v2, ...rep };
    (vertexToEdges[v.v1] ||= []).push(entry);
    (vertexToEdges[v.v2] ||= []).push(entry);
  });

  const [firstKey, first] = borderEntries[0];
  const visited = new Set();
  const ordered = [];
  let currentEdge = { key: firstKey, v1: first.v1, v2: first.v2, ...first.hexes[0] };
  let enterVertex = currentEdge.v1;

  for (let i = 0; i < borderEntries.length; i++) {
    visited.add(currentEdge.key);
    ordered.push({ hexIdx: currentEdge.hexIdx, edge: currentEdge.edge });
    const exitVertex = (currentEdge.v1 === enterVertex) ? currentEdge.v2 : currentEdge.v1;
    const candidates = (vertexToEdges[exitVertex] || []).filter(e => !visited.has(e.key));
    if (candidates.length === 0) break;
    currentEdge = candidates[0];
    enterVertex = exitVertex;
  }

  return ordered;
}

const BORDER_RING = buildBorderRing();

// Elige N posiciones de puerto al azar sobre el anillo de borde,
// manteniendo una separación mínima entre puertos consecutivos
// (igual que en el tablero físico, donde nunca hay dos puertos
// en aristas contiguas).
function pickRandomPortPositions(count) {
  const ring = BORDER_RING;
  const n = ring.length;
  const minGap = Math.max(2, Math.floor(n / count) - 1);

  // Probar varios desplazamientos de inicio aleatorios hasta
  // encontrar una distribución válida; con n=30 y count=9 esto
  // converge casi siempre en el primer intento.
  for (let attempt = 0; attempt < 50; attempt++) {
    const startOffset = Math.floor(Math.random() * n);
    const chosen = [];
    let pos = startOffset;
    let ok = true;
    for (let i = 0; i < count; i++) {
      chosen.push(pos);
      const gap = minGap + Math.floor(Math.random() * 2); // pequeña variación
      pos = (pos + gap) % n;
    }
    // Verificar que no se solape el último con el primero
    const sorted = [...chosen].sort((a, b) => a - b);
    let valid = true;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      const dist = (b - a + n) % n;
      if (dist !== 0 && dist < minGap) { valid = false; break; }
    }
    if (valid && new Set(chosen).size === count) {
      return chosen.map(idx => ring[idx]);
    }
  }
  // Fallback: reparto uniforme simple si el azar no converge
  const step = n / count;
  const startOffset = Math.floor(Math.random() * n);
  return Array.from({ length: count }, (_, i) => ring[(startOffset + Math.round(i * step)) % n]);
}

// ── Generación del tablero ─────────────────────────────────────
function generateBoard() {
  let terrains = [];
  for (const t of TERRAIN_TYPES) {
    for (let i = 0; i < t.count; i++) terrains.push({ type: t.type, resource: t.resource });
  }
  terrains = shuffle(terrains);

  let numbers = shuffle([...NUMBER_TOKENS]);
  const hexes = STANDARD_BOARD_LAYOUT.map(([row, col], idx) => {
    const terrain = terrains[idx];
    const number = terrain.type === 'desert' ? null : numbers.shift();
    return {
      id: idx, row, col,
      type: terrain.type, resource: terrain.resource, number,
      hasRobber: terrain.type === 'desert',
    };
  });

  const portTypes = shuffle([...PORT_TYPES]);
  const portPositions = pickRandomPortPositions(PORT_TYPES.length);
  const ports = portPositions.map((slot, i) => ({
    ...portTypes[i],
    hexIdx: slot.hexIdx, edge: slot.edge, id: i,
  }));

  return { hexes, ports };
}

// ── Mapa de adyacencia entre vértices (comparten arista) ──────
function buildVertexAdjacency() {
  const R = 120, hexW = _S3 * R, vs = R * 1.5;
  const startY = 1000 - 2 * vs;
  const rows = [3, 4, 5, 4, 3];
  const hexes = [];
  rows.forEach((size, row) => {
    const startX = 1000 - size * hexW / 2 + hexW / 2;
    const cy = startY + row * vs;
    for (let col = 0; col < size; col++) {
      hexes.push({ corners: _hexCorners(startX + col * hexW, cy, R) });
    }
  });

  const snap = {}, snapToVid = {};
  hexes.forEach(hp => {
    hp.corners.forEach(c => {
      const sk = Math.round(c.x / 5) * 5 + ',' + Math.round(c.y / 5) * 5;
      if (!snap[sk]) { snap[sk] = 'v' + Object.keys(snap).length; }
      snapToVid[sk] = snap[sk];
    });
  });

  // Build vertexIds per hex, then adjacency from edges
  const adj = {};
  hexes.forEach(hp => {
    const vIds = hp.corners.map(c => {
      const sk = Math.round(c.x / 5) * 5 + ',' + Math.round(c.y / 5) * 5;
      return snapToVid[sk];
    });
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const vA = vIds[i], vB = vIds[j];
      if (!adj[vA]) adj[vA] = new Set();
      if (!adj[vB]) adj[vB] = new Set();
      adj[vA].add(vB);
      adj[vB].add(vA);
    }
  });
  // Convert sets to arrays
  const result = {};
  for (const [k, v] of Object.entries(adj)) result[k] = [...v];
  return result;
}

const VERTEX_ADJ = buildVertexAdjacency();

module.exports = { VMAP, VERTEX_ADJ, generateBoard, computePortVertexIds, shuffle };