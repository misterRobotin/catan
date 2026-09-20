// ══════════════════════════════════════════════════════════════
//  ui/ui-modals.js — Todos los modales de juego
// ══════════════════════════════════════════════════════════════

(function extendUI() {

  // ── Helpers internos ─────────────────────────────────────────
  function _RES() { return Object.keys(UI._resIcons()); }

  function _buildResSelector(containerId, maxResources) {
    const el = document.getElementById(containerId);
    const RES_ICONS = UI._resIcons();
    const RES_LABELS = UI._resLabels();
    el.innerHTML = _RES().map(r => {
      const max = maxResources ? (maxResources[r] || 0) : 10;
      return `
        <div class="res-selector-item">
          <span class="res-icon-big">${RES_ICONS[r]}</span>
          <input type="number" min="0" max="${max}" value="0" data-res="${r}">
          <label>${RES_LABELS[r]}</label>
        </div>
      `;
    }).join('');
  }

  function _readResSelector(containerId) {
    const result = {};
    document.getElementById(containerId).querySelectorAll('input').forEach(inp => {
      result[inp.dataset.res] = parseInt(inp.value) || 0;
    });
    return result;
  }

  // ── Selector de recursos tipo stepper (solo negociación) ─────
  function _buildResStepper(containerId, maxResources) {
    const el = document.getElementById(containerId);
    const RES_ICONS = UI._resIcons();
    const RES_LABELS = UI._resLabels();
    el.innerHTML = _RES().map(r => {
      const max = maxResources ? (maxResources[r] || 0) : 99;
      return `
        <div class="res-stepper ${r} zero" data-res="${r}" data-value="0" data-max="${max}" title="${RES_LABELS[r]}">
          <span class="res-icon">${RES_ICONS[r]}</span>
          <div class="res-stepper-controls">
            <button type="button" class="res-stepper-btn minus" disabled>−</button>
            <span class="res-stepper-value">0</span>
            <button type="button" class="res-stepper-btn plus" ${max <= 0 ? 'disabled' : ''}>+</button>
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.res-stepper').forEach(stepper => {
      const max = parseInt(stepper.dataset.max) || 0;
      const valueEl = stepper.querySelector('.res-stepper-value');
      const minusBtn = stepper.querySelector('.minus');
      const plusBtn = stepper.querySelector('.plus');

      function render() {
        const v = parseInt(stepper.dataset.value) || 0;
        valueEl.textContent = v;
        minusBtn.disabled = v <= 0;
        plusBtn.disabled = v >= max;
        stepper.classList.toggle('zero', v === 0);
      }

      minusBtn.addEventListener('click', () => {
        stepper.dataset.value = Math.max(0, (parseInt(stepper.dataset.value) || 0) - 1);
        render();
      });
      plusBtn.addEventListener('click', () => {
        stepper.dataset.value = Math.min(max, (parseInt(stepper.dataset.value) || 0) + 1);
        render();
      });
    });
  }

  function _readResStepper(containerId) {
    const result = {};
    document.getElementById(containerId).querySelectorAll('.res-stepper').forEach(stepper => {
      result[stepper.dataset.res] = parseInt(stepper.dataset.value) || 0;
    });
    return result;
  }

  // ── Ladrón ───────────────────────────────────────────────────
  function showRobberModal() {
    document.getElementById('modal-robber-cancel').onclick = () => {
      UI.hideModal('modal-robber');
      Game.activateRobberMode();
    };
    Game.activateRobberMode();
    UI.hideModal('modal-robber');
  }

  function showStealTarget(victims, callback) {
    let modal = document.getElementById('modal-steal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-steal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box">
          <h2 class="modal-title">¿A quién robas?</h2>
          <p class="modal-sub">Elige un jugador en el hexágono</p>
          <div id="steal-targets" class="resource-choice"></div>
          <button class="btn-secondary" id="steal-cancel">Sin robar</button>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const COLOR_MAP = UI._colorMap();
    const targetsEl = document.getElementById('steal-targets');
    targetsEl.innerHTML = victims.map(v => `
      <button class="btn-res-choice steal-target-filled" style="background:${COLOR_MAP[v.color]};border-color:${COLOR_MAP[v.color]}" data-id="${v.id}">
        <span style="font-size:clamp(22px,2.8vw,28px)">${v.name[0]}</span>
        <span>${v.name}</span>
      </button>
    `).join('');

    targetsEl.querySelectorAll('[data-id]').forEach(btn => {
      btn.addEventListener('click', () => { modal.remove(); callback(btn.dataset.id); });
    });
    document.getElementById('steal-cancel').onclick = () => { modal.remove(); callback(null); };
    modal.classList.remove('hidden');
  }

  // ── Descartar ────────────────────────────────────────────────
  function showDiscardModal(amount) {
    document.getElementById('discard-instructions').textContent = `El ladrón ataca — debes descartar ${amount} cartas de recurso`;
    const container = document.getElementById('discard-resources');
    const counterEl = document.getElementById('discard-counter');
    const confirmBtn = document.getElementById('btn-confirm-discard');
    const RES_ICONS = UI._resIcons();
    const me = Game.gameState?.players.find(p => p.id === Game.myId);
    const myResources = me?.resources || {};

    function currentTotal() {
      let t = 0;
      container.querySelectorAll('.res-stepper').forEach(s => { t += parseInt(s.dataset.value) || 0; });
      return t;
    }

    function renderAll() {
      const total = currentTotal();
      counterEl.textContent = `${total} / ${amount} seleccionadas`;
      counterEl.classList.toggle('complete', total === amount);
      confirmBtn.disabled = total !== amount;
      confirmBtn.style.opacity = total === amount ? '' : '0.4';

      container.querySelectorAll('.res-stepper').forEach(stepper => {
        const have = parseInt(stepper.dataset.have) || 0;
        const v = parseInt(stepper.dataset.value) || 0;
        const plusBtn = stepper.querySelector('.plus');
        const minusBtn = stepper.querySelector('.minus');
        // No se puede subir más si ya se llegó al total exigido,
        // o si ya no quedan unidades de ese recurso.
        plusBtn.disabled = v >= have || total >= amount;
        minusBtn.disabled = v <= 0;
        stepper.classList.toggle('zero', v === 0);
      });
    }

    container.innerHTML = _RES().map(r => {
      const have = myResources[r] || 0;
      return `
        <div class="res-stepper ${r} zero" data-res="${r}" data-value="0" data-have="${have}" title="Tienes ${have}">
          <span class="res-icon">${RES_ICONS[r]}</span>
          <div class="res-stepper-controls">
            <button type="button" class="res-stepper-btn minus" disabled>−</button>
            <span class="res-stepper-value">0</span>
            <button type="button" class="res-stepper-btn plus" ${have <= 0 ? 'disabled' : ''}>+</button>
          </div>
          <span class="res-stepper-ratio">tienes ${have}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.res-stepper').forEach(stepper => {
      const minusBtn = stepper.querySelector('.minus');
      const plusBtn = stepper.querySelector('.plus');
      minusBtn.addEventListener('click', () => {
        stepper.dataset.value = Math.max(0, (parseInt(stepper.dataset.value) || 0) - 1);
        stepper.querySelector('.res-stepper-value').textContent = stepper.dataset.value;
        renderAll();
      });
      plusBtn.addEventListener('click', () => {
        const have = parseInt(stepper.dataset.have) || 0;
        const total = currentTotal();
        if (total >= amount) return;
        const v = parseInt(stepper.dataset.value) || 0;
        if (v >= have) return;
        stepper.dataset.value = v + 1;
        stepper.querySelector('.res-stepper-value').textContent = stepper.dataset.value;
        renderAll();
      });
    });

    renderAll();
    UI.showModal('modal-discard');

    document.getElementById('btn-confirm-discard').onclick = () => {
      if (currentTotal() !== amount) { UI.toast(`Debes descartar exactamente ${amount} cartas`, 'error'); return; }
      const discarding = {};
      container.querySelectorAll('.res-stepper').forEach(s => {
        discarding[s.dataset.res] = parseInt(s.dataset.value) || 0;
      });
      UI.hideModal('modal-discard');
      Game.socket.emit('game:discard', { resources: discarding });
    };
  }

  // ── Comercio ─────────────────────────────────────────────────
  function showTradeModal(gs, myId) {
    const me = gs.players.find(p => p.id === myId);
    const others = gs.players.filter(p => p.id !== myId);
    let tradeType = 'player';
    let selectedTargets = new Set(); // vacío = Todos
    let bankGiveRes = null, bankReceiveRes = null;
    const COLOR_MAP = UI._colorMap();

    const targetsEl = document.getElementById('trade-target-players');
    const chipsHtml = [
      `<div class="trade-target-chip all selected" data-id="">Todos</div>`,
      ...others.map(p => `<div class="trade-target-chip" data-id="${p.id}" data-color="${COLOR_MAP[p.color]}">${p.name}</div>`),
    ];
    targetsEl.innerHTML = chipsHtml.join('');

    function _renderTargetChips() {
      targetsEl.querySelectorAll('.trade-target-chip').forEach(chip => {
        const id = chip.dataset.id;
        if (id === '') {
          const isAll = selectedTargets.size === 0;
          chip.classList.toggle('selected', isAll);
        } else {
          const isSelected = selectedTargets.has(id);
          chip.classList.toggle('selected', isSelected);
          chip.style.background = isSelected ? chip.dataset.color : '';
          chip.style.borderColor = chip.dataset.color;
        }
      });
    }
    _renderTargetChips();

    targetsEl.querySelectorAll('.trade-target-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.id;
        if (id === '') {
          selectedTargets.clear();
        } else {
          if (selectedTargets.has(id)) selectedTargets.delete(id);
          else selectedTargets.add(id);
        }
        _renderTargetChips();
      });
    });

    _buildResStepper('trade-request', null);
    _buildResStepper('trade-offer', me.resources);

    // ── Comercio con el banco: un icono a dar (bloque completo
    // según ratio) y un icono a recibir (1 unidad), nunca varios
    // recursos mezclados en la misma oferta.
    function _renderBankChoices() {
      const RES_ICONS = UI._resIcons();
      const RES_LABELS = UI._resLabels();
      const ratios = me.bankRatios || {};

      const giveEl = document.getElementById('trade-bank-give');
      giveEl.innerHTML = _RES().map(r => {
        const ratio = ratios[r] || 4;
        const have = me.resources[r] || 0;
        const canGive = have >= ratio;
        return `
          <button type="button" class="bank-choice-item ${r} ${canGive ? '' : 'disabled'} ${bankGiveRes === r ? 'selected' : ''}"
                  data-res="${r}" ${canGive ? '' : 'disabled'} title="${RES_LABELS[r]} — tienes ${have}">
            <span class="res-icon">${RES_ICONS[r]}</span>
            <span class="bank-choice-ratio">${ratio}:1</span>
          </button>
        `;
      }).join('');

      const receiveEl = document.getElementById('trade-bank-receive');
      receiveEl.innerHTML = _RES().map(r => `
        <button type="button" class="bank-choice-item ${r} ${bankReceiveRes === r ? 'selected' : ''}" data-res="${r}" title="${RES_LABELS[r]}">
          <span class="res-icon">${RES_ICONS[r]}</span>
          <span class="bank-choice-ratio">×1</span>
        </button>
      `).join('');

      giveEl.querySelectorAll('.bank-choice-item:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
          bankGiveRes = bankGiveRes === btn.dataset.res ? null : btn.dataset.res;
          _renderBankChoices();
        });
      });
      receiveEl.querySelectorAll('.bank-choice-item').forEach(btn => {
        btn.addEventListener('click', () => {
          bankReceiveRes = bankReceiveRes === btn.dataset.res ? null : btn.dataset.res;
          _renderBankChoices();
        });
      });
    }

    document.getElementById('trade-type-player').classList.add('active');
    document.getElementById('trade-type-bank').classList.remove('active');
    document.getElementById('trade-player-section').style.display = '';
    document.getElementById('trade-player-columns').classList.remove('hidden');
    document.getElementById('trade-bank-columns').classList.add('hidden');

    document.getElementById('trade-type-player').onclick = () => {
      tradeType = 'player';
      document.getElementById('trade-type-player').classList.add('active');
      document.getElementById('trade-type-bank').classList.remove('active');
      document.getElementById('trade-player-section').style.display = '';
      document.getElementById('trade-player-columns').classList.remove('hidden');
      document.getElementById('trade-bank-columns').classList.add('hidden');
    };
    document.getElementById('trade-type-bank').onclick = () => {
      tradeType = 'bank';
      bankGiveRes = null;
      bankReceiveRes = null;
      document.getElementById('trade-type-bank').classList.add('active');
      document.getElementById('trade-type-player').classList.remove('active');
      document.getElementById('trade-player-section').style.display = 'none';
      document.getElementById('trade-player-columns').classList.add('hidden');
      document.getElementById('trade-bank-columns').classList.remove('hidden');
      _renderBankChoices();
    };

    document.getElementById('btn-cancel-trade').onclick = () => UI.hideModal('modal-trade');

    document.getElementById('btn-send-trade').onclick = () => {
      if (tradeType === 'bank') {
        if (!bankGiveRes) { UI.toast('Elige qué le das al banco', 'error'); return; }
        if (!bankReceiveRes) { UI.toast('Elige qué quieres recibir', 'error'); return; }
        if (bankGiveRes === bankReceiveRes) { UI.toast('Elige dos recursos distintos', 'error'); return; }
        const ratio = (me.bankRatios && me.bankRatios[bankGiveRes]) || 4;
        Game.socket.emit('game:tradeBank', {
          offer: { resource: bankGiveRes, amount: ratio },
          request: { resource: bankReceiveRes, amount: 1 },
        });
      } else {
        const offer = _readResStepper('trade-offer');
        const request = _readResStepper('trade-request');
        const offerEmpty = Object.values(offer).every(v => v === 0);
        const requestEmpty = Object.values(request).every(v => v === 0);
        if (offerEmpty && requestEmpty) { UI.toast('Debes ofrecer o pedir algo', 'error'); return; }
        Game.socket.emit('game:tradeOffer', { offer, request, targetIds: Array.from(selectedTargets) });
      }
      UI.hideModal('modal-trade');
    };

    UI.showModal('modal-trade');
  }

  function showTradeReceived(offer, senderName, gs, myId) {
    document.getElementById('trade-received-desc').textContent = `${senderName} te propone este intercambio:`;
    const RES_ICONS = UI._resIcons();
    const me = gs?.players.find(p => p.id === myId);
    const myResources = me?.resources || {};

    function buildCards(resObj, checkAfford) {
      const entries = Object.entries(resObj).filter(([, v]) => v > 0);
      if (!entries.length) return '<span class="trade-received-empty">Nada</span>';
      return entries.map(([r, v]) => {
        const insufficient = checkAfford && (myResources[r] || 0) < v;
        return `
          <div class="trade-received-card ${r} ${insufficient ? 'insufficient' : ''}">
            <span class="res-icon">${RES_ICONS[r]}</span>
            <span class="res-count">${v}</span>
          </div>
        `;
      }).join('');
    }

    // "Recibes" = lo que el ofertante da (offer.offer); "Das" = lo que te pide (offer.request)
    const canAfford = Object.entries(offer.request).every(([r, v]) => (myResources[r] || 0) >= v);

    document.getElementById('trade-received-detail').innerHTML = `
      <div class="trade-received-side">
        <span class="trade-received-label">Recibes</span>
        <div class="trade-received-cards">${buildCards(offer.offer, false)}</div>
      </div>
      <span class="trade-arrow">⇄</span>
      <div class="trade-received-side">
        <span class="trade-received-label">Entregas</span>
        <div class="trade-received-cards">${buildCards(offer.request, true)}</div>
      </div>
    `;

    const warningEl = document.getElementById('trade-received-warning');
    const acceptBtn = document.getElementById('btn-accept-trade');
    warningEl.classList.toggle('hidden', canAfford);
    acceptBtn.disabled = !canAfford;
    acceptBtn.style.opacity = canAfford ? '' : '0.4';
    acceptBtn.style.cursor = canAfford ? '' : 'not-allowed';

    acceptBtn.onclick = () => {
      if (!canAfford) return;
      UI.hideModal('modal-trade-received');
      Game.socket.emit('game:tradeAccept');
    };
    document.getElementById('btn-reject-trade').onclick = () => { UI.hideModal('modal-trade-received'); Game.socket.emit('game:tradeReject'); };
    UI.showModal('modal-trade-received');
  }

  // ── Cartas de desarrollo ─────────────────────────────────────
  function showDevCardModal(gs, myId) {
    const me = gs.players.find(p => p.id === myId);
    const el = document.getElementById('devcard-list');
    const DEV_CARDS = UI._devCards();

    el.innerHTML = me.devCards.map((card, i) => {
      const dc = DEV_CARDS[card.type] || {};
      const isVP = card.type === 'victory_point';
      const disabled = isVP || card.played || card.boughtThisTurn ||
        (card.type !== 'knight' && gs.turnPhase === 'preRoll');
      return `
        <div class="devcard-item ${disabled ? 'disabled' : ''}" data-idx="${i}" data-type="${card.type}">
          <span class="card-icon">${dc.icon || '📜'}</span>
          <span class="card-name">${dc.name}</span>
          <span class="card-desc">${dc.desc}</span>
          ${isVP ? '<span style="color:var(--gold);font-size:clamp(9px,1.1vw,11px)">Conseguida — suma 1 punto</span>' : ''}
          ${!isVP && card.played ? '<span style="color:#888;font-size:clamp(9px,1.1vw,11px)">Jugada</span>' : ''}
          ${!isVP && card.boughtThisTurn ? '<span style="color:#888;font-size:clamp(9px,1.1vw,11px)">Comprada este turno</span>' : ''}
        </div>
      `;
    }).join('') || '<p style="color:var(--text-muted);text-align:center;padding:clamp(14px,2vh,20px)">No tienes cartas de desarrollo</p>';

    el.querySelectorAll('.devcard-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        UI.hideModal('modal-devcard');
        _handleDevCardPlay(item.dataset.type, gs, myId);
      });
    });
    UI.showModal('modal-devcard');
    document.getElementById('btn-close-devcard').onclick = () => UI.hideModal('modal-devcard');
  }

  function showDevCardUseModal(type, isPlayable, gs, myId, boughtThisTurn) {
    const DEV_CARDS = UI._devCards();
    const dc = DEV_CARDS[type] || {};
    document.getElementById('devcard-use-icon').textContent = dc.icon || '📜';
    document.getElementById('devcard-use-name').textContent = dc.name || type;
    document.getElementById('devcard-use-desc').textContent = dc.desc || '';

    const warningEl = document.getElementById('devcard-use-warning');
    warningEl.classList.toggle('hidden', !boughtThisTurn);
    warningEl.textContent = boughtThisTurn
      ? '⚠️ No puedes usar una carta el mismo turno en que la compraste'
      : '';

    const confirmBtn = document.getElementById('btn-devcard-use-confirm');
    confirmBtn.disabled = !isPlayable;
    confirmBtn.style.opacity = isPlayable ? '' : '0.4';
    document.getElementById('btn-devcard-use-cancel').onclick = () => UI.hideModal('modal-devcard-use');
    confirmBtn.onclick = () => {
      if (!isPlayable) return;
      UI.hideModal('modal-devcard-use');
      _handleDevCardPlay(type, gs, myId);
    };
    UI.showModal('modal-devcard-use');
  }

  function _handleDevCardPlay(type, gs, myId) {
    switch (type) {
      case 'knight':
        Game.socket.emit('game:playDevCard', { cardType: 'knight' });
        Game.activateRobberMode();
        break;
      case 'road_building':
        if (!Board.hasAvailableRoadSpot()) {
          UI.toast('No hay ningún sitio disponible para construir carretera', 'error');
          return;
        }
        Game.socket.emit('game:playDevCard', { cardType: 'road_building' });
        break;
      case 'year_of_plenty':
        _showYOPModal(resources => Game.socket.emit('game:playDevCard', { cardType: 'year_of_plenty', params: { resources } }));
        break;
      case 'monopoly':
        _showMonopolyModal(resource => Game.socket.emit('game:playDevCard', { cardType: 'monopoly', params: { resource } }));
        break;
      case 'victory_point':
        UI.toast('Punto de victoria revelado!', 'success');
        Game.socket.emit('game:playDevCard', { cardType: 'victory_point' });
        break;
    }
  }

  function _showMonopolyModal(callback) {
    const el = document.getElementById('monopoly-options');
    const RES_ICONS = UI._resIcons();
    const RES_LABELS = UI._resLabels();
    el.innerHTML = _RES().map(r => `
      <button class="btn-res-choice" style="background:var(--c-${r},#555)" data-res="${r}">
        <span class="res-icon-big">${RES_ICONS[r]}</span>
        <span>${RES_LABELS[r]}</span>
      </button>
    `).join('');
    el.querySelectorAll('[data-res]').forEach(btn => {
      btn.addEventListener('click', () => { UI.hideModal('modal-monopoly'); callback(btn.dataset.res); });
    });
    UI.showModal('modal-monopoly');
  }

  function _showYOPModal(callback) {
    const el = document.getElementById('yop-options');
    const RES_ICONS = UI._resIcons();
    const RES_LABELS = UI._resLabels();
    el.innerHTML = _RES().map(r => `
      <div class="res-selector-item">
        <span class="res-icon-big">${RES_ICONS[r]}</span>
        <input type="number" min="0" max="2" value="0" data-res="${r}">
        <label>${RES_LABELS[r]}</label>
      </div>
    `).join('');
    UI.showModal('modal-yop');
    document.getElementById('btn-confirm-yop').onclick = () => {
      const resources = [];
      let total = 0;
      el.querySelectorAll('input').forEach(inp => {
        const v = parseInt(inp.value) || 0;
        for (let i = 0; i < v; i++) resources.push(inp.dataset.res);
        total += v;
      });
      if (total !== 2) { UI.toast('Debes elegir exactamente 2 recursos', 'error'); return; }
      UI.hideModal('modal-yop');
      callback(resources);
    };
  }

  // ── Canjear (construir / comprar) ────────────────────────────
  function showExchangeModal(gs, myId) {
    const me = gs.players.find(p => p.id === myId);
    const res = me.resources;
    const COSTS = window.CONFIG?.costs || {
      road: { lumber: 1, brick: 1 },
      settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
      city: { grain: 2, ore: 3 },
      devcard: { wool: 1, grain: 1, ore: 1 },
    };
    const RES_ICONS = UI._resIcons();
    const canAfford = cost => Object.entries(cost).every(([r, v]) => (res[r] || 0) >= v);
    const costChips = cost => Object.entries(cost).map(([r, v]) => {
      const missing = (res[r] || 0) < v;
      return `<span class="exchange-cost-chip ${missing ? 'missing' : ''}"><span class="chip-icon">${RES_ICONS[r]}</span><span class="chip-qty">${v}</span></span>`;
    }).join('');

    const ITEMS = [
      { icon: '🛤️', label: 'Carretera', cost: COSTS.road, action: 'road' },
      { icon: '🏠', label: 'Poblado', cost: COSTS.settlement, action: 'settlement' },
      { icon: '🏰', label: 'Ciudad', cost: COSTS.city, action: 'city' },
      { icon: '🃏', label: 'Carta Dev.', cost: COSTS.devcard, action: 'devcard' },
    ];

    const grid = document.getElementById('exchange-grid');
    grid.innerHTML = ITEMS.map(({ icon, label, cost, action }) => {
      const afford = canAfford(cost);
      return `
        <div class="exchange-item ${afford ? 'affordable' : ''}">
          <span class="exchange-item-icon">${icon}</span>
          <span class="exchange-item-name">${label}</span>
          <div class="exchange-cost">${costChips(cost)}</div>
          <button class="btn-exchange ${afford ? 'can-afford' : 'cannot-afford'}"
                  ${afford ? '' : 'disabled'} data-action="${action}">
            Obtener
          </button>
        </div>`;
    }).join('');

    grid.querySelectorAll('.btn-exchange.can-afford').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.hideModal('modal-exchange');
        switch (btn.dataset.action) {
          case 'road': Game.startBuildRoad(); break;
          case 'settlement': Game.startBuildSettlement(); break;
          case 'city': Game.startBuildCity(); break;
          case 'devcard': Game.socket.emit('game:buyDevCard'); break;
        }
      });
    });
    document.getElementById('btn-close-exchange').onclick = () => UI.hideModal('modal-exchange');
    UI.showModal('modal-exchange');
  }


  // ── Guía de precios (el botón sube y revela la grid debajo) ──
  let _priceGuideInitialized = false;

  const PRICE_GUIDE_ITEMS = [
    { icon: '🏠', name: 'Poblado', costKey: 'settlement' },
    { icon: '🏰', name: 'Ciudad', costKey: 'city' },
    { icon: '🛤️', name: 'Carretera', costKey: 'road' },
    { icon: '🃏', name: 'Carta Dev.', costKey: 'devcard' },
  ];

  function _initPriceGuideOnce() {
    if (_priceGuideInitialized) return;
    _priceGuideInitialized = true;

    const RES_ICONS = UI._resIcons();
    const COSTS = window.CONFIG?.costs || {};

    document.getElementById('price-guide-body').innerHTML = `
      <div class="price-guide-grid">
        ${PRICE_GUIDE_ITEMS.map(item => {
      const cost = COSTS[item.costKey] || {};
      return `
            <div class="price-card">
              <div class="price-card-header">
                <span class="price-card-icon">${item.icon}</span>
                <span class="price-card-name">${item.name}</span>
              </div>
              <div class="price-card-resources" data-costkey="${item.costKey}">
                ${Object.entries(cost).map(([res, qty]) => `
                  <span class="price-res-chip unavailable" data-res="${res}" data-qty="${qty}">
                    <span class="chip-icon">${RES_ICONS[res] || '?'}</span>
                    <span class="chip-qty">×${qty}</span>
                  </span>
                `).join('')}
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;

    const panel = document.getElementById('price-guide-panel');
    document.getElementById('btn-price-guide-toggle').addEventListener('click', () => {
      panel.classList.toggle('open');
      UI.adjustSidePanelsLayout();
    });
  }

  // Colorea cada chip de recurso según si el jugador tiene o no
  // la cantidad necesaria ahora mismo: disponible = oscurecido
  // (como antes), no disponible = transparente (fundido con el
  // fondo del propio panel de guía de precios).
  function updatePriceGuideAvailability(gs, myId) {
    if (!_priceGuideInitialized) return;
    const me = gs?.players?.find(p => p.id === myId);
    if (!me) return;
    document.querySelectorAll('#price-guide-body .price-res-chip').forEach(chip => {
      const res = chip.dataset.res;
      const qty = parseInt(chip.dataset.qty) || 0;
      const has = (me.resources[res] || 0) >= qty;
      chip.classList.toggle('available', has);
      chip.classList.toggle('unavailable', !has);
    });
  }

  function showPriceGuideButton() {
    _initPriceGuideOnce();
  }

  function hidePriceGuideButton() {
    const panel = document.getElementById('price-guide-panel');
    if (panel) panel.classList.remove('open');
  }

  // ── Ganador ──────────────────────────────────────────────────
  function showWinner(name) {
    document.getElementById('winner-name').textContent = `¡${name} ha ganado la partida!`;
    UI.showModal('modal-winner');
  }

  // ── Extender UI ──────────────────────────────────────────────
  Object.assign(UI, {
    showRobberModal, showStealTarget,
    showDiscardModal,
    showTradeModal, showTradeReceived,
    showDevCardModal, showDevCardUseModal, showExchangeModal,
    showPriceGuideButton, hidePriceGuideButton, updatePriceGuideAvailability,
    showWinner,
  });

})();