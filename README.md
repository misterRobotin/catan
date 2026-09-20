# 🎲 CATAN Online

Implementación web del juego de mesa Catan para 3-4 jugadores, pensada para partidas en red local o a través de un NAS/servidor propio.

## Tecnologías

- **Backend**: Node.js + Express + Socket.io (estado de partida en tiempo real vía WebSockets)
- **Frontend**: HTML5 Canvas + SVG + CSS3 + JavaScript puro (sin frameworks)
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

1. Arranca el servidor en tu NAS o PC.
2. El creador abre `http://[IP]:3000` y crea una sala.
3. Comparte el enlace (botón 📋) o el código de 6 letras.
4. Los amigos abren el enlace en su navegador y se unen.
5. Con 3-4 jugadores, el creador puede iniciar la partida.

---

## 🎮 Reglas implementadas

### Fase de colocación (setup)

- Tirada inicial: cada jugador tira los dados para determinar el orden de turno (empates repiten tirada entre los implicados).
- Ronda 1: en orden normal, cada jugador coloca 1 poblado + 1 carretera.
- Ronda 2: en orden inverso, cada jugador coloca 1 poblado + 1 carretera.
- Al colocar el 2º poblado (ronda 2) se reciben automáticamente los recursos de los hexágonos adyacentes.

### Turno normal

1. **Tirar dados**: se distribuyen recursos a todos los jugadores según el número obtenido. Los recursos ganados aparecen como bocadillos reclamables sobre el tablero.
2. **Si sale 7**: los jugadores con más de 7 cartas de recurso deben descartar la mitad (redondeando hacia abajo); después, el jugador activo mueve el ladrón y roba una carta al azar a un jugador con edificios en el hexágono elegido.
3. **Acciones** (en cualquier orden, tras tirar los dados):
   - Construir poblado — 🪵 madera, 🧱 arcilla, 🐑 lana, 🌾 trigo
   - Construir ciudad (mejora un poblado propio) — 🌾🌾 trigo, 🪨🪨🪨 piedra
   - Construir carretera (debe conectar con una carretera o edificio propio) — 🪵 madera, 🧱 arcilla
   - Comprar carta de desarrollo — 🐑 lana, 🌾 trigo, 🪨 piedra
   - Negociar con otros jugadores o con el banco
   - Jugar una carta de desarrollo (nunca la misma que se acaba de comprar ese turno)
4. **Pasar turno**.

### Cartas de desarrollo (25 en total, composición oficial)

| Carta | Cantidad | Efecto |
|---|---|---|
| ⚔️ Caballero | 14 | Mueve el ladrón y roba una carta. Con 3 o más caballeros jugados y ser el máximo, se obtiene el Ejército Más Grande (+2 puntos) |
| ⭐ Punto de Victoria | 5 | Suma 1 punto de inmediato al comprarla; permanece oculta a los demás hasta que se revela o decide la partida |
| 🛤️ Construcción de Carreteras | 2 | Coloca 2 carreteras gratis de forma encadenada; si no queda ningún hueco disponible, no se puede jugar |
| 🌟 Año de la Abundancia | 2 | Toma 2 recursos cualesquiera del banco |
| 💰 Monopolio | 2 | Todos los demás jugadores entregan todas sus cartas de un recurso elegido |

Ninguna carta comprada puede jugarse en el mismo turno de la compra, salvo el caballero cuando ya se poseía de antes.

### Ejército Más Grande y Ruta Más Larga

- **Ejército Más Grande**: mínimo 3 caballeros jugados; +2 puntos. Se transfiere si otro jugador supera al actual poseedor.
- **Ruta Más Larga**: mínimo 5 tramos de carretera propios conectados de forma continua e ininterrumpida (un edificio rival en medio corta la ruta); +2 puntos. También se transfiere si otro jugador consigue una ruta más larga.
- En ambos casos, si hay empate en el máximo, nadie recibe el punto.

