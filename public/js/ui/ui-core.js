// ══════════════════════════════════════════════════════════════
//  ui/ui-core.js — Núcleo de UI: utilidades, sala y pantallas
// ══════════════════════════════════════════════════════════════

const UI = (() => {

  // ── Constantes (derivadas de CONFIG cuando esté disponible) ──
  const COLOR_MAP = () => window.CONFIG?.colorMap || { blue: '#1e90ff', yellow: '#ffd700', green: '#32cd32', purple: '#9b30ff' };
  const RES_ICONS = () => Object.fromEntries(Object.entries(window.CONFIG?.resources || {}).map(([k, v]) => [k, v.icon]));
  const RES_LABELS = () => Object.fromEntries(Object.entries(window.CONFIG?.resources || {}).map(([k, v]) => [k, v.label]));
  const DEV_CARDS = () => window.CONFIG?.devCards || {};

  // Orden de posiciones de panel (el jugador local siempre va en BR)
  const CORNER_ORDER = ['tl', 'tr', 'bl'];

  let diceTimeout = null;
  let _diceAnimating = false;

  // ── Navegación ───────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    el.classList.add('active');
    void el.offsetWidth; // fuerza reflow para que el grid se calcule
  }

  // Modales que NO deben cerrarse al hacer click fuera (requieren acción explícita)
  const MODAL_NO_DISMISS = new Set(['modal-robber', 'modal-discard', 'modal-monopoly', 'modal-yop']);

  function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    // Cierre al hacer click en el overlay (fuera del modal-box)
    if (!MODAL_NO_DISMISS.has(id) && !el._clickOutsideHandler) {
      el._clickOutsideHandler = (e) => {
        if (e.target === el) hideModal(id);
      };
      el.addEventListener('click', el._clickOutsideHandler);
    }
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const box = el.querySelector('.modal-box');
    // Animar salida y luego ocultar
    el.classList.add('hiding');
    if (box) box.classList.add('hiding');
    setTimeout(() => {
      el.classList.remove('hiding');
      if (box) box.classList.remove('hiding');
      el.classList.add('hidden');
    }, 200);
  }

  // ── Toast ────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const dur = window.CONFIG?.ui?.toastDuration ?? 3500;
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), dur);
  }

  // ── Helpers de recursos / cartas ────────────────────────────
  function resName(key) { return RES_LABELS()[key] || key; }
  function resIcon(key) { return RES_ICONS()[key] || '?'; }
  function devCardName(type) { return DEV_CARDS()[type]?.name || type; }

  // ── Sala: creador ────────────────────────────────────────────
  function renderCreatorRoom(room) {
    document.getElementById('sala-codigo').textContent = room.id;
    renderPlayerList('jugadores-lista-crear', room);
    const minP = window.CONFIG?.room?.minPlayers ?? 3;
    const btnIniciar = document.getElementById('btn-iniciar-partida');
    btnIniciar.disabled = room.players.length < minP;
    btnIniciar.textContent = room.players.length < minP
      ? `Iniciar Partida (${room.players.length}/${minP})`
      : 'Iniciar Partida';

    // Actualizar hint con valores de config
    const maxP = window.CONFIG?.room?.maxPlayers ?? 4;
    const hint = document.getElementById('sala-minmax-hint');
    if (hint) hint.textContent = `Mínimo ${minP} jugadores · Máximo ${maxP}`;
  }

  function renderGuestRoom(room) {
    document.getElementById('sala-espera-nombre').textContent = room.name;
    document.getElementById('sala-espera-codigo').textContent = room.id;
    renderPlayerList('jugadores-lista-espera', room);
  }

  function renderPlayerList(containerId, room) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    const maxP = window.CONFIG?.room?.maxPlayers ?? 4;
    room.players.forEach(p => {
      const isCreator = p.id === room.creatorId;
      const color = COLOR_MAP()[p.color] || '#fff';
      const card = document.createElement('div');
      card.className = 'jugador-card';
      card.style.borderColor = color;
      card.innerHTML = `
        <div class="jugador-avatar" style="color:${color}">${p.name[0].toUpperCase()}</div>
        <div class="jugador-info">
          <div class="jugador-name">${p.name}</div>
          <div class="jugador-role">${isCreator ? '👑 Creador' : '🎮 Jugador'}</div>
        </div>
        <div class="jugador-color-dot" style="background:${color}"></div>
      `;
      el.appendChild(card);
    });

    // Slots vacíos
    const empty = maxP - room.players.length;
    for (let i = 0; i < empty; i++) {
      const card = document.createElement('div');
      card.className = 'jugador-card';
      card.style.borderColor = 'rgba(255,255,255,0.1)';
      card.style.opacity = '0.4';
      card.innerHTML = `
        <div class="jugador-avatar" style="color:#666">?</div>
        <div class="jugador-info">
          <div class="jugador-name" style="color:#666">Esperando...</div>
          <div class="jugador-role">Ranura libre</div>
        </div>
      `;
      el.appendChild(card);
    }
  }

  // ── Lista de salas ───────────────────────────────────────────
  function renderRoomList(rooms) {
    const el = document.getElementById('salas-lista');
    el.innerHTML = '';
    if (rooms.length === 0) {
      el.innerHTML = '<div class="sala-empty">No hay salas disponibles. ¡Crea una!</div>';
      return;
    }
    rooms.forEach(room => {
      const item = document.createElement('div');
      item.className = 'sala-item';
      item.innerHTML = `
        <div>
          <div class="sala-item-name">${room.name}</div>
          <div class="sala-item-info">${room.players.length}/4 jugadores · Código: ${room.id}</div>
        </div>
        <button class="sala-item-join">Unirse</button>
      `;
      item.querySelector('.sala-item-join').addEventListener('click', (e) => {
        e.stopPropagation();
        if (window._joinRoom) window._joinRoom(room.id);
      });
      el.appendChild(item);
    });
  }

  // ── Indicador de turno ───────────────────────────────────────
  function setTurnIndicator(player, isMyTurn, phase) {
    const el = document.getElementById('turn-indicator');
    const color = COLOR_MAP()[player.color] || '#f5c518';
    if (phase === 'initRoll') {
      el.innerHTML = isMyTurn
        ? `<span style="color:${color}">🎲 TIRADA INICIAL</span> · Tira para determinar quién empieza`
        : `<span style="color:${color}">🎲</span> Tirada inicial — Esperando a todos los jugadores...`;
    } else if (isMyTurn) {
      const phaseText = phase === 'setup' ? 'Fase de colocación' :
        phase === 'preRoll' ? 'Tu turno — Tira los dados' :
          phase === 'postRoll' ? 'Tu turno — Actúa' : '';
      el.innerHTML = `<span style="color:${color}">● TU TURNO</span> · ${phaseText}`;
    } else {
      el.innerHTML = `<span style="color:${color}">●</span> Turno de <strong>${player.name}</strong>`;
    }
  }

  // ── Botones de acción ────────────────────────────────────────
  function clearActionButtons() {
    document.getElementById('action-buttons').innerHTML = '';
  }

  function addActionButton(label, type, onClick) {
    const btn = document.createElement('button');
    btn.className = `btn-action ${type}`;
    btn.innerHTML = label;
    btn.addEventListener('click', onClick);
    document.getElementById('action-buttons').appendChild(btn);
    return btn;
  }

  // ── Dados ────────────────────────────────────────────────────
  function isDiceAnimating() { return _diceAnimating; }

  function animateDice(d1, d2, total) {
    const display = document.getElementById('dice-display');
    const v1 = document.getElementById('die1-val');
    const v2 = document.getElementById('die2-val');
    const tot = document.getElementById('dice-total');
    const dur = window.CONFIG?.ui?.diceDisplayDuration ?? 3500;

    _diceAnimating = true;
    display.classList.remove('hidden');

    // Fase 1: dados aleatorios (12 frames × 60ms = ~720ms)
    let frames = 0;
    const anim = setInterval(() => {
      v1.textContent = Math.ceil(Math.random() * 6);
      v2.textContent = Math.ceil(Math.random() * 6);
      if (++frames > 12) {
        clearInterval(anim);
        v1.textContent = d1;
        v2.textContent = d2;

        // Fase 2: animación de números rodando en el total
        const isRobber = total === 7;
        tot.style.color = isRobber ? '#ff4444' : 'var(--gold)';
        display.style.borderColor = isRobber ? '#ff4444' : 'var(--gold)';

        // Recorre números del 2 al total acelerando
        let n = 2;
        const steps = total - 2; // cuántos números hay que pasar
        if (steps <= 0) {
          tot.textContent = total;
        } else {
          tot.textContent = n;
          // Intervalos decrecientes: empieza lento, termina rápido
          const delays = Array.from({ length: steps + 1 }, (_, i) =>
            Math.round(120 - i * (80 / Math.max(steps, 1)))
          );
          let step = 0;
          const rollNext = () => {
            tot.textContent = n;
            // Efecto visual: pequeño scale bounce
            tot.style.transform = 'scale(1.25)';
            setTimeout(() => { tot.style.transform = 'scale(1)'; }, delays[step] * 0.4);
            if (n < total) {
              n++;
              step++;
              setTimeout(rollNext, delays[step] ?? 40);
            }
          };
          rollNext();
        }
      }
    }, 60);

    clearTimeout(diceTimeout);
    diceTimeout = setTimeout(() => {
      display.classList.add('hidden');
      _diceAnimating = false;
    }, dur);
  }

  // ── Indicador de construcción ─────────────────────────────────
  function showBuildIndicator(text) {
    let el = document.getElementById('build-mode-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'build-mode-indicator';
      el.className = 'build-mode-indicator';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
  }

  function hideBuildIndicator() {
    const el = document.getElementById('build-mode-indicator');
    if (el) el.style.display = 'none';
  }

  // ── Log ──────────────────────────────────────────────────────
  function updateLog(log) {
    const el = document.getElementById('log-messages');
    if (!el) return;
    el.innerHTML = (log || []).slice(-30).map(e => `<div class="log-entry">${e}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  // ── Chat ─────────────────────────────────────────────────────
  function addChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const color = COLOR_MAP()[msg.playerColor] || '#fff';
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
      <span class="chat-msg-name" style="color:${color}">${msg.playerName}</span>
      <span class="chat-msg-text">${escapeHtml(msg.text)}</span>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    const body = document.getElementById('chat-body');
    if (body.classList.contains('hidden')) {
      document.getElementById('chat-toggle').style.color = 'var(--gold)';
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── API parcial (se completa en otros módulos UI) ────────────
  // Los módulos ui-panels, ui-modals y ui-chat añaden sus métodos
  // al objeto retornado mediante Object.assign sobre _publicAPI.
  const _publicAPI = {
    showScreen, showModal, hideModal, toast,
    resName, resIcon, devCardName,
    renderCreatorRoom, renderGuestRoom, renderPlayerList, renderRoomList,
    setTurnIndicator, clearActionButtons, addActionButton,
    isDiceAnimating, animateDice,
    showBuildIndicator, hideBuildIndicator,
    updateLog, addChatMessage,
    // Exponer internals para módulos hermanos
    _colorMap: COLOR_MAP,
    _resIcons: RES_ICONS,
    _resLabels: RES_LABELS,
    _devCards: DEV_CARDS,
  };

  return _publicAPI;

})();