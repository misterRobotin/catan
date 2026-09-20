// ══════════════════════════════════════════════════════════════
//  game.js — Lógica del cliente: estado del juego y eventos
// ══════════════════════════════════════════════════════════════

const Game = (() => {

  let socket = null;
  let myId = null;
  let myName = null;
  let myRoom = null;
  let gameState = null;
  let pendingAction = null; // 'crear' | 'unirse'

  // ── Inicialización ──────────────────────────────────────────
  function init() {
    socket = io();
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      UI.toast('Error de conexión: ' + err.message, 'error');
    });
    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });
    bindSocketEvents();
  }

  // ── Eventos del servidor ────────────────────────────────────
  function bindSocketEvents() {

    socket.on('connect', () => {
      myId = socket.id;
      console.log('Conectado como', myId);
    });

    socket.on('error', (msg) => {
      UI.toast(msg, 'error');
    });

    // ── Salas ────────────────────────────────────────────────
    socket.on('rooms:list', (rooms) => {
      UI.renderRoomList(rooms);
    });

    socket.on('room:joined', (room) => {
      myRoom = room;
      const isCreator = room.creatorId === myId;
      if (isCreator) {
        UI.showScreen('screen-sala-crear');
        UI.renderCreatorRoom(room);
      } else {
        UI.showScreen('screen-sala-espera');
        UI.renderGuestRoom(room);
      }
    });

    socket.on('room:updated', (room) => {
      myRoom = room;
      const isCreator = room.creatorId === myId;
      if (isCreator) {
        UI.renderCreatorRoom(room);
      } else {
        UI.renderGuestRoom(room);
      }
    });

    socket.on('room:closed', ({ reason }) => {
      UI.toast(reason || 'La sala se cerró', 'error');
      myRoom = null;
      UI.showScreen('screen-menu');
    });

    socket.on('room:left', () => {
      myRoom = null;
      UI.showScreen('screen-menu');
    });

    // ── Juego ────────────────────────────────────────────────
    socket.on('game:started', (gs) => {
      gameState = gs;
      UI.showScreen('screen-game');
      UI.initGameScreen(gs, myId);
      setTimeout(() => {
        Board.updateState(gs, myId);
        UI.updateGameUI(gs, myId);
        // updateGameUI ya gestiona initRoll/setup/main internamente
      }, 80);
    });

    socket.on('game:state', (gs) => {
      if (gameState && gs.currentPlayerIdx !== gameState.currentPlayerIdx) {
        UI.clearResourceBubbles();
      }
      gameState = gs;
      Board.updateState(gs, myId);
      UI.updateGameUI(gs, myId);
      // updateGameUI ya gestiona initRoll/setup/main internamente
    });

    // Resultado de tirada inicial de un jugador
    socket.on('game:initRollResult', ({ playerId, d1, d2, total, isLast, nextId }) => {
      const p = gameState?.players.find(pl => pl.id === playerId);
      UI.animateDice(d1, d2, total);
      UI.toast(`${p?.name || '?'} sacó ${total} (${d1}+${d2})`, 'info');
      // Esperar animación (~2.5s) y avisar al servidor que puede avanzar
      setTimeout(() => {
        socket.emit('game:initRollAnimDone');
      }, 2600);
    });

    // Tirada inicial resuelta sin empate
    socket.on('game:initRollDone', ({ winnerId, winnerName, gameState: gs }) => {
      gameState = gs;
      Board.updateState(gs, myId);
      UI.updateGameUI(gs, myId);
      if (winnerId === myId) {
        UI.toast('¡Sacaste el mayor número! Empiezas tú 🎉', 'success');
      } else {
        UI.toast(`${winnerName} empieza la partida`, 'info');
      }
      setTimeout(() => {
        if (gs.phase === 'setup') checkSetupTurn();
      }, 2000);
    });

    // Empate en tirada inicial
    socket.on('game:initRollTie', ({ tiedIds, gameState: gs }) => {
      gameState = gs;
      Board.updateState(gs, myId);
      UI.updateGameUI(gs, myId);
      const msg = tiedIds.includes(myId) ? '¡Empate! Vuelve a tirar' : 'Hay un empate, los empatados repiten...';
      UI.toast(msg, 'info');
      checkInitRollTurn();
    });

    socket.on('game:diceRolled', ({ d1, d2, total, gained, producers }) => {
      UI.animateDice(d1, d2, total);
      if (total !== 7 && gained && gained[myId]) {
        const myGained = Object.fromEntries(Object.entries(gained[myId]).filter(([, v]) => v > 0));
        const myProducers = (producers && producers[myId]) ? producers[myId] : {};
        if (Object.keys(myGained).length > 0) {
          // Esperar a que termine la animación de los dados (3.5s) antes de mostrar
          setTimeout(() => {
            UI.showResourceBubbles(myGained, myProducers, (res, count) => {
              socket.emit('game:claimResource', { res, count });
            });
          }, 3500);
        }
      }
    });

    socket.on('game:mustDiscard', (queue) => {
      const entry = queue.find(e => e.playerId === myId);
      if (entry) {
        UI.showDiscardModal(entry.amount);
      } else {
        UI.toast('Algunos jugadores deben descartar cartas...', 'info');
      }
    });

    socket.on('game:robber', ({ playerId }) => {
      if (playerId === myId) {
        UI.toast('¡Mueve el ladrón!', 'info');
        UI.showRobberModal();
      } else {
        const p = gameState?.players.find(pl => pl.id === playerId);
        UI.toast(`${p?.name || 'Un jugador'} está moviendo el ladrón...`, 'info');
      }
    });

    socket.on('game:stolen', ({ thief, victim, resource }) => {
      const thiefP = gameState?.players.find(p => p.id === thief);
      const victimP = gameState?.players.find(p => p.id === victim);
      if (victim === myId) {
        UI.toast(`${thiefP?.name} te robó 1 ${UI.resName(resource)}`, 'error');
      } else if (thief === myId) {
        UI.toast(`Robaste 1 ${UI.resName(resource)} a ${victimP?.name}`, 'success');
      }
    });

    socket.on('game:tradeOffered', (offer) => {
      if (offer.targetIds && !offer.targetIds.includes(myId)) return;
      if (offer.fromId === myId) return;
      const sender = gameState?.players.find(p => p.id === offer.fromId);
      UI.showTradeReceived(offer, sender?.name || 'Alguien', gameState, myId);
    });

    socket.on('game:tradeCancelled', () => {
      UI.hideModal('modal-trade-received');
      UI.toast('La oferta fue rechazada', 'info');
    });

    socket.on('game:tradeCompleted', ({ fromId, toId }) => {
      UI.hideModal('modal-trade-received');
      const from = gameState?.players.find(p => p.id === fromId);
      const to = gameState?.players.find(p => p.id === toId);
      UI.toast(`✅ Intercambio completado entre ${from?.name} y ${to?.name}`, 'success');
    });

    socket.on('game:roadBuilding', ({ playerId }) => {
      if (playerId === myId) {
        startFreeRoadBuildingChain();
      }
    });

    socket.on('game:devCardBought', ({ type }) => {
      UI.toast(`Compraste: ${UI.devCardName(type)}`, 'success');
    });

    socket.on('game:over', ({ winner }) => {
      const p = gameState?.players.find(pl => pl.id === winner);
      UI.showWinner(p?.name || 'Alguien');
    });

    socket.on('chat:message', (msg) => {
      UI.addChatMessage(msg);
    });
  }

  // ── Setup: turno de colocar asentamientos ────────────────────
  function checkInitRollTurn() {
    if (!gameState) return;
    const gs = gameState;
    const currentRollerId = gs.initRollOrder?.[gs.initRollCurrentIdx];
    const isMyTurn = currentRollerId === myId;
    const alreadyRolled = gs.initRolls?.[myId] !== undefined;
    const rollerName = gs.players.find(p => p.id === currentRollerId)?.name || '?';

    UI.clearActionButtons();
    UI.setTurnIndicator(
      { name: isMyTurn ? '¡Tira los dados!' : `Turno de ${rollerName}`, color: 'yellow' },
      isMyTurn && !alreadyRolled,
      'initRoll'
    );

    if (isMyTurn && !alreadyRolled) {
      UI.addActionButton('🎲 Tirar dados — Determinar orden', 'primary', () => {
        socket.emit('game:initRoll');
      });
    }
  }

  function checkSetupTurn() {
    if (!gameState) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIdx];
    const isMyTurn = currentPlayer.id === myId;
    UI.setTurnIndicator(currentPlayer, isMyTurn, 'setup');
    UI.clearActionButtons();

    if (!isMyTurn) return;

    if (!gameState.setupWaitingRoad) {
      // Colocar asentamiento
      UI.showBuildIndicator('Coloca un poblado');
      Board.setBuildMode('settlement', (vId, hexIds) => {
        Board.clearBuildMode();
        UI.hideBuildIndicator();
        socket.emit('game:placeSettlement', { vertexId: vId, hexIds: hexIds || [] });
        // Ronda 2: el servidor distribuye los recursos automáticamente con VMAP
      });
    } else {
      // Colocar carretera
      UI.showBuildIndicator('Coloca una carretera');
      Board.setBuildMode('road', (eId) => {
        Board.clearBuildMode();
        UI.hideBuildIndicator();
        socket.emit('game:placeRoad', { edgeId: eId });
      });
    }
  }

  // ── Turno principal ──────────────────────────────────────────
  function renderMainTurnButtons() {
    if (!gameState) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIdx];
    const isMyTurn = currentPlayer.id === myId;
    UI.setTurnIndicator(currentPlayer, isMyTurn, gameState.turnPhase);
    UI.clearActionButtons();

    if (!isMyTurn) return;

    const tp = gameState.turnPhase;

    if (tp === 'preRoll') {
      UI.addActionButton('🎲 Tirar Dados', 'primary', () => {
        if (UI.isDiceAnimating()) return;
        socket.emit('game:rollDice');
      });
      // Carta de caballero antes de tirar — sigue disponible desde el panel,
      // pero añadimos botón rápido si tiene caballero
      const me = gameState.players.find(p => p.id === myId);
      const hasKnight = me?.devCards.some(c => c.type === 'knight' && !c.played && !c.boughtThisTurn);
      if (hasKnight) {
        UI.addActionButton('⚔️ Caballero', 'secondary', () => playDevCard('knight'));
      }
    }

    if (tp === 'postRoll') {
      UI.addActionButton('🤝 Negociar', 'secondary', () => UI.showTradeModal(gameState, myId));
      UI.addActionButton('⚒️ Fabricar', 'secondary', () => UI.showExchangeModal(gameState, myId));
      UI.addActionButton('➡️ Pasar Turno', 'danger', () => socket.emit('game:endTurn'));
    }
  }

  // ── Construcción ─────────────────────────────────────────────
  function startBuildSettlement() {
    UI.showBuildIndicator('Selecciona dónde construir el poblado');
    Board.setBuildMode('settlement', (vId, hexIds) => {
      Board.clearBuildMode();
      UI.hideBuildIndicator();
      socket.emit('game:buildSettlement', { vertexId: vId, hexIds: hexIds || [] });
    });
  }

  function startBuildCity() {
    UI.showBuildIndicator('Selecciona qué poblado convertir en ciudad');
    Board.setBuildMode('city', (vId) => {
      Board.clearBuildMode();
      UI.hideBuildIndicator();
      socket.emit('game:buildCity', { vertexId: vId });
    });
  }

  function startBuildRoad() {
    UI.showBuildIndicator('Selecciona dónde construir la carretera');
    Board.setBuildMode('road', (eId) => {
      Board.clearBuildMode();
      UI.hideBuildIndicator();
      socket.emit('game:buildRoad', { edgeId: eId });
    });
  }

  // Encadena la colocación de las 2 carreteras gratuitas de la
  // carta "Construcción de Carreteras". Si en algún momento no
  // quedan huecos disponibles, avisa y corta la cadena (el jugador
  // se queda con el resto de carreteras pendientes para más tarde,
  // ya que el propio tablero puede liberar sitio al construir la
  // primera).
  function startFreeRoadBuildingChain(remaining = 2) {
    if (remaining <= 0) return;
    if (!Board.hasAvailableRoadSpot()) {
      UI.toast('No hay ningún sitio disponible para construir carretera', 'error');
      return;
    }
    UI.showBuildIndicator(`Construcción de Carreteras — coloca ${remaining} carretera${remaining > 1 ? 's' : ''} gratis`);
    Board.setBuildMode('road', (eId) => {
      Board.clearBuildMode();
      UI.hideBuildIndicator();
      socket.emit('game:buildRoadFree', { edgeId: eId });
      // Espera a que llegue el nuevo estado (con la arista ya
      // ocupada) antes de comprobar/ofrecer la siguiente carretera.
      setTimeout(() => startFreeRoadBuildingChain(remaining - 1), 150);
    });
  }

  // ── Ladrón ───────────────────────────────────────────────────
  function activateRobberMode() {
    UI.hideModal('modal-robber');
    Board.setRobberMode((hexId, hex) => {
      Board.clearRobberMode();
      // Verificar si hay jugadores en ese hex para robar
      const victims = getVictimsOnHex(hexId);
      if (victims.length > 0) {
        UI.showStealTarget(victims, (victimId) => {
          socket.emit('game:moveRobber', { hexId, stealFrom: victimId });
        });
      } else {
        socket.emit('game:moveRobber', { hexId });
      }
    });
  }

  function getVictimsOnHex(hexId) {
    if (!gameState) return [];
    const hp = Board.getHexPositions()[hexId];
    if (!hp || !hp.vertexIds) return [];
    const victims = new Set();
    hp.vertexIds.forEach(vId => {
      const v = gameState.vertices[vId];
      if (v && v.owner !== myId) victims.add(v.owner);
    });
    return Array.from(victims).map(id => gameState.players.find(p => p.id === id)).filter(Boolean);
  }

  // ── Cartas de desarrollo ─────────────────────────────────────
  function playDevCard(type, params) {
    socket.emit('game:playDevCard', { cardType: type, params });
  }

  // ── API pública ─────────────────────────────────────────────
  return {
    init,
    get socket() { return socket; },
    get myId() { return myId; },
    get myName() { return myName; },
    set myName(v) { myName = v; },
    get myRoom() { return myRoom; },
    get gameState() { return gameState; },
    get pendingAction() { return pendingAction; },
    set pendingAction(v) { pendingAction = v; },
    renderMainTurnButtons,
    checkInitRollTurn,
    checkSetupTurn,
    activateRobberMode,
    playDevCard,
    startBuildSettlement,
    startBuildCity,
    startBuildRoad,
  };

})();