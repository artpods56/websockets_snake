from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import json
import random
from typing import Dict, List
import asyncio
import math

app = FastAPI()
app.mount("/static", StaticFiles(directory="static", html=True), name="static")


class Player:
    def __init__(self, player_id, x, y, direction, color):
        self.player_id = player_id
        self.x = x
        self.y = y
        self.turning = None
        self.direction = direction
        self.color = color
        self.curve = [(x, y)]
        self.speed = 2
        self.radius = 5
        self.alive = True
        self.ink = 250
        self.reload_time = 100

class GameState:
    def __init__(self):
        self.players: Dict[str, Player] = {}
        self.width = 800
        self.height = 600
        self.colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF"]
        
    def add_player(self, player_id: str):
        if len(self.players) >= 6:
           return
        
        x = random.randint(50, self.width - 50)
        y = random.randint(50, self.height - 50)
        direction = random.uniform(0, 2 * math.pi)
        color = self.colors[len(self.players)]

        self.players[player_id] = Player(player_id, x, y, direction, color)
    
    def update_player_direction(self, player_id: str, direction: str):
        player = self.players.get(player_id)
        if player:
            if direction == "left":
                player.turning = 'left'
            elif direction == "right":
                player.turning = 'right'
            else:
                player.turning = None  # Stop turning

    def update(self):
        for player in self.players.values():
            if player.alive:

                if player.turning == 'left':
                    player.direction -= 0.05
                elif player.turning == "right":
                    player.direction += 0.05

                new_x = player.x + player.speed * math.cos(player.direction)
                new_y = player.y + player.speed * math.sin(player.direction)
                if player.ink > 0:
                    player.curve.append((player.x,player.y))
                player.ink -= 1
                
                if player.ink == -player.reload_time:
                    player.ink = 250
                    
                

                #collision with edges
                if new_x < 0 + player.radius or new_x > self.width - player.radius or new_y < 0 + player.radius or new_y > self.height - player.radius :
                    player.direction = player.direction - 180
                    print("Player collision with edge")
                    #player.alive = False

                #collision with self
                for point in player.curve[:-10]:
                    dist = math.sqrt((new_x - point[0])**2 + (new_y- point[1])**2)
                    if dist < player.radius:
                        print("Player collision with edge")
                        player.direction = player.direction - 180
                         #player.alive = False
                         #break
                
                if player.alive:
                    player.x = new_x
                    player.y = new_y

                #collision with other players
                for other_player in self.players.values():
                    if other_player.player_id != player.player_id and other_player.alive:
                        for point in other_player.curve:
                            dist = math.sqrt((new_x - point[0])**2 + (new_y- point[1])**2)
                            if dist < player.radius:
                                print("Player collision with other player")
                                player.direction = - player.direction
                                #player.alive = False
                                #break
                        
                        if not player.alive:

                            break
    def get_state(self):
        """Returns a simplified game state to be sent to clients"""
        player_states = {}
        for player_id, player in self.players.items():
            player_states[player_id] = {
                "x": player.x,
                "y": player.y,
                "direction": player.direction,
                "color": player.color,
                "curve": player.curve,
                "alive": player.alive,
                "ink": player.ink
            }
        return {
            "players": player_states,
             "width": self.width,
            "height": self.height
        }
    
    def reset(self):
      print("reset")
      for player in self.players.values():
        x = random.randint(50, self.width - 50)
        y = random.randint(50, self.height - 50)
        direction = random.uniform(0, 2 * math.pi)
        player.x = x
        player.y = y
        player.direction = direction
        player.curve = [(x,y)]
        player.alive = True
        player.ink = 250

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.lobbies: Dict[str, GameState] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        player_id = str(random.randint(1000, 9999))
        self.active_connections[player_id] = websocket
        print(f"Connected player with id: {player_id}")
        return player_id
    
    def disconnect(self, player_id: str):
        if player_id in self.active_connections:
            del self.active_connections[player_id]
            print(f"Disonnected player with id: {player_id}")
            for lobby_id, game_state in self.lobbies.items():
              if player_id in game_state.players:
                del game_state.players[player_id]

    async def broadcast_state(self, lobby_id: str):
      """Broadcast game state to all connected players in a lobby"""
      if lobby_id in self.lobbies:
          game_state = self.lobbies[lobby_id]
          if game_state.players:
              state = game_state.get_state()
              for player_id, connection in self.active_connections.items():
                    if player_id in game_state.players:
                        await connection.send_json({"type": "game_state", "state":state})

    async def send_lobbies(self):
        """Broadcast a list of lobbies to all connected players"""
        lobby_list = list(self.lobbies.keys())
        for connection in self.active_connections.values():
            await connection.send_json({"type": "lobbies", "lobbies": lobby_list})


    async def handle_input(self, player_id: str, data: dict, websocket: WebSocket):
      if data.get("type") == "get_lobbies":
          await self.send_lobbies()

      elif data.get("type") == "new_lobby":
            lobby_id = str(random.randint(100000,999999))
            self.lobbies[lobby_id] = GameState()
            await self.send_lobbies()
      elif data.get("type") == "join_lobby":
          lobby_id = data.get("lobbyId")
          if lobby_id in self.lobbies:
            self.lobbies[lobby_id].add_player(player_id)
            await self.broadcast_state(lobby_id)
      
      elif data.get("type") == "input" and data.get("lobbyId"):
        lobby_id = data.get("lobbyId")
        if data.get("direction"):
           self.lobbies[lobby_id].update_player_direction(player_id,data.get("direction"))
        if data.get("reset"):
             self.lobbies[lobby_id].reset()
       
    
manager = ConnectionManager()

async def game_loop():
    while True:
      for lobby_id in manager.lobbies:
        manager.lobbies[lobby_id].update()
        await manager.broadcast_state(lobby_id)
      await asyncio.sleep(1/60)  # 60 FPS

@app.websocket("/ws/game")
async def websocket_endpoint(websocket: WebSocket):
    player_id = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.handle_input(player_id,data, websocket)
    except WebSocketDisconnect:
        manager.disconnect(player_id)


@app.on_event("startup")
async def startup_event():
  asyncio.create_task(game_loop())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
