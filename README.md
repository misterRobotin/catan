# 🎲 CATAN Online

Implementación web del juego de mesa Catan para 3-4 jugadores en red local o NAS.

## Tecnologías
- **Backend**: Node.js + Express + Socket.io (WebSockets en tiempo real)
- **Frontend**: HTML5 Canvas + SVG + CSS3 + JavaScript puro
- **Despliegue**: Docker / Docker Compose

---

## 🖥️ Arrancar en local (desarrollo)

### Requisitos
- Node.js 18 o superior
- npm

### Pasos
```bash
# Instalar dependencias
npm install

# Arrancar el servidor
npm start

# Con recarga automática (desarrollo)
npm run dev
```

Abrir en el navegador: **http://localhost:3000**

---

## 🐳 Arrancar con Docker (recomendado para el NAS)

### Requisitos
- Docker instalado
- Docker Compose instalado

### Pasos
```bash
# Construir y arrancar
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar
docker-compose down
```

Acceder desde la red local: **http://[IP-DEL-NAS]:3000**

---

## 🏠 Cómo jugar en red local

1. Arranca el servidor en tu NAS o PC
2. El creador abre `http://[IP]:3000` y crea una sala
3. Comparte el enlace (botón 📋) o el código de 6 letras
4. Los amigos abren el enlace en su navegador y se unen
5. Con 3-4 jugadores, el creador puede iniciar la partida

---

## 🎮 Reglas implementadas

### Fase de colocación
- Ronda 1: cada jugador coloca 1 poblado + 1 carretera (orden normal)
- Ronda 2: en orden inverso, cada jugador coloca 1 poblado + 1 carretera
- En ronda 2 se reciben los recursos de los hexes adyacentes al 2º poblado

### Turno normal
1. **Tirar dados**: se distribuyen recursos según el número
2. **Si sale 7**: los jugadores con >7 cartas descartan la mitad; el jugador activo mueve el ladrón
3. **Acciones** (en cualquier orden después de los dados):
   - Construir poblado (🪵🧱🐑🌾)
   - Construir ciudad (🌾🌾⛏️⛏️⛏️)
   - Construir carretera (🪵🧱)
   - Comprar carta de desarrollo (⛏️🐑🌾)
   - Negociar con jugadores o el banco
   - Usar carta de desarrollo
4. **Pasar turno**

### Cartas de desarrollo
- **Caballero** (×14): mueve el ladrón, roba un recurso. Ejército más grande (≥3) = 2 puntos
- **Punto de Victoria** (×5): +1 punto oculto, se revela al ganar
- **Construcción de Vías** (×2): 2 carreteras gratis
- **Año de la Abundancia** (×2): toma 2 recursos del banco
- **Monopolio** (×2): todos te dan ese recurso

### Victoria
- 10 puntos de victoria ganan la partida
- Fuentes: poblados (1pt), ciudades (2pt), ejército más grande (2pt), carretera más larga (2pt), puntos de victoria

### Comercio
- **Con jugadores**: propones X recursos a cambio de Y; ellos aceptan o rechazan
- **Con el banco**: ratio 4:1 general, 3:1 con puerto genérico, 2:1 con puerto específico

---

## 📁 Estructura del proyecto

```
catan/
├── server/
│   └── index.js          # Servidor Node.js + Socket.io + lógica de juego
├── public/
│   ├── index.html        # HTML de todas las vistas
│   ├── css/
│   │   └── main.css      # Estilos completos
│   └── js/
│       ├── board.js      # Motor de renderizado del tablero (Canvas + SVG)
│       ├── game.js       # Lógica del cliente y eventos WebSocket
│       ├── ui.js         # Funciones de interfaz de usuario
│       └── main.js       # Punto de entrada y navegación
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 🔧 Configuración avanzada

### Cambiar el puerto
En `docker-compose.yml`:
```yaml
ports:
  - "PUERTO_DESEADO:3000"
```

### Acceso desde internet (NAS con IP pública)
Configura el reenvío de puertos en tu router hacia la IP del NAS, puerto 3000.
Para mayor seguridad, usa un proxy inverso (Nginx) con HTTPS.
