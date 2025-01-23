class SnakeGame {
  constructor() {
    this.menuCanvas = document.getElementById('menuCanvas');
    this.menuCtx = this.menuCanvas.getContext('2d');
    this.gameCanvas = document.getElementById('gameCanvas');
    this.gameCtx = this.gameCanvas.getContext('2d');

    this.setupCanvas();
    this.setupWebSocket();
    this.setupMenu();
    this.gameState = {
      players: {},
      width: 800,
      height: 600
    };
    this.currentLobbyId = null
    this.gameLoop();
    this.lobbies = [];
  }
  setupCanvas() {
    this.menuCanvas.width = 800;
    this.menuCanvas.height = 600;
    this.gameCanvas.width = 800;
    this.gameCanvas.height = 600;
    this.gameCtx.lineWidth = 3;
    this.gameCtx.lineCap = 'round';
    this.gameCtx.lineJoin = 'round';

  }

  setupWebSocket() {
    this.ws = new WebSocket(`ws://${window.location.host}/ws/game`);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'lobbies') {
        this.lobbies = message.lobbies;
        this.drawMenu();
      } else if (message.type === 'game_state') {
        this.gameState = message.state
        this.showGame();

      }


    };
    this.ws.onopen = function(event) {
      console.log("Connected to server");
      this.ws.send(JSON.stringify({ type: 'get_lobbies' }));
    }.bind(this);
    this.ws.onclose = function(event) {
      console.log('Connection closed');
      this.currentLobbyId = null
      this.showMenu();
      setTimeout(() => this.setupWebSocket(), 1000);
    }.bind(this)

    this.ws.onerror = function(error) {
      console.error('websocket error', error)
    }.bind(this)
  }


  setupMenu() {
    this.menuState = 'main'; // 'main' or 'lobbies'
    this.menuCanvas.addEventListener('click', (event) => {
      const rect = this.menuCanvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (this.menuState === 'main') {
        //new lobby button
        if (x > 300 && x < 500 && y > 200 && y < 250) {
          this.ws.send(JSON.stringify({ type: 'new_lobby' }));

        } else if (x > 300 && x < 500 && y > 300 && y < 350) {
          this.menuState = 'lobbies'
          this.drawMenu();
        }
      } else if (this.menuState === 'lobbies') {
        for (let i = 0; i < this.lobbies.length; i++) {
          const buttonY = 200 + i * 50; // adjust spacing as needed
          if (x > 300 && x < 500 && y > buttonY && y < buttonY + 30) {
            this.joinLobby(this.lobbies[i]);

          }
        }
        if (x > 70 && x < 130 && y > 500 && y < 530) {
          this.menuState = 'main'
          this.drawMenu()
        }

      }
    });
  }

  drawMenu() {
    this.menuCtx.clearRect(0, 0, this.menuCanvas.width, this.menuCanvas.height);
    this.menuCtx.font = '24px sans-serif';
    this.menuCtx.fillStyle = 'black';
    this.menuCtx.textAlign = 'center';

    if (this.menuState === 'main') {
      this.menuCtx.fillText('New Lobby', 400, 230);
      this.menuCtx.fillText('Join Lobby', 400, 330);
      this.menuCtx.strokeRect(300, 200, 200, 50);
      this.menuCtx.strokeRect(300, 300, 200, 50);

    } else if (this.menuState === 'lobbies') {
      this.menuCtx.fillText('Available Lobbies', 400, 150);
      this.lobbies.forEach((lobby, index) => {
        const buttonY = 200 + index * 50; // adjust spacing as needed
        this.menuCtx.fillText(`Lobby ${lobby}`, 400, buttonY + 20)
        this.menuCtx.strokeRect(300, buttonY, 200, 30);
      });
      this.menuCtx.font = '14px sans-serif';
      this.menuCtx.fillText('Back', 100, 520);
      this.menuCtx.strokeRect(70, 500, 60, 30);
    }

  }

  joinLobby(lobbyId) {
    this.ws.send(JSON.stringify({ type: 'join_lobby', lobbyId: lobbyId }));
    this.currentLobbyId = lobbyId;
  }
  sendDirection() {
    this.ws.send(JSON.stringify({ type: 'input', direction: this.currentTurn === -1 ? "left" : this.currentTurn === 1 ? "right" : undefined, lobbyId: this.currentLobbyId }))
  }
  sendReset() {
    this.ws.send(JSON.stringify({ type: 'input', reset: true, lobbyId: this.currentLobbyId }))
  }

  setupControls() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        this.ws.send(JSON.stringify({ type: 'input', direction: 'left', lobbyId: this.currentLobbyId }));
      } else if (e.key === 'ArrowRight') {
        this.ws.send(JSON.stringify({ type: 'input', direction: 'right', lobbyId: this.currentLobbyId }));
      } else if (e.key === 'r') {
        this.sendReset();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        this.ws.send(JSON.stringify({ type: 'input', direction: 'none', lobbyId: this.currentLobbyId }));
      }
    });
  }

  showGame() {
    this.menuCanvas.style.display = 'none';
    this.gameCanvas.style.display = 'block';
    this.setupControls();
  }

  showMenu() {
    this.menuCanvas.style.display = 'block';
    this.gameCanvas.style.display = 'none';
    this.menuState = 'main';
    this.drawMenu();
  }

  drawBoundaries() {
    // Draw game boundaries
    this.gameCtx.strokeStyle = '#333';
    this.gameCtx.lineWidth = 2;
    this.gameCtx.beginPath();
    this.gameCtx.rect(0, 0, this.gameCanvas.width, this.gameCanvas.height);
    this.gameCtx.stroke();

    // Draw a subtle grid (optional, for better spatial awareness)
    this.gameCtx.strokeStyle = '#eee';
    this.gameCtx.lineWidth = 0.5;

    // Vertical grid lines
    for (let x = 100; x < this.gameCanvas.width; x += 100) {
      this.gameCtx.beginPath();
      this.gameCtx.moveTo(x, 0);
      this.gameCtx.lineTo(x, this.gameCanvas.height);
      this.gameCtx.stroke();
    }

    // Horizontal grid lines
    for (let y = 100; y < this.gameCanvas.height; y += 100) {
      this.gameCtx.beginPath();
      this.gameCtx.moveTo(0, y);
      this.gameCtx.lineTo(this.gameCanvas.width, y);
      this.gameCtx.stroke();
    }

    // Reset line width for player trails
    this.gameCtx.lineWidth = 3;
  }
  drawGame() {
    if (!this.gameState || !this.gameState.players) return;
    // Clear the canvas
    this.gameCtx.clearRect(0, 0, this.gameCanvas.width, this.gameCanvas.height);
    this.drawBoundaries();

    // Draw trails and current positions for all players
    for (const playerId in this.gameState.players) {
      const player = this.gameState.players[playerId];

      if (!player.curve) continue;

      this.gameCtx.strokeStyle = player.color;
      this.gameCtx.beginPath();

      for (const points of player.curve) {
        this.gameCtx.beginPath();
        this.gameCtx.arc(points[0], points[1], 2, 0, Math.PI * 2);
        this.gameCtx.fill();
      }

      if (player.alive) {
        // Draw player head
        this.gameCtx.beginPath();
        this.gameCtx.fillStyle = player.color;
        this.gameCtx.arc(player.x, player.y, 5, 0, Math.PI * 2);
        this.gameCtx.fill();
      }
    }
  }
  gameLoop() {
    this.drawGame();
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Initialize game when page loads
window.addEventListener('load', () => {
  new SnakeGame();
});
