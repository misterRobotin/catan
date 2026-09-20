// ══════════════════════════════════════════════════════════════
//  main.js — Punto de entrada, navegación y eventos del DOM
// ══════════════════════════════════════════════════════════════

// Funciones globales para los botones del menú
window.handleCrearSalaClick = function () {
  Game.pendingAction = 'crear';
  pendingRoomId = null;
  abrirModalNombre();
};

window.handleUnirseSalaClick = function () {
  Game.pendingAction = 'unirse';
  pendingRoomId = null;
  abrirModalNombre();
};

document.addEventListener('DOMContentLoaded', () => {
  Game.init();
  Board.init(
    document.getElementById('board-canvas'),
    document.getElementById('board-svg')
  );
});

const btnCrearSala = document.getElementById('btn-crear-sala');
const btnUnirseASala = document.getElementById('btn-unirse-sala');
const modalNombre = document.getElementById('modal-nombre');
const inputNombre = document.getElementById('input-nombre');
const modalCancelar = document.getElementById('modal-cancelar');
const modalConfirmar = document.getElementById('modal-confirmar');
const btnBackCrear = document.getElementById('btn-back-crear');
const btnBackUnirse = document.getElementById('btn-back-unirse');
const btnBackEspera = document.getElementById('btn-back-espera');
const btnIniciar = document.getElementById('btn-iniciar-partida');
const btnCopyLink = document.getElementById('btn-copy-link');
const btnRefreshSalas = document.getElementById('btn-refresh-salas');
const btnJoinCodigo = document.getElementById('btn-join-codigo');
const inputCodigo = document.getElementById('input-codigo-sala');
const chatToggle = document.getElementById('chat-toggle');
const chatBody = document.getElementById('chat-body');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const btnPlayAgain = document.getElementById('btn-play-again');

let pendingRoomId = null;

// ── Menú - event listeners are added in DOMContentLoaded with debug

// ── Modal nombre ──────────────────────────────────────────────
function abrirModalNombre() {
  inputNombre.value = Game.myName || '';
  modalNombre.classList.remove('hidden');
  setTimeout(() => inputNombre.focus(), 100);
}

function cerrarModalNombre() {
  modalNombre.classList.add('hidden');
}

modalCancelar.addEventListener('click', cerrarModalNombre);
modalNombre.addEventListener('click', (e) => { if (e.target === modalNombre) cerrarModalNombre(); });
inputNombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarNombre(); });
modalConfirmar.addEventListener('click', confirmarNombre);

function confirmarNombre() {
  const nombre = inputNombre.value.trim();
  if (!nombre || nombre.length < 2) {
    UI.toast('El nombre debe tener al menos 2 caracteres', 'error');
    inputNombre.focus();
    return;
  }
  Game.myName = nombre;
  cerrarModalNombre();

  if (pendingRoomId) {
    Game.socket.emit('room:join', { roomId: pendingRoomId, playerName: nombre });
    pendingRoomId = null;
  } else if (Game.pendingAction === 'crear') {
    Game.socket.emit('room:create', { playerName: nombre });
  } else {
    UI.showScreen('screen-sala-unirse');
    Game.socket.emit('rooms:get');
  }
}

// ── Sala creador ──────────────────────────────────────────────
btnBackCrear.addEventListener('click', () => {
  Game.socket.emit('room:leave');
  UI.showScreen('screen-menu');
});

btnIniciar.addEventListener('click', () => Game.socket.emit('game:start'));

btnCopyLink.addEventListener('click', () => {
  const room = Game.myRoom;
  if (!room) return;
  const url = `${window.location.origin}?sala=${room.id}`;
  navigator.clipboard.writeText(url).then(() => {
    UI.toast('¡Enlace copiado! Compártelo con tus amigos 🎲', 'success');
  }).catch(() => {
    const tmp = document.createElement('textarea');
    tmp.value = url;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    UI.toast('¡Enlace copiado!', 'success');
  });
});

// ── Sala unirse ───────────────────────────────────────────────
btnBackUnirse.addEventListener('click', () => UI.showScreen('screen-menu'));
btnRefreshSalas.addEventListener('click', () => Game.socket.emit('rooms:get'));

btnJoinCodigo.addEventListener('click', joinByCodigo);
inputCodigo.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCodigo(); });

function joinByCodigo() {
  const codigo = inputCodigo.value.trim().toUpperCase();
  if (!codigo || codigo.length !== 6) {
    UI.toast('Introduce un código válido de 6 caracteres', 'error');
    return;
  }
  iniciarJoinRoom(codigo);
}

window._joinRoom = iniciarJoinRoom;

function iniciarJoinRoom(roomId) {
  if (!Game.myName) {
    pendingRoomId = roomId;
    Game.pendingAction = 'unirse';
    abrirModalNombre();
  } else {
    Game.socket.emit('room:join', { roomId, playerName: Game.myName });
  }
}

// ── Sala espera ───────────────────────────────────────────────
btnBackEspera.addEventListener('click', () => {
  if (confirm('¿Salir de la sala?')) Game.socket.emit('room:leave');
});

// ── Ganador ───────────────────────────────────────────────────
btnPlayAgain.addEventListener('click', () => {
  UI.hideModal('modal-winner');
  location.reload();
});

// ── Chat ──────────────────────────────────────────────────────
chatToggle.addEventListener('click', () => {
  chatBody.classList.toggle('hidden');
  if (!chatBody.classList.contains('hidden')) {
    chatToggle.style.color = 'var(--text-muted)';
    chatInput.focus();
    document.getElementById('chat-messages').scrollTop = 99999;
  }
});

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  Game.socket.emit('chat:message', { text });
  chatInput.value = '';
}
chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ── URL con ?sala= ────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const salaParam = params.get('sala');
if (salaParam) {
  const codigo = salaParam.toUpperCase().trim();
  UI.toast(`Uniéndote a la sala ${codigo}...`, 'info');
  pendingRoomId = codigo;
  Game.pendingAction = 'unirse';
  setTimeout(() => abrirModalNombre(), 600);
}

// ── Ladrón ────────────────────────────────────────────────────
document.getElementById('modal-robber-cancel').addEventListener('click', () => {
  UI.hideModal('modal-robber');
  Game.activateRobberMode();
});

// ── Teclado ───────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ['modal-trade', 'modal-devcard', 'modal-monopoly', 'modal-yop', 'modal-discard'].forEach(id => UI.hideModal(id));
    Board.clearBuildMode();
    UI.hideBuildIndicator();
  }
  if ((e.key === 't' || e.key === 'T') && document.activeElement !== chatInput) {
    if (document.getElementById('screen-game').classList.contains('active')) {
      chatBody.classList.remove('hidden');
      chatInput.focus();
      e.preventDefault();
    }
  }
});

// ── Refresh salas periódico ───────────────────────────────────
setInterval(() => {
  if (document.getElementById('screen-sala-unirse').classList.contains('active')) {
    Game.socket.emit('rooms:get');
  }
}, 5000);