### Victoria

10 puntos de victoria ganan la partida. Fuentes de puntos:

- Poblado — 1 punto
- Ciudad — 2 puntos
- Ejército Más Grande — 2 puntos
- Ruta Más Larga — 2 puntos
- Cartas de Punto de Victoria — 1 punto cada una

### Comercio

- **Con jugadores**: se elige a quién dirigir la oferta (uno, varios, o "Todos"), y se puede ofrecer, pedir, o ambos a la vez — incluye regalar recursos sin pedir nada a cambio. El destinatario ve exactamente qué recursos entrega y recibe, y el botón de aceptar se desactiva automáticamente si le faltan recursos para cumplir su parte.
- **Con el banco**: cada intercambio es una operación de bloque completo por 1 unidad del recurso pedido. El ratio depende de los puertos propios: 4:1 sin puerto, 3:1 con puerto genérico, 2:1 con el puerto específico de ese recurso.

### Puertos

Las 9 posiciones de puerto se sortean en cada partida entre todas las aristas de borde válidas del tablero (respetando una separación mínima entre ellos), en vez de usar siempre las mismas 9 ubicaciones fijas.

### Privacidad de la información

El servidor envía a cada jugador una versión distinta del estado de la partida: los tipos de cartas de desarrollo sin jugar y los puntos ocultos (cartas de Punto de Victoria) de los rivales nunca viajan al cliente de los demás jugadores, evitando que se puedan inspeccionar mediante las herramientas de desarrollador del navegador.

---

## 📁 Estructura del proyecto

```
catan/
├── config/
│   └── game.config.json     # Parámetros de partida (puntos, umbrales, costes...)
├── server/
│   ├── index.js             # Punto de entrada: Express + Socket.io
│   └── modules/
│       ├── config.js        # Constantes del servidor (lee game.config.json)
│       ├── board.js         # Generación del tablero, geometría, puertos aleatorios
│       ├── game.js          # Lógica de estado: puntos, rutas, cartas especiales
│       ├── rooms.js         # Gestión de salas (crear, unirse, iniciar partida)
│       └── socket.js        # Registro de todos los eventos Socket.io
├── public/
│   ├── index.html           # HTML de todas las pantallas y modales
│   ├── css/
│   │   ├── variables.css    # Tokens de diseño (colores, tipografía)
│   │   ├── base.css         # Reset y estructura base
│   │   ├── animations.css   # Keyframes globales
│   │   ├── responsive.css   # Media queries
│   │   ├── screens/         # Menú, sala, pantalla de juego
│   │   └── components/      # Botones, modales, paneles, chat/log, dados, comercio...
│   └── js/
│       ├── config.js        # Carga game.config.json en el cliente
│       ├── board.js         # Motor de renderizado del tablero (Canvas + SVG)
│       ├── game.js          # Lógica de cliente y eventos WebSocket
│       ├── main.js          # Punto de entrada y navegación entre pantallas
│       └── ui/
│           ├── ui-core.js   # Utilidades de interfaz, navegación, toasts
│           ├── ui-panels.js # Paneles de jugador, layout de chat/log/guía de precios
│           ├── ui-modals.js # Todos los modales del juego
│           └── ui-chat.js   # Extensiones del chat
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 🔧 Configuración avanzada

### Cambiar parámetros de juego

`config/game.config.json` centraliza los valores ajustables sin tocar código: puntos de victoria necesarios, mínimo/máximo de jugadores por sala, umbral de descarte por el ladrón, costes de construcción, colores de jugador, y la composición del mazo de cartas de desarrollo.

### Cambiar el puerto

En `docker-compose.yml`:

```yaml
ports:
  - "PUERTO_DESEADO:3000"
```

### Acceso desde internet (NAS con IP pública)

Configura el reenvío de puertos en tu router hacia la IP del NAS, puerto 3000. Para mayor seguridad, usa un proxy inverso (Nginx) con HTTPS.