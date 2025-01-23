from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import json
import random
from typing import Dict, List, Optional
import asyncio
import math
import time
from dataclasses import dataclass

app = FastAPI()
app.mount("/static", StaticFiles(directory="static", html=True), name="static")

@dataclass
class Player:
    player_id: str
    x: float
    y: float
    direction: float
    color: str
    name: str
    ready: bool = False
    alive: bool = True
    score: int = 0
    curve: List[tuple] = None
    turning: Optional[str] = None
    speed: float = 2.5
    radius: int = 5
    ink: int = 300

    def __post_init__(self):
        self.curve = [(self.x, self.y)]

class GameState:
    def __init__(self, width=800, height=600):
        self.players: Dict[str, Player] = {}
        self.width = width
        self.height = height
        self.colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD", "#FF9999"]
        self.round = 1
        
    def add_player(self, player_id: str, name: str, color: str):
        x = random.randint(50, self.width - 50)
        y = random.randint(50, self.height - 50)
        direction = random.uniform(0, 2 * math.pi)
        self.players[player_id] = Player(
            player_id=player_id,
            x=x,
            y=y,
            direction=direction,
            color=color,
            name=name
        )
    
    def update(self):
        alive_players = [p for p in self.players.values() if p.alive]
        
        for player in alive_players:
            # Update direction
            if player.turning == 'left':
                player.direction -= 0.04
            elif player.turning == 'right':
                player.direction += 0.04
            player.direction %= 2 * math.pi

            # Update position
            new_x = player.x + player.speed * math.cos(player.direction)
            new_y = player.y + player.speed * math.sin(player.direction)

            # Add to curve if inking
            if player.ink > 0:
                player.curve.append((player.x, player.y))
                player.ink -= 1
            elif player.ink <= -100:
                player.ink = 300

            # Check collisions
            if self.check_collision(player, new_x, new_y):
                player.alive = False
                continue

            player.x = new_x
            player.y = new_y

        return len(alive_players) > 1

    def check_collision(self, player, new_x, new_y):
        # Boundary check
        if (new_x < 0 + player.radius or new_x > self.width - player.radius or
            new_y < 0 + player.radius or new_y > self.height - player.radius):
            return True

        # Self collision (last 40 points)
        for point in player.curve[-40:]:
            if math.dist((new_x, new_y), point) < player.radius * 1.5:
                return True

        # Other players' trails
        for other in self.players.values():
            if other.player_id != player.player_id:
                for point in other.curve:
                    if math.dist((new_x, new_y), point) < player.radius * 1.5:
                        return True
        return False

    def reset_round(self):
        self.round += 1
        for player in self.players.values():
            player.x = random.randint(50, self.width - 50)
            player.y = random.randint(50, self.height - 50)
            player.direction = random.uniform(0, 2 * math.pi)
            player.curve = [(player.x, player.y)]
            player.alive = True
            player.ink = 300
            player.turning = None

