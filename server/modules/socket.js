// ══════════════════════════════════════════════════════════════
//  server/modules/socket.js — Registro de todos los eventos
//  de Socket.io. Delega en rooms.js y game.js.
// ══════════════════════════════════════════════════════════════

const {
  rooms, roomPublicData, broadcastRooms,
  createRoom, joinRoom, leaveRoom, startGame, handleDisconnect,
} = require('./rooms');

const {
  rollDie, calcPoints, sanitizeStateFor, updateSpecialCards, calcRoadLength,
  distributeResources, checkWinner, isEdgeConnectedServer,
  getBankRatio, advanceSetup,
} = require('./game');

const { VMAP, VERTEX_ADJ } = require('./board');
const { DISCARD_THRESHOLD } = require('./config');

// Envía a cada jugador de la sala una versión del estado
// personalizada: cada uno ve sus propias cartas ocultas, pero
// solo información pública de los demás (sin cartas de desarrollo
// ni puntos de victoria ocultos ajenos).
function broadcastGameState(io, room) {
  const gs = room.gameState;
  for (const player of gs.players) {
    const socket = io.sockets.sockets.get(player.id);
    if (socket) socket.emit('game:state', sanitizeStateFor(gs, player.id));
  }
}

// ── Registro principal ─────────────────────────────────────────
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Conectado:', socket.id);

    // ── Sala ──────────────────────────────────────────────────
    socket.on('rooms:get', () => {
      const list = Object.values(rooms).filter(r => !r.started).map(roomPublicData);
      socket.emit('rooms:list', list);
    });

    socket.on('room:create', (data) => createRoom(socket, data, io));
    socket.on('room:join', (data) => joinRoom(socket, data, io));
    socket.on('room:leave', () => leaveRoom(socket, io));
    socket.on('game:start', () => startGame(socket, io));

    // ── Tirada inicial ────────────────────────────────────────
    socket.on('game:initRoll', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      if (gs.phase !== 'initRoll') return socket.emit('error', 'No es el momento');

      const currentRollerId = gs.initRollOrder[gs.initRollCurrentIdx];
      if (socket.id !== currentRollerId) return socket.emit('error', 'Espera tu turno');
      if (gs.initRolls[socket.id] !== undefined) return socket.emit('error', 'Ya tiraste');

      const d1 = rollDie(), d2 = rollDie(), total = d1 + d2;
      gs.initRolls[socket.id] = { d1, d2, total };
      const player = gs.players.find(p => p.id === socket.id);
      gs.log.push(`${player?.name || '?'} sacó ${d1}+${d2}=${total} en la tirada inicial`);

      const isLast = gs.initRollCurrentIdx >= gs.initRollOrder.length - 1;
      const nextId = isLast ? null : gs.initRollOrder[gs.initRollCurrentIdx + 1];
      io.to(room.id).emit('game:initRollResult', { playerId: socket.id, d1, d2, total, isLast, nextId });
    });

    socket.on('game:initRollAnimDone', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      if (gs.phase !== 'initRoll') return;
      if (gs.initRollOrder[gs.initRollCurrentIdx] !== socket.id) return;
      if (gs.initRolls[socket.id] === undefined) return;

      gs.initRollCurrentIdx++;
      const allDone = gs.initRollCurrentIdx >= gs.initRollOrder.length;
      if (!allDone) { broadcastGameState(io, room); return; }

      const maxTotal = Math.max(...Object.values(gs.initRolls).map(r => r.total));
      const winners = gs.players.filter(p => gs.initRolls[p.id]?.total === maxTotal);

      if (winners.length === 1) {
        const wi = gs.players.findIndex(p => p.id === winners[0].id);
        gs.players = [...gs.players.slice(wi), ...gs.players.slice(0, wi)];
        gs.currentPlayerIdx = 0;
        gs.phase = 'setup';
        gs.initRolls = {};
        gs.log.push(`${winners[0].name} empieza la partida`);
        for (const player of gs.players) {
          const pSocket = io.sockets.sockets.get(player.id);
          if (pSocket) pSocket.emit('game:initRollDone', { winnerId: winners[0].id, winnerName: winners[0].name, gameState: sanitizeStateFor(gs, player.id) });
        }
      } else {
        const tiedIds = winners.map(p => p.id);
        const newOrder = gs.initRollOrder.filter(id => tiedIds.includes(id));
        tiedIds.forEach(pid => delete gs.initRolls[pid]);
        gs.initRollOrder = newOrder;
        gs.initRollCurrentIdx = 0;
        gs.initRollsNeeded = tiedIds.length;
        gs.log.push(`¡Empate entre ${winners.map(p => p.name).join(' y ')}! Repiten tirada`);
        for (const player of gs.players) {
          const pSocket = io.sockets.sockets.get(player.id);
          if (pSocket) pSocket.emit('game:initRollTie', { tiedIds, gameState: sanitizeStateFor(gs, player.id) });
        }
      }
    });

    // ── Setup ─────────────────────────────────────────────────
    socket.on('game:placeSettlement', ({ vertexId, hexIds }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.phase !== 'setup') return socket.emit('error', 'No es la fase de colocación');
      if (gs.setupWaitingRoad) return socket.emit('error', 'Debes colocar una carretera primero');
      if (gs.vertices[vertexId]) return socket.emit('error', 'Vértice ocupado');

      // Regla de distancia: ningún vértice adyacente puede tener un edificio
      const adj = VERTEX_ADJ[vertexId] || [];
      if (adj.some(n => gs.vertices[n])) return socket.emit('error', 'Demasiado cerca de otro edificio');

      gs.vertices[vertexId] = { owner: socket.id, type: 'settlement', hexIds: hexIds || [] };
      player.settlements.push(vertexId);
      player.points = calcPoints(player);
      gs.log.push(`${player.name} colocó un poblado`);
      gs.setupWaitingRoad = true;
      broadcastGameState(io, room);
    });

    socket.on('game:placeRoad', ({ edgeId }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (!gs.setupWaitingRoad && gs.turnPhase !== 'postRoll') return;
      if (gs.edges[edgeId]) return socket.emit('error', 'Arista ocupada');

      gs.edges[edgeId] = { owner: socket.id };
      player.roads.push(edgeId);
      gs.log.push(`${player.name} colocó una carretera`);

      if (gs.phase === 'setup') {
        gs.setupWaitingRoad = false;
        if (gs.setupRound === 2) {
          const lastVId = player.settlements[player.settlements.length - 1];
          for (const hIdx of (VMAP[lastVId] || [])) {
            const hex = gs.hexes[hIdx];
            if (hex?.resource) player.resources[hex.resource] = (player.resources[hex.resource] || 0) + 1;
          }
        }
        player.longestRoadLength = calcRoadLength(player.id, gs.edges, gs.vertices);
        advanceSetup(gs);
      } else {
        updateSpecialCards(gs);
      }
      broadcastGameState(io, room);
    });

    socket.on('game:setupResources', ({ playerId, resources }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players.find(p => p.id === playerId);
      if (!player) return;
      for (const [res, amt] of Object.entries(resources))
        player.resources[res] = (player.resources[res] || 0) + amt;
      broadcastGameState(io, room);
    });

    // ── Turno principal ───────────────────────────────────────
    socket.on('game:rollDice', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.turnPhase !== 'preRoll') return socket.emit('error', 'Ya tiraste los dados');
      if (gs.diceAnimating) return socket.emit('error', 'Espera a que terminen los dados');

      const d1 = rollDie(), d2 = rollDie(), total = d1 + d2;
      gs.diceResult = { d1, d2, total };
      gs.diceAnimating = true;
      gs.log.push(`${player.name} sacó ${d1}+${d2}=${total}`);

      if (total === 7) {
        io.to(room.id).emit('game:diceRolled', { d1, d2, total, gained: {} });
        gs.discardQueue = gs.players
          .filter(p => Object.values(p.resources).reduce((a, b) => a + b, 0) > DISCARD_THRESHOLD)
          .map(p => ({ playerId: p.id, amount: Math.floor(Object.values(p.resources).reduce((a, b) => a + b, 0) / 2) }));

        setTimeout(() => {
          gs.diceAnimating = false;
          if (gs.discardQueue.length > 0) {
            gs.turnPhase = 'discard';
            io.to(room.id).emit('game:mustDiscard', gs.discardQueue);
          } else {
            gs.turnPhase = 'robber';
            io.to(room.id).emit('game:robber', { playerId: player.id });
          }
          broadcastGameState(io, room);
        }, 3200);
      } else {
        const { gained, producers } = distributeResources(gs, total);
        gs.turnPhase = 'postRoll';
        io.to(room.id).emit('game:diceRolled', { d1, d2, total, gained, producers });
        setTimeout(() => {
          gs.diceAnimating = false;
          broadcastGameState(io, room);
        }, 3500);
      }
    });

    socket.on('game:discard', ({ resources }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players.find(p => p.id === socket.id);
      if (!player) return;
      const entry = gs.discardQueue.find(e => e.playerId === socket.id);
      if (!entry) return;
      const total = Object.values(resources).reduce((a, b) => a + b, 0);
      if (total !== entry.amount) return socket.emit('error', `Debes descartar exactamente ${entry.amount} cartas`);
      for (const [res, amt] of Object.entries(resources))
        player.resources[res] = Math.max(0, (player.resources[res] || 0) - amt);
      gs.discardQueue = gs.discardQueue.filter(e => e.playerId !== socket.id);
      gs.log.push(`${player.name} descartó ${total} cartas`);
      if (gs.discardQueue.length === 0) {
        const active = gs.players[gs.currentPlayerIdx];
        gs.turnPhase = 'robber';
        io.to(room.id).emit('game:robber', { playerId: active.id });
      }
      broadcastGameState(io, room);
    });

    socket.on('game:moveRobber', ({ hexId, stealFrom }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return;
      gs.hexes[gs.robberHex].hasRobber = false;
      gs.robberHex = hexId;
      gs.hexes[hexId].hasRobber = true;
      gs.log.push(`${player.name} movió el ladrón`);
      if (stealFrom) {
        const victim = gs.players.find(p => p.id === stealFrom);
        if (victim) {
          const pool = Object.entries(victim.resources)
            .filter(([, v]) => v > 0)
            .flatMap(([k, v]) => Array(v).fill(k));
          if (pool.length > 0) {
            const stolen = pool[Math.floor(Math.random() * pool.length)];
            victim.resources[stolen]--;
            player.resources[stolen] = (player.resources[stolen] || 0) + 1;
            gs.log.push(`${player.name} robó 1 ${stolen} a ${victim.name}`);
            io.to(room.id).emit('game:stolen', { thief: player.id, victim: stealFrom, resource: stolen });
          }
        }
      }
      gs.turnPhase = 'postRoll';
      broadcastGameState(io, room);
    });

    socket.on('game:buildSettlement', ({ vertexId, hexIds }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.turnPhase !== 'postRoll') return;
      const cost = { lumber: 1, brick: 1, wool: 1, grain: 1 };
      for (const [res, amt] of Object.entries(cost))
        if ((player.resources[res] || 0) < amt) return socket.emit('error', 'Recursos insuficientes');
      if (gs.vertices[vertexId]) return socket.emit('error', 'Vértice ocupado');
      if (player.settlements.length >= 5) return socket.emit('error', 'Máximo 5 poblados');
      for (const [res, amt] of Object.entries(cost)) player.resources[res] -= amt;
      gs.vertices[vertexId] = { owner: socket.id, type: 'settlement', hexIds: hexIds || [] };
      player.settlements.push(vertexId);
      player.points = calcPoints(player);
      gs.log.push(`${player.name} construyó un poblado`);
      updateSpecialCards(gs);
      if (checkWinner(gs)) io.to(room.id).emit('game:over', { winner: gs.winner });
      broadcastGameState(io, room);
    });

    socket.on('game:buildCity', ({ vertexId }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.turnPhase !== 'postRoll') return;
      const cost = { grain: 2, ore: 3 };
      for (const [res, amt] of Object.entries(cost))
        if ((player.resources[res] || 0) < amt) return socket.emit('error', 'Recursos insuficientes');
      const v = gs.vertices[vertexId];
      if (!v || v.owner !== socket.id || v.type !== 'settlement') return socket.emit('error', 'No tienes un poblado aquí');
      if (player.cities.length >= 4) return socket.emit('error', 'Máximo 4 ciudades');
      for (const [res, amt] of Object.entries(cost)) player.resources[res] -= amt;
      gs.vertices[vertexId].type = 'city';
      player.settlements = player.settlements.filter(s => s !== vertexId);
      player.cities.push(vertexId);
      player.points = calcPoints(player);
      gs.log.push(`${player.name} construyó una ciudad`);
      updateSpecialCards(gs);
      if (checkWinner(gs)) io.to(room.id).emit('game:over', { winner: gs.winner });
      broadcastGameState(io, room);
    });

    socket.on('game:buildRoad', ({ edgeId }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.turnPhase !== 'postRoll') return;
      const cost = { lumber: 1, brick: 1 };
      for (const [res, amt] of Object.entries(cost))
        if ((player.resources[res] || 0) < amt) return socket.emit('error', 'Recursos insuficientes');
      if (gs.edges[edgeId]) return socket.emit('error', 'Arista ocupada');
      if (player.roads.length >= 15) return socket.emit('error', 'Máximo 15 carreteras');
      if (!isEdgeConnectedServer(edgeId, socket.id, gs))
        return socket.emit('error', 'La carretera debe estar conectada a tus estructuras o carreteras');
      for (const [res, amt] of Object.entries(cost)) player.resources[res] -= amt;
      gs.edges[edgeId] = { owner: socket.id };
      player.roads.push(edgeId);
      gs.log.push(`${player.name} construyó una carretera`);
      updateSpecialCards(gs);
      if (checkWinner(gs)) io.to(room.id).emit('game:over', { winner: gs.winner });
      broadcastGameState(io, room);
    });

    // Carretera gratuita otorgada por la carta "Construcción de
    // Carreteras": no cobra recursos y consume el contador
    // _roadBuildingLeft en vez de exigir turnPhase postRoll (la
    // carta puede jugarse también antes de tirar los dados).
    socket.on('game:buildRoadFree', ({ edgeId }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (!player._roadBuildingLeft || player._roadBuildingLeft <= 0) {
        return socket.emit('error', 'No tienes carreteras gratuitas pendientes');
      }
      if (gs.edges[edgeId]) return socket.emit('error', 'Arista ocupada');
      if (player.roads.length >= 15) return socket.emit('error', 'Máximo 15 carreteras');
      if (!isEdgeConnectedServer(edgeId, socket.id, gs))
        return socket.emit('error', 'La carretera debe estar conectada a tus estructuras o carreteras');
      gs.edges[edgeId] = { owner: socket.id };
      player.roads.push(edgeId);
      player._roadBuildingLeft--;
      gs.log.push(`${player.name} construyó una carretera gratuita`);
      updateSpecialCards(gs);
      if (checkWinner(gs)) io.to(room.id).emit('game:over', { winner: gs.winner });
      broadcastGameState(io, room);
    });

    socket.on('game:buyDevCard', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.turnPhase !== 'postRoll') return;
      if (gs.devDeck.length === 0) return socket.emit('error', 'No quedan cartas de desarrollo');
      const cost = { ore: 1, wool: 1, grain: 1 };
      for (const [res, amt] of Object.entries(cost))
        if ((player.resources[res] || 0) < amt) return socket.emit('error', 'Recursos insuficientes');
      for (const [res, amt] of Object.entries(cost)) player.resources[res] -= amt;
      const card = gs.devDeck.pop();
      player.devCards.push({ type: card, played: false, boughtThisTurn: true });
      player.points = calcPoints(player);
      gs.log.push(`${player.name} compró una carta de desarrollo`);
      socket.emit('game:devCardBought', { type: card });
      if (checkWinner(gs)) io.to(room.id).emit('game:over', { winner: gs.winner });
      broadcastGameState(io, room);
    });

    socket.on('game:playDevCard', ({ cardType, params }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (cardType === 'victory_point') return socket.emit('error', 'Los puntos de victoria se suman automáticamente');
      const card = player.devCards.find(c => c.type === cardType && !c.played && !c.boughtThisTurn);
      if (!card) return socket.emit('error', 'No tienes esa carta o no puedes jugarla este turno');
      card.played = true;
      player.playedDevCards.push(cardType);

      switch (cardType) {
        case 'knight':
          player.knightsPlayed++;
          updateSpecialCards(gs);
          gs.turnPhase = gs.turnPhase === 'preRoll' ? 'robberPreRoll' : 'robber';
          io.to(room.id).emit('game:robber', { playerId: player.id });
          break;
        case 'road_building':
          player._roadBuildingLeft = 2;
          gs.log.push(`${player.name} jugó Construcción de Carreteras`);
          io.to(room.id).emit('game:roadBuilding', { playerId: player.id });
          break;
        case 'year_of_plenty':
          if (params?.resources) {
            for (const res of params.resources)
              player.resources[res] = (player.resources[res] || 0) + 1;
            gs.log.push(`${player.name} jugó Año de la Abundancia`);
          }
          break;
        case 'monopoly':
          if (params?.resource) {
            let total = 0;
            for (const p of gs.players) {
              if (p.id !== player.id) {
                const amt = p.resources[params.resource] || 0;
                p.resources[params.resource] = 0;
                total += amt;
              }
            }
            player.resources[params.resource] = (player.resources[params.resource] || 0) + total;
            gs.log.push(`${player.name} jugó Monopolio: obtuvo ${total} ${params.resource}`);
          }
          break;
      }
      broadcastGameState(io, room);
    });

    // ── Comercio ──────────────────────────────────────────────
    socket.on('game:tradeOffer', ({ offer, request, targetIds }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return;
      // targetIds: array de ids de destinatarios permitidos, o
      // null/vacío para que cualquier jugador pueda aceptar.
      const normalizedTargets = Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : null;
      gs.tradeOffer = { fromId: socket.id, offer, request, targetIds: normalizedTargets, status: 'pending' };
      gs.log.push(`${player.name} propone intercambio`);
      io.to(room.id).emit('game:tradeOffered', gs.tradeOffer);
      broadcastGameState(io, room);
    });

    socket.on('game:tradeBank', ({ offer, request }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return;
      if (request.amount !== 1) return socket.emit('error', 'Solo puedes pedir 1 unidad de recurso al banco');
      const ratio = getBankRatio(player, offer.resource, gs);
      if (offer.amount !== ratio) return socket.emit('error', `Debes ofrecer exactamente ${ratio} para ese recurso`);
      if ((player.resources[offer.resource] || 0) < offer.amount) return socket.emit('error', 'Recursos insuficientes');
      player.resources[offer.resource] -= offer.amount;
      player.resources[request.resource] = (player.resources[request.resource] || 0) + request.amount;
      gs.log.push(`${player.name} comercia con el banco: ${offer.amount} ${offer.resource} → ${request.amount} ${request.resource}`);
      broadcastGameState(io, room);
    });

    socket.on('game:tradeAccept', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      if (!gs.tradeOffer) return;
      if (gs.tradeOffer.targetIds && !gs.tradeOffer.targetIds.includes(socket.id)) return;
      const fromPlayer = gs.players.find(p => p.id === gs.tradeOffer.fromId);
      const toPlayer = gs.players.find(p => p.id === socket.id);
      if (!fromPlayer || !toPlayer) return;
      for (const [res, amt] of Object.entries(gs.tradeOffer.offer))
        if ((fromPlayer.resources[res] || 0) < amt) return socket.emit('error', 'El ofertante no tiene suficientes recursos');
      for (const [res, amt] of Object.entries(gs.tradeOffer.request))
        if ((toPlayer.resources[res] || 0) < amt) return socket.emit('error', 'No tienes suficientes recursos');
      for (const [res, amt] of Object.entries(gs.tradeOffer.offer)) {
        fromPlayer.resources[res] -= amt;
        toPlayer.resources[res] = (toPlayer.resources[res] || 0) + amt;
      }
      for (const [res, amt] of Object.entries(gs.tradeOffer.request)) {
        toPlayer.resources[res] -= amt;
        fromPlayer.resources[res] = (fromPlayer.resources[res] || 0) + amt;
      }
      gs.log.push(`${fromPlayer.name} y ${toPlayer.name} completaron un intercambio`);
      gs.tradeOffer = null;
      io.to(room.id).emit('game:tradeCompleted', { fromId: fromPlayer.id, toId: toPlayer.id });
      broadcastGameState(io, room);
    });

    socket.on('game:tradeReject', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      room.gameState.tradeOffer = null;
      io.to(room.id).emit('game:tradeCancelled');
      broadcastGameState(io, room);
    });

    socket.on('game:claimResource', ({ res, count }) => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players.find(p => p.id === socket.id);
      if (!player) return;
      const pending = gs.pendingResources?.[socket.id];
      if (!pending || !pending[res] || pending[res] <= 0) return;
      const actual = Math.min(pending[res], count || 1);
      player.resources[res] = (player.resources[res] || 0) + actual;
      pending[res] -= actual;
      if (pending[res] <= 0) delete pending[res];
      broadcastGameState(io, room);
    });

    socket.on('game:endTurn', () => {
      const room = rooms[socket.data.roomId];
      if (!room?.gameState) return;
      const gs = room.gameState;
      const player = gs.players[gs.currentPlayerIdx];
      if (player.id !== socket.id) return socket.emit('error', 'No es tu turno');
      if (gs.turnPhase !== 'postRoll') return socket.emit('error', 'Debes tirar los dados primero');
      for (const card of player.devCards) card.boughtThisTurn = false;
      gs.currentPlayerIdx = (gs.currentPlayerIdx + 1) % gs.players.length;
      gs.turnPhase = 'preRoll';
      gs.diceResult = null;
      gs.tradeOffer = null;
      gs.pendingResources = {};
      broadcastGameState(io, room);
    });

    // ── Chat ──────────────────────────────────────────────────
    socket.on('chat:message', ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id) ||
        room.gameState?.players.find(p => p.id === socket.id);
      if (!player) return;
      const msg = {
        playerId: socket.id, playerName: player.name,
        playerColor: player.color,
        text: text.slice(0, 200), ts: Date.now(),
      };
      io.to(roomId).emit('chat:message', msg);
    });

    // ── Desconexión ───────────────────────────────────────────
    socket.on('disconnect', () => handleDisconnect(socket, io));
  });
}

module.exports = { registerSocketHandlers };