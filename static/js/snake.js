class SnakeGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.ws = null;
    this.state = "menu"; // menu/lobby/game
    this.lobbies = {};
    this.currentLobby = null;
    this.currentLobbyId = null;
    this.playerId = null;
    this.players = [];
    this.round = 1;
    this.gameState = null;

    this.setupCanvas();
    this.connectWebSocket();
    this.setupEventListeners();
    this.gameLoop();
  }

  setupCanvas() {
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  connectWebSocket() {
    this.ws = new WebSocket(`ws://${window.location.host}/ws`);

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      console.log("Received " + msg.type + " message")
      switch (msg.type) {
        case 'lobby_update':
          this.handleLobbyUpdate(msg);
          break;
        case 'game_state':
          this.handleGameState(msg);
          break;
      }
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 1000);
    };
  }

  handleLobbyUpdate(msg) {
    if (msg.status === 'playing') {
      document.querySelector('.overlay').style.display = 'none';
    }


    // If the lobby already exists, update it; otherwise, add it to the lobbies object
    if (!this.lobbies[msg.lobby_id]) {
      this.lobbies[msg.lobby_id] = msg; // Add new lobby
    } else {
      // Update existing lobby with new data
      this.lobbies[msg.lobby_id] = { ...this.lobbies[msg.lobby_id], ...msg };
    }

    // Update the lobby list display
    this.updateLobbyList();

    // If this is the current lobby, update the current lobby state
    if (this.currentLobbyId === msg.lobby_id) {
      this.currentLobby = msg;
      this.players = msg.players;
      this.state = msg.status === 'playing' ? 'game' : 'lobby';
      this.round = msg.round;
    }
  }

  updateLobbyList() {
    const list = document.getElementById('lobbyList');
    list.innerHTML = ''; // Clear the current list

    // Iterate over all lobbies and create a list item for each
    Object.values(this.lobbies).forEach(lobby => {
      const lobbyItem = document.createElement('div');
      lobbyItem.className = 'lobby-item';

      // Display lobby information
      lobbyItem.innerHTML = `
            <strong>Lobby ID:</strong> ${lobby.lobby_id}<br>
            <strong>Status:</strong> ${lobby.status}<br>
            <strong>Players:</strong> ${lobby.players.length}/${lobby.max_players || 6}<br>
            <strong>Round:</strong> ${lobby.round}
        `;

      // Add a "Join" button
      const joinButton = document.createElement('button');
      joinButton.textContent = 'Join Lobby';
      joinButton.addEventListener('click', () => {
        this.ws.send(JSON.stringify({
          type: 'join_lobby',
          lobbyId: lobby.lobby_id
        }));
        this.currentLobbyId = lobby.lobby_id; // Set the current lobby ID
        document.getElementById("lobbyUI").style.display = "block";
      });

      lobbyItem.appendChild(joinButton);
      list.appendChild(lobbyItem);
    });
  }


  handleGameState(msg) {
    this.gameState = msg;
    this.drawGame();
  }

  setupEventListeners() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if (this.state !== 'game') return;
      if (e.key === 'ArrowLeft') this.sendInput('left');
      if (e.key === 'ArrowRight') this.sendInput('right');
    });

    document.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        this.sendInput('none');
      }
    });

    // Name input
    document.getElementById('nameInputBtn').addEventListener('click', (e) => {
      const name_input = document.getElementById("nameInput").value
      this.ws.send(JSON.stringify({
        type: 'player_name',
        name: name_input
      }));
    });

    // Ready button
    document.getElementById('readyBtn').addEventListener('click', () => {
      console.log("User is ready")
      this.ws.send(JSON.stringify({ type: 'player_ready' }));
    });

    document.getElementById('createLobby').addEventListener('click', () => {
      this.ws.send(JSON.stringify({ type: 'new_lobby' }));
    });

  }

  sendInput(direction) {
    this.ws.send(JSON.stringify({
      type: 'player_input',
      direction: direction !== 'none' ? direction : null
    }));
  }

  drawGame() {
    if (!this.gameState) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);


    // Draw trails
    this.gameState.players.forEach(player => {
      if (!player.alive) return;

      this.ctx.strokeStyle = player.color;
      this.ctx.beginPath();
      player.curve.forEach((point, i) => {
        if (i === 0) this.ctx.moveTo(...point);
        else this.ctx.lineTo(...point);
      });
      this.ctx.stroke();

      // Draw player
      this.ctx.fillStyle = player.color;
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, 6, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Draw HUD
    this.ctx.fillStyle = '#2c3e50';
    this.ctx.font = '20px Arial';
    this.ctx.fillText(`Round: ${this.round}`, 20, 30);
    this.players.forEach((player, i) => {
      this.ctx.fillStyle = player.color;
      this.ctx.fillText(`${player.name}: ${player.score}`, 20, 60 + i * 30);
    });
  }

  drawLobby() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#2c3e50';
    this.ctx.font = '30px Arial';
    this.ctx.textAlign = 'center';

    // Lobby ID
    this.ctx.fillText(`Lobby: ${this.currentLobby.lobby_id}`, 400, 50);

    // Players list
    this.ctx.font = '24px Arial';
    this.ctx.textAlign = 'left';
    this.players.forEach((player, i) => {
      this.ctx.fillStyle = player.color;
      this.ctx.fillText(
        `${player.name} ${player.ready ? '✓' : ''}`,
        100, 150 + i * 40
      );
    });

    // Countdown
    if (this.currentLobby.status === 'countdown') {
      this.ctx.fillStyle = '#e74c3c';
      this.ctx.font = '40px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        `Starting in ${this.currentLobby.countdown}`,
        400, 300
      );
    }
  }

  gameLoop() {
    if (this.state === 'game') {
      this.drawGame();
    } else if (this.state === 'lobby') {
      this.drawLobby();
    }
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Initialize game
window.addEventListener('load', () => {
  new SnakeGame();
});