class Lobby:
    def __init__(self, lobby_id: str):
        self.lobby_id = lobby_id
        self.players: Dict[str, Player] = {}
        self.game_state = GameState()
        self.status: str = "waiting"  # waiting/countdown/playing/results
        self.countdown: int = 10
        self.max_players: int = 6
        self.colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD", "#FF9999"]

    def add_player(self, player_id: str, name: str):
        color = self.colors[len(self.players) % len(self.colors)]
        self.game_state.add_player(player_id, name, color)
        self.players[player_id] = self.game_state.players[player_id]

    def all_ready(self):
        return len(self.players) >= 2 and all(p.ready for p in self.players.values())

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.lobbies: Dict[str, Lobby] = {}
        self.player_lobby_map: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        player_id = str(random.randint(1000, 9999))
        self.active_connections[player_id] = websocket
        await self.send_lobby_list()  # Send the updated lobby list to the new player
        return player_id

    def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            del self.active_connections[player_id]
        if player_id in self.player_lobby_map:
            lobby_id = self.player_lobby_map[player_id]
            if lobby_id in self.lobbies:
                del self.lobbies[lobby_id].players[player_id]
                del self.lobbies[lobby_id].game_state.players[player_id]
                if not self.lobbies[lobby_id].players:
                    del self.lobbies[lobby_id]
                del self.player_lobby_map[player_id]
                asyncio.create_task(self.send_lobby_list())  # Update lobby list after player leaves

    async def broadcast_lobby(self, lobby: Lobby):
        lobby_data = {
            "type": "lobby_update",
            "lobby_id": lobby.lobby_id,
            "status": lobby.status,
            "countdown": lobby.countdown,
            "players": [{
                "id": p.player_id,
                "name": p.name,
                "ready": p.ready,
                "score": p.score,
                "color": p.color
            } for p in lobby.players.values()],
            "round": lobby.game_state.round
        }
        print(lobby_data)
        print(self.active_connections)
        for ws in self.active_connections.values():
            await ws.send_json(lobby_data)

    async def handle_input(self, player_id: str, data: dict):
        print(f"Client | Player {player_id} requrested {data['type']}")
        if data["type"] == "new_lobby":
            lobby_id = str(random.randint(1000, 9999))
            lobby = Lobby(lobby_id)
            self.lobbies[lobby_id] = lobby
            self.player_lobby_map[player_id] = lobby_id
            await self.broadcast_lobby(lobby)
            await self.send_lobby_list()  # Update lobby list after creating a new lobby

        elif data["type"] == "join_lobby":
            lobby_id = data["lobbyId"]
            if lobby_id in self.lobbies:
                self.lobbies[lobby_id].add_player(player_id, "Player")
                self.player_lobby_map[player_id] = lobby_id
                await self.broadcast_lobby(self.lobbies[lobby_id])

        elif data["type"] == "player_ready":
            lobby_id = self.player_lobby_map.get(player_id)
            if lobby_id and lobby_id in self.lobbies:
                lobby = self.lobbies[lobby_id]
                player = lobby.players.get(player_id)
                if player:
                    player.ready = not player.ready
                    if lobby.all_ready() and lobby.status == "waiting":
                        lobby.status = "countdown"
                        asyncio.create_task(self.start_countdown(lobby))
                    await self.broadcast_lobby(lobby)

        elif data["type"] == "player_name":
            lobby_id = self.player_lobby_map.get(player_id)
            if lobby_id and lobby_id in self.lobbies:
                lobby = self.lobbies[lobby_id]
                player = lobby.players.get(player_id)
                if player:
                    player.name = data["name"][:15]
                    await self.broadcast_lobby(lobby)

        elif data["type"] == "player_input":
            lobby_id = self.player_lobby_map.get(player_id)
            if lobby_id and lobby_id in self.lobbies:
                lobby = self.lobbies[lobby_id]
                player = lobby.players.get(player_id)
                if player:
                    player.turning = data.get("direction")

    async def send_lobby_list(self):
        lobby_list = list(self.lobbies.keys())
        for ws in self.active_connections.values():

            for lobby in self.lobbies.values():
                await self.broadcast_lobby(lobby)

            #await ws.send_json({
            #    "type": "lobby_list",
            #    "lobbies": lobby_list
            #})

    async def start_countdown(self, lobby: Lobby):
        while lobby.countdown > 0 and lobby.status == "countdown":
            await asyncio.sleep(1)
            lobby.countdown -= 1
            await self.broadcast_lobby(lobby)
        
        if lobby.status == "countdown":
            lobby.status = "playing"
            lobby.game_state.reset_round()
            await self.broadcast_lobby(lobby)
            asyncio.create_task(self.run_game_round(lobby))

    async def run_game_round(self, lobby: Lobby):
        start_time = time.time()
        while lobby.status == "playing":
            game_active = lobby.game_state.update()
            await self.broadcast_game_state(lobby)
            
            if not game_active:
                lobby.status = "results"
                lobby.countdown = 8
                # Update scores
                for p in lobby.game_state.players.values():
                    if p.alive:
                        p.score += 1
                await self.broadcast_lobby(lobby)
                await asyncio.sleep(5)
                lobby.status = "countdown"
                lobby.countdown = 10
                lobby.game_state.reset_round()
                await self.start_countdown(lobby)
                break
            
            await asyncio.sleep(1/60)

    async def broadcast_game_state(self, lobby: Lobby):
        game_state = {
            "type": "game_state",
            "players": [{
                "x": p.x,
                "y": p.y,
                "direction": p.direction,
                "color": p.color,
                "curve": p.curve,
                "alive": p.alive,
                "ink": p.ink
            } for p in lobby.game_state.players.values()]
        }
        for player_id in lobby.players:
            if player_id in self.active_connections:
                await self.active_connections[player_id].send_json(game_state)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    player_id = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.handle_input(player_id, data)
    except WebSocketDisconnect:
        manager.disconnect(player_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
