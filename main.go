package main

import (
	"crypto/rand"
	"log"
	"math/big"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Player struct {
	Name        string          `json:"name"`
	IsHost      bool            `json:"isHost"`
	IsSpectator bool            `json:"isSpectator"`
	Vote        *int            `json:"vote,omitempty"`
	Conn        *websocket.Conn `json:"-"`
	RoomCode    string          `json:"-"`
}

type Room struct {
	Code         string             `json:"code"`
	Players      map[string]*Player `json:"players"`
	VotingActive bool               `json:"votingActive"`
	Revealed     bool               `json:"revealed"`
	mu           sync.RWMutex
}

type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

var rooms = make(map[string]*Room)
var roomsMu sync.RWMutex

func main() {
	http.HandleFunc("/ws", handleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./static")))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()
	defer func() {
		if err := recover(); err != nil {
			log.Println("recovered from panic in handleWebSocket:", err)
		}
	}()

	var player *Player
	var room *Room

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			if player != nil && room != nil {
				removePlayer(room, player)
			}
			break
		}

		switch msg.Type {
		case "join":
			data, ok := msg.Data.(map[string]interface{})
			if !ok {
				continue
			}
			name, ok := data["name"].(string)
			if !ok {
				continue
			}
			isHost, ok := data["isHost"].(bool)
			if !ok {
				continue
			}
			isSpectator, _ := data["isSpectator"].(bool)
			roomCode, ok := data["roomCode"].(string)
			if !ok {
				continue
			}

			if roomCode == "" {
				roomCode = generateRoomCode()
			}

			room = getOrCreateRoom(roomCode)
			player = &Player{
				Name:        name,
				IsHost:      isHost,
				IsSpectator: isSpectator,
				Conn:        conn,
				RoomCode:    roomCode,
			}

			room.mu.Lock()
			room.Players[name] = player
			room.mu.Unlock()

			conn.WriteJSON(Message{
				Type: "joined",
				Data: map[string]interface{}{
					"roomCode": roomCode,
					"isHost":   isHost,
				},
			})

			broadcastRoomState(room)

		case "startVoting":
			if player != nil && player.IsHost && room != nil {
				room.mu.Lock()
				room.VotingActive = true
				room.Revealed = false
				for _, p := range room.Players {
					p.Vote = nil
				}
				room.mu.Unlock()
				broadcastRoomState(room)
			}

		case "vote":
			if player != nil && room != nil && room.VotingActive {
				data, ok := msg.Data.(map[string]interface{})
				if !ok {
					continue
				}
				voteVal, ok := data["vote"].(float64)
				if !ok {
					continue
				}
				vote := int(voteVal)
				room.mu.Lock()
				player.Vote = &vote

				// Check if all non-spectator players voted
				allVoted := true
				for _, p := range room.Players {
					if !p.IsSpectator && p.Vote == nil {
						allVoted = false
						break
					}
				}

				// Auto-reveal when all voted
				if allVoted {
					room.Revealed = true
				}
				room.mu.Unlock()
				broadcastRoomState(room)
			}

		case "reveal":
			if player != nil && player.IsHost && room != nil {
				room.mu.Lock()
				room.Revealed = true
				room.mu.Unlock()
				broadcastRoomState(room)
			}

		case "reset":
			if player != nil && player.IsHost && room != nil {
				room.mu.Lock()
				room.VotingActive = false
				room.Revealed = false
				for _, p := range room.Players {
					p.Vote = nil
				}
				room.mu.Unlock()
				broadcastRoomState(room)
			}
		}
	}
}

func getOrCreateRoom(code string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()

	if room, exists := rooms[code]; exists {
		return room
	}

	room := &Room{
		Code:    code,
		Players: make(map[string]*Player),
	}
	rooms[code] = room
	return room
}

func broadcastRoomState(room *Room) {
	room.mu.RLock()
	defer room.mu.RUnlock()

	players := make([]map[string]interface{}, 0)
	for _, p := range room.Players {
		playerData := map[string]interface{}{
			"name":   p.Name,
			"isHost": p.IsHost,
		}
		if room.Revealed && p.Vote != nil {
			playerData["vote"] = *p.Vote
		} else if p.Vote != nil {
			playerData["hasVoted"] = true
		}
		players = append(players, playerData)
	}

	msg := Message{
		Type: "roomState",
		Data: map[string]interface{}{
			"players":      players,
			"votingActive": room.VotingActive,
			"revealed":     room.Revealed,
		},
	}

	for _, p := range room.Players {
		p.Conn.WriteJSON(msg)
	}
}

func removePlayer(room *Room, player *Player) {
	room.mu.Lock()
	delete(room.Players, player.Name)
	isEmpty := len(room.Players) == 0
	room.mu.Unlock()

	if isEmpty {
		roomsMu.Lock()
		delete(rooms, room.Code)
		roomsMu.Unlock()
	} else {
		broadcastRoomState(room)
	}
}

func generateRoomCode() string {
	return randomString(8)
}

func randomString(n int) string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed ambiguous chars: I, O, 0, 1
	b := make([]byte, n)
	for i := range b {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		if err != nil {
			// Fallback to a simple timestamp-based code if crypto/rand fails
			return "FALLBACK"
		}
		b[i] = letters[num.Int64()]
	}
	return string(b)
}
