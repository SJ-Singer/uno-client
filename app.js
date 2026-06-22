// 1. CONEXIÓN Y VARIABLES GLOBALES
let socket;
let miColorElegido = null; // Para guardar temporalmente el color del comodín

// Mapeo de elementos del DOM para mantener el código limpio
const DOM = {
    lobby: document.getElementById('pantalla-lobby'),
    juego: document.getElementById('pantalla-juego'),
    modal: document.getElementById('modal-popup'),
    selectorColor: document.getElementById('selector-color'),
    usernameInput: document.getElementById('username'),
    listaJugadores: document.getElementById('lista-jugadores'),
    salaEspera: document.getElementById('sala-espera'),
    infoSentido: document.getElementById('info-sentido'),
    infoTurno: document.getElementById('info-turno'),
    logAcciones: document.getElementById('log-acciones'),
    cartaMesa: document.getElementById('carta-mesa-contenedor'),
    misCartas: document.getElementById('mis-cartas'),
    botoneraUno: document.getElementById('botonera-uno'),
    modalMensaje: document.getElementById('modal-mensaje')
};

// 2. FUNCIÓN TRADUCTORA DE ASSETS 🗺️
function obtenerRutaImagen(carta) {
    // Si es un comodín base o se acaba de robar/mostrar sin color definitivo
    if (carta.color === 'Comodín' && !carta.isComodinReal) {
        return carta.value === '+4' ? 'assets/Wild_DrawFour.png' : 'assets/Wild.png';
    }

    // Diccionarios de traducción (Servidor -> Nombre del archivo)
    const colores = { 'Rojo': 'Red', 'Amarillo': 'Yellow', 'Verde': 'Green', 'Azul': 'Blue' };
    const valores = {
        'Bloqueo': 'SkipTurn',
        'CambioSentido': 'Reverse',
        '+2': 'DrawTwo',
        '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
        '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine'
    };

    const colorEng = colores[carta.color] || carta.color; 
    const valorEng = valores[carta.value] || carta.value;

    return `assets/${colorEng}_${valorEng}.png`;
}

// 3. CONEXIÓN AL SERVIDOR (LOBBY) 🔌
function conectarAlLobby() {
    const nombre = DOM.usernameInput.value.trim();
    if (!nombre) return alert("Por favor, introduce un nombre válido.");

    // Crear túnel WebSocket local
    // Detectar si estamos ejecutando en local o en GitHub Pages
const esLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// SI ES LOCAL: Usa el host de tu PC (ej. localhost:3000)
// SI ES PRODUCCIÓN: Reemplaza con la URL que te dé Render (SIN el https://, usa wss://)
const URL_SERVIDOR = esLocal 
    ? `ws://${window.location.host}` 
    : `wss://tu-servidor-uno.onrender.com`; 

// Crear túnel WebSocket apuntando al lugar correcto
socket = new WebSocket(URL_SERVIDOR);

    socket.onopen = () => {
        // Enviar evento de unión inmediatamente al conectar [cite: 135]
        socket.send(JSON.stringify({ type: 'joinGame', data: nombre }));
        DOM.usernameInput.disabled = true;
        document.getElementById('btn-entrar').disabled = true;
    };

    socket.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);

        switch (type) {
            case 'waitingRoom': // [cite: 148]
                actualizarSalaEspera(data);
                break;

            case 'gameState': // [cite: 148]
                manejarEstadoJuego(data);
                break;

            case 'showPopup': // [cite: 150]
                DOM.modalMensaje.innerText = data;
                DOM.modal.style.display = 'flex';
                break;

            case 'errorMsg': // [cite: 151]
                alert(`⚠️ Error: ${data}`);
                break;

            case 'gameOver': // [cite: 152]
                alert(`🏁 Fin del juego: ${data}`);
                window.location.reload();
                break;
        }
    };

    socket.onclose = () => {
        console.log("Conexión cerrada con el servidor.");
    };
}

// 4. ACTUALIZACIONES REACTIVAS DEL DOM 🔄

function actualizarSalaEspera(listaNombres) {
    DOM.salaEspera.style.display = 'block';
    DOM.listaJugadores.innerHTML = listaNombres
        .map(nombre => `<li>👤 ${nombre}</li>`)
        .join('');
}

function manejarEstadoJuego(estado) {
    // Si el juego inició, hacemos el cambio de pantallas [cite: 129]
    if (estado.gameStarted) {
        DOM.lobby.style.display = 'none';
        DOM.juego.style.display = 'block';
    }

    // Actualizar barras de estado superiores [cite: 22, 23]
    DOM.infoSentido.innerText = `Sentido: ${estado.direction}`;
    DOM.infoTurno.innerText = `Turno de: ${estado.currentTurnName}`;
    if (estado.log) DOM.logAcciones.innerText = estado.log;

    // Destacar visualmente si es nuestro turno
    DOM.infoTurno.style.color = estado.isMyTurn ? '#55aa55' : '#ffffff';
    if (estado.isMyTurn) DOM.infoTurno.innerText += " (¡TU TURNO!)";

    // Mostrar/Ocultar botón de UNO [cite: 23]
    DOM.botoneraUno.style.display = estado.mostrarBotoneraUno ? 'block' : 'none';

    // Renderizar la carta del centro de la mesa [cite: 22]
    if (estado.topCard) {
        DOM.cartaMesa.innerHTML = `<img src="${obtenerRutaImagen(estado.topCard)}" class="carta-tablero">`;
    }

    // Renderizar las cartas de nuestra mano de forma interactiva [cite: 22]
    DOM.misCartas.innerHTML = '';
    estado.hand.forEach((carta, index) => {
        const img = document.createElement('img');
        img.src = obtenerRutaImagen(carta);
        img.className = 'carta-mano';
        
        // Solo dejamos que haga click si es nuestro turno y no está pausado por popup [cite: 22, 43]
        if (estado.isMyTurn && !estado.isPaused) {
            img.classList.add('mi-turno');
            img.onclick = () => procesarIntentoJugada(carta, index);
        }
        
        DOM.misCartas.appendChild(img);
    });
}

// 5. INTERACCIONES DEL JUGADOR (CLIENTE -> SERVIDOR) 💥

function procesarIntentoJugada(carta, index) {
    // Si es un comodín, abrimos el selector de color antes de enviar la jugada [cite: 44, 46, 47]
    if (carta.color === 'Comodín' || carta.value === 'CambiaColor' || carta.value === '+4') {
        DOM.selectorColor.style.display = 'flex';
        // Guardamos el índice globalmente de forma temporal
        DOM.selectorColor.dataset.pendingIndex = index;
    } else {
        // Carta normal o especial de color
        socket.send(JSON.stringify({
            type: 'playCard', // [cite: 136]
            data: { index: index, chosenColor: null }
        }));
    }
}

function elegirColorComodin(color) {
    const index = parseInt(DOM.selectorColor.dataset.pendingIndex);
    DOM.selectorColor.style.display = 'none';

    socket.send(JSON.stringify({
        type: 'playCard', // [cite: 136]
        data: { index: index, chosenColor: color }
    }));
}

function robarCartaDelMazo() {
    socket.send(JSON.stringify({ type: 'drawCard' })); // [cite: 137]
}

function gritarUno() {
    socket.send(JSON.stringify({ type: 'cantarUno' })); // [cite: 139]
}

function gritarCorte() {
    socket.send(JSON.stringify({ type: 'cantarCorte' })); // [cite: 140]
}

function aceptarPenalizacion() {
    DOM.modal.style.display = 'none';
    socket.send(JSON.stringify({ type: 'resolvePopup' })); // [cite: 141]
}