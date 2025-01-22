class SnakeGame {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.setupCanvas();
    this.setupWebSocket();
    this.setupControls();
    this.gameState = {
      players: {},
      width: 800,
      height: 600
    };
    this.gameLoop();
  }

  setupCanvas() {
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setupWebSocket() {
    this.ws = new WebSocket(`ws://${window.location.host}/ws/game`);
    this.ws.onmessage = (event) => {
      this.gameState = JSON.parse(event.data);
    };
    this.ws.onopen = function(event) {
      console.log("Connected to server");
    };
    this.ws.onclose = function(event) {
      console.log('Connection closed');
      setTimeout(() => this.setupWebSocket(), 1000);
    }.bind(this)

    this.ws.onerror = function(error) {
      console.error('websocket error', error)
    }
  }

  setupControls() {
    this.currentTurn = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.currentTurn = -1;
      if (e.key === 'ArrowRight') this.currentTurn = 1;
      if (e.key === 'r') this.sendReset();
    });

    document.addEventListener('keyup', (e) => {
      if ((e.key === 'ArrowLeft' && this.currentTurn === -1) ||
        (e.key === 'ArrowRight' && this.currentTurn === 1)) {
        this.currentTurn = 0;
      }
    });


    setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendDirection();
      }
    }, 16);
  }

  sendDirection() {
    this.ws.send(JSON.stringify({ direction: this.currentTurn === -1 ? "left" : this.currentTurn === 1 ? "right" : undefined }))
  }
  sendReset() {
    this.ws.send(JSON.stringify({ reset: true }))
  }
  drawBoundaries() {
    // Draw game boundaries
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.stroke();

    // Draw a subtle grid (optional, for better spatial awareness)
    this.ctx.strokeStyle = '#eee';
    this.ctx.lineWidth = 0.5;

    // Vertical grid lines
    for (let x = 100; x < this.canvas.width; x += 100) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    // Horizontal grid lines
    for (let y = 100; y < this.canvas.height; y += 100) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    // Reset line width for player trails
    this.ctx.lineWidth = 3;
  }


  drawGame() {
    if (!this.gameState || !this.gameState.players) return;
    // Clear the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBoundaries();

    // Draw trails and current positions for all players
    for (const playerId in this.gameState.players) {
      const player = this.gameState.players[playerId];
      if (!player.curve) continue;
      // Draw trail
      this.ctx.beginPath();
      this.ctx.fillStyle = player.color;

      for (const point of player.curve) {
        this.ctx.beginPath();
        this.ctx.arc(point[0], point[1], 2, 0, Math.PI * 2);
        this.ctx.fill();
      }


      if (player.alive) {
        // Draw player head
        this.ctx.beginPath();
        this.ctx.fillStyle = player.color;
        this.ctx.arc(player.x, player.y, 5, 0, Math.PI * 2);
        this.ctx.fill();
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
