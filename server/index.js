// ══════════════════════════════════════════════════════════════
//  server/index.js — Entry point del servidor
//  Apenas crea Express, Socket.io y delega todo lo demás.
// ══════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { registerSocketHandlers } = require('./modules/socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Archivos estáticos ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// Servir game.config.json al cliente
app.use('/config', express.static(path.join(__dirname, '../config')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Socket.io ──────────────────────────────────────────────────
registerSocketHandlers(io);

// ── Arranque ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎲 Catan corriendo en http://localhost:${PORT}`));