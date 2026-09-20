// ══════════════════════════════════════════════════════════════
//  config.js — Configuración del cliente cargada desde JSON
//  Este archivo expone window.CONFIG con todos los parámetros
//  de juego. Para cambiar colores, cantidades, costes, etc.
//  edita /config/game.config.json en el servidor.
// ══════════════════════════════════════════════════════════════

// El servidor sirve game.config.json como fichero estático
// bajo /config/game.config.json. Lo cargamos de forma síncrona
// al inicio para que esté disponible antes de que el resto de
// scripts se ejecuten. (El navegador bloquea hasta que termina.)

(function loadConfig() {
  const req = new XMLHttpRequest();
  req.open('GET', '/config/game.config.json', false); // síncrono
  req.send(null);
  if (req.status === 200) {
    window.CONFIG = JSON.parse(req.responseText);
  } else {
    console.error('No se pudo cargar game.config.json — usando defaults');
    // Fallback mínimo para no romper nada si falla la carga
    window.CONFIG = {
      room: { minPlayers: 3, maxPlayers: 4 },
      game: { victoryPoints: 10, robberThreshold: 7, discardThreshold: 7 },
      board: { hexSize: 95 },
      costs: {
        road: { lumber: 1, brick: 1 },
        settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
        city: { grain: 2, ore: 3 },
        devcard: { wool: 1, grain: 1, ore: 1 }
      },
      playerColors: ['blue', 'yellow', 'green', 'purple'],
      colorMap: { blue: '#1e90ff', yellow: '#ffd700', green: '#32cd32', purple: '#9b30ff' },
      resources: {
        lumber: { icon: '🪵', label: 'Madera' },
        brick: { icon: '🧱', label: 'Arcilla' },
        wool: { icon: '🐑', label: 'Lana' },
        grain: { icon: '🌾', label: 'Trigo' },
        ore: { icon: '🪨', label: 'Piedra' },
      },
      devCards: {
        knight: { icon: '⚔️', name: 'Caballero', desc: 'Mueve el ladrón y roba un recurso' },
        victory_point: { icon: '⭐', name: 'Punto de Victoria', desc: '+1 punto (se revela al ganar)' },
        road_building: { icon: '🛤️', name: 'Construcción de Vías', desc: 'Construye 2 carreteras gratis' },
        year_of_plenty: { icon: '🌟', name: 'Año de la Abundancia', desc: 'Toma 2 recursos del banco' },
        monopoly: { icon: '💰', name: 'Monopolio', desc: 'Todos te dan ese recurso' },
      },
      ui: { toastDuration: 3500, diceAnimDuration: 600, diceDisplayDuration: 2500, roomRefreshInterval: 5000, bubbleAppearDelay: 3500 }
    };
  }
})();