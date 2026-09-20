// ══════════════════════════════════════════════════════════════
//  ui/ui-panels.js — Paneles de jugadores en pantalla de juego
// ══════════════════════════════════════════════════════════════

(function extendUI() {

    // ── Init pantalla de juego ───────────────────────────────────
    function initGameScreen(gs, myId) {
        const posOrder = ['tl', 'tr', 'bl'];
        posOrder.forEach(pos => document.getElementById(`panel-${pos}`).classList.add('hidden'));

        const myIdx = gs.players.findIndex(p => p.id === myId);
        const orderedOthers = [];
        for (let i = 1; i < gs.players.length; i++) {
            orderedOthers.push(gs.players[(myIdx + i) % gs.players.length]);
        }

        orderedOthers.forEach((p, i) => {
            const pos = posOrder[i];
            const panel = document.getElementById(`panel-${pos}`);
            panel.classList.remove('hidden');
            panel.setAttribute('data-color', p.color);
            panel.setAttribute('data-playerid', p.id);
        });

        const me = gs.players.find(p => p.id === myId);
        const brPanel = document.getElementById('panel-br');
        brPanel.setAttribute('data-color', me.color);
        brPanel.setAttribute('data-playerid', myId);

        // Chat toggle
        _rebindToggle('chat-toggle', 'chat-body', (body) => {
            body.classList.toggle('hidden');
            _adjustSidePanelsLayout();
        });

        // Log toggle
        _rebindToggle('log-toggle', 'log-body', (body) => {
            body.classList.toggle('hidden');
            _adjustSidePanelsLayout();
            if (!body.classList.contains('hidden')) {
                const msgs = document.getElementById('log-messages');
                if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 10);
            }
        });

        // Guía de precios: disponible siempre, sea o no tu turno
        UI.showPriceGuideButton();
    }

    function _rebindToggle(toggleId, bodyId, handler) {
        const toggle = document.getElementById(toggleId);
        const body = document.getElementById(bodyId);
        if (!toggle || !body) return;
        const fresh = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(fresh, toggle);
        fresh.addEventListener('click', () => handler(body));
    }

    // ── Actualizar todos los paneles ─────────────────────────────
    function updateGameUI(gs, myId) {
        if (!gs) return;

        gs.players.forEach(player => {
            if (player.id === myId) {
                _updateMyPanel(player, gs, myId);
            } else {
                _updateOtherPanel(player, gs);
            }
        });

        // Fase de juego → botones de acción
        if (gs.phase === 'initRoll') {
            Game.checkInitRollTurn();
        } else if (gs.phase === 'setup') {
            Game.checkSetupTurn();
        } else if (gs.phase === 'main') {
            const currentPlayer = gs.players[gs.currentPlayerIdx];
            const isMyTurn = currentPlayer.id === myId;
            UI.setTurnIndicator(currentPlayer, isMyTurn, gs.turnPhase);
            if (isMyTurn) {
                Game.renderMainTurnButtons();
            } else {
                UI.clearActionButtons();
            }
        }

        // Marcar panel activo
        const activeId = gs.players[gs.currentPlayerIdx].id;
        document.querySelectorAll('.player-panel').forEach(panel => {
            panel.classList.toggle('active-turn', panel.getAttribute('data-playerid') === activeId);
        });

        UI.updateLog(gs.log);
        UI.updatePriceGuideAvailability(gs, myId);
        _adjustSidePanelsLayout();
    }

    // ── Ajuste dinámico de altura de los paneles laterales ───────
    // Hace que la columna izquierda (log + chat apilados) y la
    // columna derecha (guía de precios) ocupen todo el hueco
    // vertical disponible entre las tarjetas de jugador vecinas,
    // dejando siempre el mismo margen. Si una tarjeta vecina está
    // oculta, aprovecha ese espacio también.
    const SIDE_PANEL_MARGIN = 12; // px de separación con las tarjetas vecinas

    function _visibleRect(el) {
        if (!el || el.classList.contains('hidden') || el.offsetParent === null) return null;
        const r = el.getBoundingClientRect();
        if (r.height === 0) return null;
        return r;
    }

    function _positionBetween(panel, topNeighborId, bottomNeighborId, isCollapsed) {
        if (!panel) return;
        const viewportH = window.innerHeight;
        if (isCollapsed) {
            panel.style.top = '50%';
            panel.style.bottom = 'auto';
            panel.style.transform = 'translateY(-50%)';
            return;
        }
        const topNeighbor = _visibleRect(document.getElementById(topNeighborId));
        const bottomNeighbor = _visibleRect(document.getElementById(bottomNeighborId));
        const top = topNeighbor ? topNeighbor.bottom + SIDE_PANEL_MARGIN : SIDE_PANEL_MARGIN;
        const bottom = bottomNeighbor ? (viewportH - bottomNeighbor.top) + SIDE_PANEL_MARGIN : SIDE_PANEL_MARGIN;
        panel.style.top = `${top}px`;
        panel.style.bottom = `${bottom}px`;
        panel.style.transform = 'none';
    }

    function _adjustSidePanelsLayout() {
        // Columna izquierda: log + chat apilados, entre panel-tl y panel-bl.
        // Solo se considera "colapsada" (centrada) si AMBOS están cerrados;
        // si al menos uno está abierto, la columna se estira igualmente.
        const leftStack = document.getElementById('left-side-stack');
        const chatPanel = document.getElementById('chat-panel');
        const logPanel = document.getElementById('log-panel');
        const chatBody = document.getElementById('chat-body');
        const logBody = document.getElementById('log-body');
        const chatOpen = chatBody && !chatBody.classList.contains('hidden');
        const logOpen = logBody && !logBody.classList.contains('hidden');
        const bothCollapsed = !chatOpen && !logOpen;
        _positionBetween(leftStack, 'panel-tl', 'panel-bl', bothCollapsed);

        // Si solo uno de los dos está abierto, el otro queda reducido a su
        // botón (sin flex-grow), para que el abierto ocupe todo el resto.
        // Si los dos están abiertos, ambos reparten el espacio a partes
        // iguales (flex:1 en ambos, definido por CSS de base).
        if (chatPanel) chatPanel.classList.toggle('collapsed', !chatOpen && logOpen);
        if (logPanel) logPanel.classList.toggle('collapsed', !logOpen && chatOpen);

        // El botón se integra visualmente con su panel (esquinas rectas
        // arriba, sin borde inferior) cuando ese panel está abierto.
        document.getElementById('chat-toggle')?.classList.toggle('is-open', chatOpen);
        document.getElementById('log-toggle')?.classList.toggle('is-open', logOpen);

        // Columna derecha: guía de precios. No se estira a toda la
        // columna como chat/log, porque su contenido es fijo y corto;
        // se mantiene centrada verticalmente con su altura natural.
        const pricePanel = document.getElementById('price-guide-panel');
        if (pricePanel) {
            pricePanel.style.top = '50%';
            pricePanel.style.bottom = 'auto';
            pricePanel.style.transform = 'translateY(-50%)';
        }
    }

    // Reajustar también al cambiar el tamaño de la ventana
    window.addEventListener('resize', () => _adjustSidePanelsLayout());

    // ── Panel propio (BR) ────────────────────────────────────────
    function _updateMyPanel(player, gs, myId) {
        const pos = 'br';
        document.getElementById(`score-${pos}`).textContent = player.points;
        _setPanelName(pos, player.name);

        document.getElementById(`stats-${pos}`).innerHTML = _buildStatsHTML(player, gs);

        const res = document.getElementById(`resources-${pos}`);
        const RES_ICONS = UI._resIcons();
        const RES_LABELS = UI._resLabels();
        const total = Object.values(player.resources).reduce((a, b) => a + b, 0);
        _renderResourceTotal(pos, total);
        res.innerHTML = Object.entries(player.resources).map(([r, v]) => `
      <div class="res-card ${r}">
        <span class="res-icon">${RES_ICONS[r]}</span>
        <span class="res-count">${v}</span>
        <span class="res-label">${RES_LABELS[r]}</span>
      </div>
    `).join('');
        res.style.display = '';
        const resDivider = res.previousElementSibling;
        if (resDivider?.classList.contains('panel-divider')) resDivider.style.display = '';

        const DEV_CARDS = UI._devCards();
        const devEl = document.getElementById(`devcards-${pos}`);
        devEl.innerHTML = player.devCards.map((card, i) => {
            const dc = DEV_CARDS[card.type] || {};
            const isVP = card.type === 'victory_point';
            const playable = !isVP && !card.played && !card.boughtThisTurn && gs.phase === 'main' && gs.turnPhase === 'postRoll';
            const knightOk = !isVP && !card.played && !card.boughtThisTurn && gs.phase === 'main' && card.type === 'knight' && gs.turnPhase === 'preRoll';
            const isPlayable = playable || knightOk;
            return `
        <div class="dev-card-mini ${card.played ? 'played' : ''} ${isVP ? 'is-vp' : ''} ${!isPlayable && !card.played && !isVP ? 'no-playable' : ''}"
             title="${dc.name}: ${dc.desc}"
             data-cardidx="${i}" data-cardtype="${card.type}" data-playable="${isPlayable}" data-boughtthisturn="${!!card.boughtThisTurn}">
          <span class="card-icon">${dc.icon || '📜'}</span>
          <span class="card-name">${dc.name || card.type}</span>
        </div>
      `;
        }).join('');

        const hasDevCards = player.devCards.length > 0;
        devEl.style.display = hasDevCards ? '' : 'none';
        const devDivider = devEl.previousElementSibling;
        if (devDivider?.classList.contains('panel-divider')) devDivider.style.display = hasDevCards ? '' : 'none';

        devEl.querySelectorAll('.dev-card-mini:not(.played):not(.is-vp)').forEach(el => {
            el.addEventListener('click', () => {
                UI.showDevCardUseModal(el.dataset.cardtype, el.dataset.playable === 'true', gs, myId, el.dataset.boughtthisturn === 'true');
            });
        });
    }

    // ── Panel rival ──────────────────────────────────────────────
    function _updateOtherPanel(player, gs) {
        const panel = document.querySelector(`.player-panel[data-playerid="${player.id}"]`);
        if (!panel) return;
        const pos = panel.id.replace('panel-', '');

        const scoreEl = document.getElementById(`score-${pos}`);
        if (scoreEl) {
            const hasHiddenCards = player.devCards.some(c => !c.played);
            scoreEl.innerHTML = hasHiddenCards
                ? `${player.points} <span class="score-hidden-hint" title="Tiene cartas de desarrollo sin jugar; puede tener más puntos ocultos">(+ ?)</span>`
                : `${player.points}`;
        }
        _setPanelName(pos, player.name);

        const statsEl = document.getElementById(`stats-${pos}`);
        if (statsEl) statsEl.innerHTML = _buildStatsHTML(player, gs);

        // Recursos con "?"
        let resEl = panel.querySelector('.panel-resources-other');
        if (!resEl) {
            resEl = document.createElement('div');
            resEl.className = 'panel-resources panel-resources-other';
            panel.appendChild(Object.assign(document.createElement('div'), { className: 'panel-divider' }));
            panel.appendChild(resEl);
        }
        const RES_ICONS = UI._resIcons();
        const RES_LABELS = UI._resLabels();
        const totalOther = Object.values(player.resources).reduce((a, b) => a + b, 0);
        _renderResourceTotal(pos, totalOther);
        resEl.innerHTML = Object.keys(RES_ICONS).map(r => `
      <div class="res-card ${r}">
        <span class="res-icon">${RES_ICONS[r]}</span>
        <span class="res-count res-hidden">?</span>
        <span class="res-label">${RES_LABELS[r]}</span>
      </div>
    `).join('');

        // Cartas boca abajo
        const devCount = player.devCards.filter(c => !c.played).length;
        let devEl = panel.querySelector('.panel-devcards-other');
        let devDividerOther;
        if (!devEl) {
            devDividerOther = document.createElement('div');
            devDividerOther.className = 'panel-divider';
            devEl = document.createElement('div');
            devEl.className = 'panel-devcards panel-devcards-other';
            panel.appendChild(devDividerOther);
            panel.appendChild(devEl);
        } else {
            devDividerOther = devEl.previousElementSibling;
        }
        devEl.innerHTML = devCount > 0
            ? Array.from({ length: devCount }).map(() =>
                `<div class="dev-card-back-lg" title="Carta de desarrollo (oculta)"><span class="dev-card-back-q">?</span></div>`
            ).join('')
            : '';
        devEl.style.display = devCount > 0 ? '' : 'none';
        if (devDividerOther?.classList.contains('panel-divider')) {
            devDividerOther.style.display = devCount > 0 ? '' : 'none';
        }
    }

    // ── Helpers ──────────────────────────────────────────────────
    function _buildStatsHTML(player, gs) {
        // El dorado en "Vías" y "Caballeros" debe coincidir exactamente
        // con quién recibe el punto real (hasLongestRoad/hasLargestArmy,
        // calculado por el servidor respetando el mínimo de 5 rutas / 3
        // caballeros y los empates), no con quien simplemente tiene más.
        const isRoadLeader = !!player.hasLongestRoad;
        const isKnightLeader = !!player.hasLargestArmy;

        return `
      <div class="stat-item"><span class="stat-icon">🏰</span><span class="stat-val">${player.cities.length}</span><span class="stat-label">Ciudades</span></div>
      <div class="stat-item"><span class="stat-icon">🏠</span><span class="stat-val">${player.settlements.length}</span><span class="stat-label">Pueblos</span></div>
      <div class="stat-item ${isRoadLeader ? 'stat-leader' : ''}"><span class="stat-icon">🛤️</span><span class="stat-val">${player.roads.length}</span><span class="stat-label">Vías</span></div>
      <div class="stat-item ${isKnightLeader ? 'stat-leader' : ''}"><span class="stat-icon">⚔️</span><span class="stat-val">${player.knightsPlayed}</span><span class="stat-label">Caballeros</span></div>
    `;
    }

    function _setPanelName(pos, name) {
        const panel = document.getElementById(`panel-${pos}`);
        if (!panel) return;
        let el = panel.querySelector('.panel-name');
        if (!el) {
            el = document.createElement('div');
            el.className = 'panel-name';
            panel.insertBefore(el, panel.firstChild);
        }
        el.textContent = name;
    }

    // Muestra el total de cartas de recurso de un jugador justo
    // encima de su cuadrícula de recursos. El total en sí es
    // información pública (se puede contar mirando sus cartas
    // físicas en la mesa), aunque los tipos concretos no lo sean.
    const DISCARD_LIMIT = window.CONFIG?.game?.discardThreshold ?? 7;

    function _renderResourceTotal(pos, total) {
        const resContainer = document.getElementById(`resources-${pos}`)
            || document.querySelector(`#panel-${pos} .panel-resources-other`);
        if (!resContainer) return;
        let totalEl = resContainer.previousElementSibling;
        if (!totalEl || !totalEl.classList.contains('panel-res-total')) {
            totalEl = document.createElement('div');
            totalEl.className = 'panel-res-total';
            resContainer.parentNode.insertBefore(totalEl, resContainer);
        }
        totalEl.innerHTML = `<span class="res-total-icon">🎴</span> ${total}`;
        totalEl.classList.toggle('over-limit', total > DISCARD_LIMIT);
    }

    // ── Bocadillos de recursos ────────────────────────────────────
    function showResourceBubbles(gained, producers, onClaim) {
        document.querySelectorAll('.res-bubble').forEach(b => b.remove());
        const entries = Object.entries(gained).filter(([, v]) => v > 0);
        if (!entries.length) return;

        const canvas = document.getElementById('board-canvas');
        const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
        const RES_ICONS = UI._resIcons();
        const RES_LABELS = UI._resLabels();

        function makeBubble(res, count, hexId) {
            const pos = (hexId != null && canvasRect) ? Board.getHexCanvasPos(hexId) : null;
            const bubble = document.createElement('div');
            bubble.className = 'res-bubble';
            bubble.innerHTML = `
        <div class="res-bubble-pill">
          <span class="res-bubble-icon">${RES_ICONS[res] || '?'}</span>
          <div class="res-bubble-info">
            <span class="res-bubble-count">+${count}</span>
            <span class="res-bubble-name">${RES_LABELS[res] || res}</span>
          </div>
          <span class="res-bubble-dot"></span>
        </div>
        <div class="res-bubble-tail"></div>`;

            if (pos && canvasRect) {
                const sx = canvasRect.left + pos.x;
                const sy = canvasRect.top + pos.y - pos.R * 0.6;
                bubble.style.cssText = `position:fixed;left:${Math.round(sx)}px;top:${Math.round(sy)}px;transform:translate(-50%,-100%);z-index:500;pointer-events:all;`;
            } else {
                bubble.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:500;pointer-events:all;';
            }

            bubble.addEventListener('click', () => {
                bubble.classList.add('collecting');
                setTimeout(() => bubble.remove(), 240);
                if (onClaim) onClaim(res, count);
            });
            return bubble;
        }

        entries.forEach(([res, count]) => {
            const hexIds = (producers && producers[res]) ? producers[res] : [undefined];
            hexIds.forEach(hexId => document.body.appendChild(makeBubble(res, count, hexId)));
        });
    }

    function clearResourceBubbles() {
        document.querySelectorAll('.res-bubble').forEach(b => b.remove());
    }

    // ── Extender el objeto UI público ───────────────────────────
    Object.assign(UI, {
        initGameScreen,
        updateGameUI,
        showResourceBubbles,
        clearResourceBubbles,
        adjustSidePanelsLayout: _adjustSidePanelsLayout,
    });

})();