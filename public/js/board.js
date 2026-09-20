// ══════════════════════════════════════════════════════════════
//  board.js — Renderizado del tablero hexagonal de Catan
// ══════════════════════════════════════════════════════════════

const Board = (() => {

  const HEX_SIZE = 95;  // upper cap; R computed dynamically
  const SQRT3 = Math.sqrt(3);
  const ROW_SIZES = [3, 4, 5, 4, 3];
  const ROW_OFFSETS = [1, 0.5, 0, 0.5, 1];

  const TERRAIN_COLORS = {
    forest: { fill: '#2d6a2d', stroke: '#1a4a1a', icon: '🪵' },
    hills: { fill: '#c0522a', stroke: '#8b3010', icon: '🧱' },
    pasture: { fill: '#6ab04c', stroke: '#4a8030', icon: '🐑' },
    fields: { fill: '#d4a017', stroke: '#a07a00', icon: '🌾' },
    mountain: { fill: '#8e8e8e', stroke: '#5a5a5a', icon: '🪨' },
    desert: { fill: '#d4c07a', stroke: '#a89040', icon: '🌵' },
  };

  const PLAYER_COLORS = {
    blue: '#1e90ff',
    yellow: '#ffd700',
    green: '#32cd32',
    purple: '#9b30ff',
  };

  let canvas, ctx, svgEl;
  let hexes = [], ports = [];
  let hexPositions = [];
  let vertexPositions = {};
  let edgePositions = {};

  let buildMode = null;
  let buildCallback = null;
  let gameState = null;
  let myPlayerId = null;
  let robberMode = false;
  let robberCallback = null;

  // ── Init ─────────────────────────────────────────────────────
  function init(canvasEl, svgElement) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    svgEl = svgElement;
    window.addEventListener('resize', () => {
      if (hexes.length > 0) {
        _drawWhenReady();
      }
    });
  }

  function sizeCanvas() {
    // Canvas es position:fixed 100vw×100vh — resolución = viewport real
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svgEl.setAttribute('width', w);
    svgEl.setAttribute('height', h);
  }

  // ── Posiciones hexagonales ────────────────────────────────────
  function computePositions() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    const boardCX = w / 2;
    const boardCY = h / 2;

    // Ajustar el tamaño del tablero
    const maxR = Math.min(w / 12, h / 12);
    const R = Math.max(maxR, 30);

    hexPositions = [];
    vertexPositions = {};
    edgePositions = {};

    const hexW = SQRT3 * R;
    const vertSpacing = R * 1.5;
    const totalRows = ROW_SIZES.length;
    const startY = boardCY - ((totalRows - 1) / 2) * vertSpacing;

    let hexIdx = 0;
    for (let row = 0; row < totalRows; row++) {
      const size = ROW_SIZES[row];
      const rowWidth = size * hexW;
      const startX = boardCX - rowWidth / 2 + hexW / 2;
      const cy = startY + row * vertSpacing;

      for (let col = 0; col < size; col++) {
        const cx = startX + col * hexW;
        const corners = hexCorners(cx, cy, R);
        hexPositions.push({ cx, cy, corners, R, row, col, vertexIds: [] });
        hexIdx++;
      }
    }

    buildVerticesAndEdges();
  }

  function hexCorners(cx, cy, R) {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = Math.PI / 180 * (60 * i - 30);
      return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
    });
  }

  // Genera vIds normalizados con las mismas coordenadas que el servidor
  // (R_NORM=120, canvas virtual 2000x2000) para que cliente y servidor siempre coincidan.
  const R_NORM = 120;
  const SNAP_NORM = 5;
  function _normCorners(row, col) {
    const hexW_n = SQRT3 * R_NORM;
    const vs_n = R_NORM * 1.5;
    const startY_n = 1000 - 2 * vs_n;
    const sizes = [3, 4, 5, 4, 3];
    const startX_n = 1000 - sizes[row] * hexW_n / 2 + hexW_n / 2;
    const cx = startX_n + col * hexW_n;
    const cy = startY_n + row * vs_n;
    return Array.from({ length: 6 }, (_, i) => {
      const angle = Math.PI / 180 * (60 * i - 30);
      return { x: cx + R_NORM * Math.cos(angle), y: cy + R_NORM * Math.sin(angle) };
    });
  }

  function buildVerticesAndEdges() {
    const snapToVertex = {};

    hexPositions.forEach((hp, hIdx) => {
      hp.vertexIds = [];
      // Usar coordenadas normalizadas para los vIds (igual que servidor)
      const normCorners = _normCorners(hp.row, hp.col);
      hp.corners.forEach((corner, cIdx) => {
        const nc = normCorners[cIdx];
        const sk = `${Math.round(nc.x / SNAP_NORM) * SNAP_NORM},${Math.round(nc.y / SNAP_NORM) * SNAP_NORM}`;
        let vId = snapToVertex[sk];
        if (vId === undefined) {
          vId = `v${Object.keys(snapToVertex).length}`;
          snapToVertex[sk] = vId;
          vertexPositions[vId] = { x: corner.x, y: corner.y, hexIds: [], vertexId: vId };
        } else {
          // Actualizar coordenadas visuales (pueden cambiar con resize)
          vertexPositions[vId].x = corner.x;
          vertexPositions[vId].y = corner.y;
        }
        if (!vertexPositions[vId].hexIds.includes(hIdx)) {
          vertexPositions[vId].hexIds.push(hIdx);
        }
        hp.vertexIds[cIdx] = vId;
      });

      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        const vA = hp.vertexIds[i];
        const vB = hp.vertexIds[j];
        const eId = [vA, vB].sort().join('|');
        if (!edgePositions[eId]) {
          const pA = vertexPositions[vA];
          const pB = vertexPositions[vB];
          edgePositions[eId] = {
            x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y,
            mx: (pA.x + pB.x) / 2, my: (pA.y + pB.y) / 2,
            vA, vB,
          };
        }
      }
    });
  }

  // ── Renderizado ───────────────────────────────────────────────
  function render() {
    if (!ctx || !canvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawOcean();
    if (hexes.length > 0) {
      drawBoardBorder();
      drawHexes();
      drawPorts();
      drawRoads();
      drawSettlements();
    }
    updateSVGOverlay();
  }

  let _waveOffset = 0;
  let _waveRaf = null;

  function drawOcean() {
    const w = canvas.width, h = canvas.height;

    // Fondo degradado azul del mar
    const grad = ctx.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, '#1a7a9e');
    grad.addColorStop(0.4, '#1e5a7e');
    grad.addColorStop(1, '#0f3050');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Reflejo de luz sutil
    ctx.save();
    ctx.globalAlpha = 0.04;
    const lightGrad = ctx.createRadialGradient(w * 0.35, h * 0.25, 0, w * 0.35, h * 0.25, Math.max(w, h) * 0.5);
    lightGrad.addColorStop(0, '#ffffff');
    lightGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Olas como segmentos cortos con fade
    ctx.save();
    ctx.lineCap = 'round';

    const rowCount = 10;
    const segmentsPerRow = 5;
    const rowSpacing = h / rowCount;

    for (let row = 0; row < rowCount; row++) {
      const baseY = rowSpacing * (row + 0.5);
      const speed = 0.3 + (row % 3) * 0.1;
      const phase = row * 1.5 + _waveOffset * speed;

      for (let s = 0; s < segmentsPerRow; s++) {
        // Posición y longitud de cada segmento
        const segLen = 40 + (row * 7 + s * 13) % 50;
        const segOffset = ((phase * 80) % (w / segmentsPerRow + segLen)) - segLen;
        const startX = segOffset + s * (w / segmentsPerRow);
        const alpha = 0.05 + Math.sin(phase + s) * 0.03;

        if (startX + segLen < -20 || startX > w + 20) continue;

        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0.02, alpha)})`;
        ctx.lineWidth = 1.5 + (row % 2) * 0.5;

        // Curva suave para cada segmento
        ctx.beginPath();
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = startX + t * segLen;
          const wave = Math.sin((x / 60) * Math.PI * 2 + phase * 2.5) * 3;
          const fadeIn = Math.min(1, (i / steps) * 4);
          const fadeOut = Math.min(1, (1 - t) * 4);
          const y = baseY + wave * fadeIn * fadeOut;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function startWaveAnimation() {
    if (_waveRaf) return;
    let last = 0;
    function tick(ts) {
      const dt = (ts - last) / 1000;
      last = ts;
      _waveOffset += dt;
      // Only redraw canvas, NOT the SVG overlay
      renderCanvasOnly();
      _waveRaf = requestAnimationFrame(tick);
    }
    _waveRaf = requestAnimationFrame(tick);
  }

  function renderCanvasOnly() {
    if (!ctx || !canvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawOcean();
    if (hexes.length > 0) {
      drawBoardBorder();
      drawPorts();
      drawHexes();
      drawRoads();
      drawSettlements();
    }
  }

  // Draws a solid flat blue sea border around the board + thin white edge
  function drawBoardBorder() {
    if (hexPositions.length === 0) return;

    const edgeMap = {};
    hexPositions.forEach(hp => {
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        const ax = Math.round(hp.corners[i].x), ay = Math.round(hp.corners[i].y);
        const bx = Math.round(hp.corners[j].x), by = Math.round(hp.corners[j].y);
        const key = ax < bx || (ax === bx && ay < by)
          ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
        if (!edgeMap[key]) edgeMap[key] = { ax, ay, bx, by, count: 0 };
        edgeMap[key].count++;
      }
    });
    const outerEdges = Object.values(edgeMap).filter(e => e.count === 1);
    if (outerEdges.length === 0) return;

    const adj = {};
    outerEdges.forEach(({ ax, ay, bx, by }) => {
      const k1 = `${ax},${ay}`, k2 = `${bx},${by}`;
      if (!adj[k1]) adj[k1] = [];
      if (!adj[k2]) adj[k2] = [];
      adj[k1].push({ x: bx, y: by });
      adj[k2].push({ x: ax, y: ay });
    });
    const startKey = Object.keys(adj)[0];
    const [sx, sy] = startKey.split(',').map(Number);
    const hull = [{ x: sx, y: sy }];
    const visited = new Set([startKey]);
    let cur = { x: sx, y: sy };
    for (let i = 0; i < outerEdges.length - 1; i++) {
      const ck = `${cur.x},${cur.y}`;
      const next = (adj[ck] || []).find(n => !visited.has(`${n.x},${n.y}`));
      if (!next) break;
      hull.push(next);
      visited.add(`${next.x},${next.y}`);
      cur = next;
    }

    const R = hexPositions[0].R;

    const drawHull = () => {
      ctx.beginPath();
      hull.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
    };

    function drawOcean() {
      // Same solid color as CSS
      ctx.fillStyle = '#1e5a7e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add more waves
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        const y = Math.random() * canvas.height;
        const x1 = Math.random() * canvas.width;
        ctx.moveTo(x1, y);
        ctx.bezierCurveTo(x1 + 50, y - 15, x1 + 100, y + 15, x1 + 150, y);
        ctx.stroke();
      }
    }

    // Draw border around board (the coast) - thin sandy line
    drawHull();
    ctx.strokeStyle = '#c9a86c';  // sandy beach color
    ctx.lineWidth = R * 0.2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Very subtle inner highlight
    drawHull();
    ctx.strokeStyle = 'rgba(201, 168, 108, 0.2)';
    ctx.lineWidth = R * 0.08;
    ctx.stroke();
  }

  // Get row and column from hex index
  function getHexRowCol(hexIdx) {
    const rowSizes = [3, 4, 5, 4, 3];
    let hexInRow = 0;
    for (let r = 0; r < rowSizes.length; r++) {
      if (hexIdx < hexInRow + rowSizes[r]) {
        return { row: r, col: hexIdx - hexInRow };
      }
      hexInRow += rowSizes[r];
    }
    return { row: -1, col: -1 };
  }

  // Check if a hex is on the outer boundary (row 0, row 4, first col, or last col)
  function isOuterHex(hexIdx) {
    const { row, col } = getHexRowCol(hexIdx);
    const rowSizes = [3, 4, 5, 4, 3];
    if (row === 0 || row === 4) return true;
    if (col === 0 || col === rowSizes[row] - 1) return true;
    return false;
  }

  // Check if an edge of a hex faces outward to the coast
  // Only allow ports on the exact positions that are on outer edges
  function isOuterEdge(hexIdx, edge) {
    // First, check if this is an outer hex (row 0, row 4, first col, or last col)
    if (!isOuterHex(hexIdx)) {
      return false;  // Skip ports on inner hexagons
    }

    // Then check if it's one of the valid outer edge positions
    const validPorts = [
      { hexIdx: 0, edge: 0 },   // top-left, top
      { hexIdx: 1, edge: 0 },   // top-center, top
      { hexIdx: 2, edge: 1 },   // top-right, top-right
      { hexIdx: 6, edge: 2 },   // right-top, right
      { hexIdx: 11, edge: 2 },  // right-bottom, right
      { hexIdx: 15, edge: 3 },  // bottom-right, bottom-right
      { hexIdx: 16, edge: 4 },  // bottom-left, bottom
      { hexIdx: 17, edge: 4 },  // bottom-center, bottom
      { hexIdx: 12, edge: 5 },  // left-bottom, left
    ];

    return validPorts.some(p => p.hexIdx === hexIdx && p.edge === edge);
  }

  function drawPorts() {
    if (!ports || !ports.length || !hexPositions.length) return;

    const PORT_RES_ICONS = { lumber: '🪵', brick: '🧱', wool: '🐑', grain: '🌾', ore: '🪨' };

    ports.forEach(port => {
      const hp = hexPositions[port.hexIdx];
      if (!hp) return;

      const R = hp.R;
      const e = port.edge;
      const c1 = hp.corners[e];
      const c2 = hp.corners[(e + 1) % 6];

      const mx = (c1.x + c2.x) / 2;
      const my = (c1.y + c2.y) / 2;

      // Outward direction from hex center through edge midpoint
      const dx = mx - hp.cx, dy = my - hp.cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      const perpX = -ny, perpY = nx;

      const dockOut = R * 0.7;
      const dockHalf = R * 0.22;
      const outX = mx + nx * dockOut;
      const outY = my + ny * dockOut;

      ctx.save();

      // Dock trapezoid
      const color = '#6B3A1F';
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(outX + perpX * dockHalf, outY + perpY * dockHalf);
      ctx.lineTo(outX - perpX * dockHalf, outY - perpY * dockHalf);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.strokeStyle = '#3d1f0a';
      ctx.lineWidth = 2;
      ctx.stroke();

      const fontSize = Math.max(R * 0.22, 10);
      ctx.font = `${Math.round(fontSize * 1.3)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(port.resource ? (PORT_RES_ICONS[port.resource] || '?') : '⚓', outX, outY - fontSize * 0.6);

      ctx.font = `bold ${Math.round(fontSize)}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4;
      ctx.fillText(port.resource ? '2:1' : '3:1', outX, outY + fontSize * 0.75);
      ctx.shadowBlur = 0;

      ctx.restore();
    });
  }

  function drawHexes() {
    hexes.forEach((hex, idx) => {
      const hp = hexPositions[idx];
      if (!hp) return;
      drawHex(hp, hex);
    });
  }

  function drawHex(hp, hex) {
    const tc = TERRAIN_COLORS[hex.type] || TERRAIN_COLORS.desert;
    const R = hp.R;
    ctx.save();

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    hp.corners.forEach((c, i) => i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y));
    ctx.closePath();

    const grad = ctx.createRadialGradient(hp.cx, hp.cy - R * 0.2, 0, hp.cx, hp.cy, R);
    grad.addColorStop(0, lightenColor(tc.fill, 25));
    grad.addColorStop(0.7, tc.fill);
    grad.addColorStop(1, tc.stroke);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = tc.stroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (hex.hasRobber) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      hp.corners.forEach((c, i) => i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y));
      ctx.closePath();
      ctx.fill();
      ctx.font = `${R * 0.65}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💀', hp.cx, hp.cy);
      ctx.restore();
      return;
    }

    // Icono
    const iconY = hex.number ? hp.cy - R * 0.38 : hp.cy;
    ctx.font = `${R * 0.42}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tc.icon, hp.cx, iconY);

    // Token de número
    if (hex.number) {
      drawNumberToken(hp, hex.number, R);
    }
    ctx.restore();
  }

  function drawNumberToken(hp, number, R) {
    const isRed = [6, 8].includes(number);
    const tokenR = R * 0.33;
    const ty = hp.cy + R * 0.18;

    ctx.beginPath();
    ctx.arc(hp.cx, ty, tokenR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,248,220,0.96)';
    ctx.fill();
    ctx.strokeStyle = isRed ? '#cc0000' : '#8b6914';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `bold ${tokenR * 1.15}px Cinzel, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isRed ? '#cc0000' : '#1a1a1a';
    ctx.fillText(number, hp.cx, ty);

    const dots = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }[number] || 0;
    const sp = 4.5;
    const sx = hp.cx - (dots - 1) * sp / 2;
    for (let d = 0; d < dots; d++) {
      ctx.beginPath();
      ctx.arc(sx + d * sp, ty + tokenR * 0.82, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = isRed ? '#cc0000' : '#555';
      ctx.fill();
    }
  }

  function drawRoads() {
    if (!gameState) return;
    Object.entries(gameState.edges).forEach(([eId, eData]) => {
      const ep = edgePositions[eId];
      if (!ep) return;
      const color = PLAYER_COLORS[getPlayerColor(eData.owner)] || '#fff';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(ep.x1, ep.y1);
      ctx.lineTo(ep.x2, ep.y2);
      ctx.stroke();
      ctx.strokeStyle = lightenColor(color, 50);
      ctx.lineWidth = 3;
      ctx.shadowColor = 'transparent';
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawSettlements() {
    if (!gameState) return;
    Object.entries(gameState.vertices).forEach(([vId, vData]) => {
      const vp = vertexPositions[vId];
      if (!vp) return;
      const color = PLAYER_COLORS[getPlayerColor(vData.owner)] || '#fff';
      drawBuilding(vp.x, vp.y, color, vData.type === 'city');
    });
  }

  // Cache de emojis tintados para no redibujar cada frame
  const _emojiCache = {};

  function _tintedEmoji(emoji, color, size) {
    const key = emoji + color + size;
    if (_emojiCache[key]) return _emojiCache[key];

    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const c = off.getContext('2d');

    // 1. Dibujar emoji normal
    c.font = `${size * 0.82}px serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.drawImage; // noop — evita lazy-eval
    c.fillText(emoji, size / 2, size / 2);

    // 2. Superponer color del jugador con source-atop (tiñe manteniendo forma)
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = 0.72;
    c.fillStyle = color;
    c.fillRect(0, 0, size, size);

    _emojiCache[key] = off;
    return off;
  }

  function drawBuilding(x, y, color, isCity) {
    ctx.save();

    const emoji = isCity ? '🏰' : '🏠';
    const size = isCity ? 38 : 30;

    const tinted = _tintedEmoji(emoji, color, size);
    ctx.drawImage(tinted, Math.round(x - size / 2), Math.round(y - size / 2), size, size);

    ctx.restore();
  }

  // ── SVG overlay para clics ────────────────────────────────────
  function updateSVGOverlay() {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    if (buildMode === 'settlement' || buildMode === 'city') renderVertexHits();
    else if (buildMode === 'road') renderEdgeHits();
    else if (robberMode) renderHexHits();
  }

  function renderVertexHits() {
    const gs = gameState;
    Object.entries(vertexPositions).forEach(([vId, vp]) => {
      if (buildMode === 'settlement') {
        if (gs.vertices[vId]) return;
        if (gs.phase !== 'setup') {
          if (!isVertexConnected(vId)) return;
          if (!isDistanceValid(vId)) return;
        } else {
          if (!isDistanceValid(vId)) return;
        }
      }
      if (buildMode === 'city') {
        const v = gs.vertices[vId];
        if (!v || v.owner !== myPlayerId || v.type !== 'settlement') return;
      }
      const c = makeSVG('circle');
      c.setAttribute('cx', vp.x); c.setAttribute('cy', vp.y); c.setAttribute('r', 13);
      c.setAttribute('fill', 'rgba(245,197,24,0.3)');
      c.setAttribute('stroke', '#f5c518'); c.setAttribute('stroke-width', '2');
      c.style.cursor = 'pointer';
      c.addEventListener('click', () => { if (buildCallback) buildCallback(vId, vp.hexIds || []); });
      c.addEventListener('mouseenter', () => { c.setAttribute('fill', 'rgba(245,197,24,0.65)'); c.setAttribute('r', '15'); });
      c.addEventListener('mouseleave', () => { c.setAttribute('fill', 'rgba(245,197,24,0.3)'); c.setAttribute('r', '13'); });
      svgEl.appendChild(c);
    });
  }

  function renderEdgeHits() {
    const gs = gameState;
    Object.entries(edgePositions).forEach(([eId, ep]) => {
      if (gs.edges[eId]) return;
      // En setup: solo aristas adyacentes al último asentamiento propio
      // En partida: solo aristas conectadas a estructuras/carreteras propias
      if (!isEdgeConnected(eId)) return;
      const l = makeSVG('line');
      l.setAttribute('x1', ep.x1); l.setAttribute('y1', ep.y1);
      l.setAttribute('x2', ep.x2); l.setAttribute('y2', ep.y2);
      l.setAttribute('stroke', 'rgba(245,197,24,0.45)');
      l.setAttribute('stroke-width', '12'); l.setAttribute('stroke-linecap', 'round');
      l.style.cursor = 'pointer';
      l.addEventListener('click', () => { if (buildCallback) buildCallback(eId); });
      l.addEventListener('mouseenter', () => l.setAttribute('stroke', 'rgba(245,197,24,0.9)'));
      l.addEventListener('mouseleave', () => l.setAttribute('stroke', 'rgba(245,197,24,0.45)'));
      svgEl.appendChild(l);
    });
  }

  function renderHexHits() {
    hexPositions.forEach((hp, idx) => {
      if (hexes[idx]?.hasRobber) return;
      const p = makeSVG('polygon');
      p.setAttribute('points', hp.corners.map(c => `${c.x},${c.y}`).join(' '));
      p.setAttribute('fill', 'rgba(245,197,24,0.12)');
      p.setAttribute('stroke', '#f5c518'); p.setAttribute('stroke-width', '2');
      p.style.cursor = 'pointer';
      p.addEventListener('click', () => { if (robberCallback) robberCallback(idx, hexes[idx]); });
      p.addEventListener('mouseenter', () => p.setAttribute('fill', 'rgba(245,197,24,0.38)'));
      p.addEventListener('mouseleave', () => p.setAttribute('fill', 'rgba(245,197,24,0.12)'));
      svgEl.appendChild(p);
    });
  }

  function makeSVG(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  // ── Validaciones ──────────────────────────────────────────────
  function isVertexConnected(vId) {
    if (!gameState) return false;
    return Object.entries(edgePositions).some(([eId, ep]) =>
      (ep.vA === vId || ep.vB === vId) && gameState.edges[eId]?.owner === myPlayerId
    );
  }

  function isDistanceValid(vId) {
    if (!gameState) return true;
    return !Object.entries(edgePositions).some(([, ep]) => {
      const other = ep.vA === vId ? ep.vB : ep.vB === vId ? ep.vA : null;
      return other && gameState.vertices[other];
    });
  }

  function isEdgeConnected(eId) {
    if (!gameState) return false;
    const ep = edgePositions[eId];
    if (!ep) return false;

    // En setup: solo aristas que toquen el último asentamiento propio
    if (gameState.phase === 'setup' && gameState.setupWaitingRoad) {
      const me = gameState.players.find(p => p.id === myPlayerId);
      if (!me) return false;
      const lastSettlement = me.settlements[me.settlements.length - 1];
      if (!lastSettlement) return false;
      return ep.vA === lastSettlement || ep.vB === lastSettlement;
    }

    // En partida normal: conectada a asentamiento/ciudad/carretera propia
    const mine = (vid) => gameState.vertices[vid]?.owner === myPlayerId;
    const roadAdj = (vid) => Object.entries(edgePositions).some(([id2, ep2]) =>
      id2 !== eId && (ep2.vA === vid || ep2.vB === vid) && gameState.edges[id2]?.owner === myPlayerId
    );
    return mine(ep.vA) || mine(ep.vB) || roadAdj(ep.vA) || roadAdj(ep.vB);
  }

  // ── API pública ───────────────────────────────────────────────
  function setBuildMode(mode, cb) { buildMode = mode; buildCallback = cb; robberMode = false; render(); }
  function clearBuildMode() { buildMode = null; buildCallback = null; render(); }
  function setRobberMode(cb) { robberMode = true; robberCallback = cb; buildMode = null; render(); }
  function clearRobberMode() { robberMode = false; robberCallback = null; render(); }

  // Comprueba si el jugador tiene al menos una arista disponible
  // para construir una carretera ahora mismo (usado para saber si
  // tiene sentido activar el modo de construcción, p.ej. antes de
  // jugar Construcción de Carreteras).
  function hasAvailableRoadSpot() {
    if (!gameState) return false;
    return Object.entries(edgePositions).some(([eId]) => !gameState.edges[eId] && isEdgeConnected(eId));
  }

  function updateState(gs, pid) {
    startWaveAnimation();
    gameState = gs;
    myPlayerId = pid;
    if (gs) {
      hexes = gs.hexes;
      ports = gs.ports || [];

      // Debug: log port data from server and filter results
      if (typeof console !== 'undefined' && ports.length > 0) {
        ports.forEach(p => {
          const isOuter = isOuterHex(p.hexIdx);
          const isEdge = isOuterEdge(p.hexIdx, p.edge);
        });
      }

      _drawWhenReady();
      return;
    }
    render();
  }

  // Draws the board as soon as the wrapper has real dimensions.
  // Uses ResizeObserver so it fires exactly when the layout is computed,
  // regardless of how many frames the browser needs after display:grid.
  let _pendingObserver = null;
  function _drawWhenReady() {
    if (_pendingObserver) {
      _pendingObserver.disconnect();
      _pendingObserver = null;
    }

    const tryDraw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w > 10 && h > 10) {
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        svgEl.setAttribute('viewBox', `0 0 ${Math.round(w)} ${Math.round(h)}`);
        svgEl.setAttribute('width', Math.round(w));
        svgEl.setAttribute('height', Math.round(h));
        computePositions();
        render();
        return true;
      }
      return false;
    };

    if (tryDraw()) return;

    _pendingObserver = new ResizeObserver(() => {
      _pendingObserver.disconnect();
      _pendingObserver = null;
      tryDraw();
    });
    _pendingObserver.observe(document.body);
  }

  function getPlayerColor(playerId) {
    if (!gameState) return 'blue';
    return gameState.players.find(p => p.id === playerId)?.color || 'blue';
  }

  function lightenColor(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
  }

  // Devuelve coordenadas locales del canvas (relativas al board-wrapper)
  function getHexCanvasPos(hexIdx) {
    const hp = hexPositions[hexIdx];
    if (!hp) return null;
    return { x: hp.cx, y: hp.cy, R: hp.R };
  }

  return {
    init, render, updateState, getHexCanvasPos, startWaveAnimation,
    setBuildMode, clearBuildMode,
    setRobberMode, clearRobberMode,
    hasAvailableRoadSpot,
    getVertexPositions: () => vertexPositions,
    getEdgePositions: () => edgePositions,
    getHexPositions: () => hexPositions,
  };

})();