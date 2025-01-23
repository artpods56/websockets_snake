class SnakeGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.ws = null;
    this.state = "menu"; // menu/lobby/game
    this.lobbies = [];
    this.currentLobby = null;
    this.currentLobbyId = null;
    this.playerId = null;
    this.players = [];
    this.round = 1;

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
    this.lobbies = msg.lobbies;
    this.updateLobbyList();
    this.currentLobby = msg;
    this.players = msg.players;
    this.state = msg.status === 'playing' ? 'game' : 'lobby';
    this.round = msg.round;
  }


  updateLobbyList() {
    const list = document.getElementById('lobbyList');
    list.innerHTML = '';
    this.lobbies.forEach(lobby => {
      const btn = document.createElement('button');
      btn.textContent = `Join Lobby ${lobby}`;
      btn.addEventListener('click', () => {
        this.ws.send(JSON.stringify({
          type: 'join_lobby',
          lobbyId: lobby
        }));
      });
      list.appendChild(btn);
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
