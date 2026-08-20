package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// --- randomString / generateRoomCode (issue #10-ish, room code generation) ---

func TestRandomStringCharsetAndLength(t *testing.T) {
	const allowed = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for _, n := range []int{0, 1, 8, 16} {
		s := randomString(n)
		if len(s) != n {
			t.Errorf("randomString(%d) length = %d, want %d", n, len(s), n)
		}
		for _, c := range s {
			if !strings.ContainsRune(allowed, c) {
				t.Errorf("randomString(%d) produced disallowed char %q", n, c)
			}
		}
	}
}

func TestGenerateRoomCode(t *testing.T) {
	code := generateRoomCode()
	if len(code) != 8 {
		t.Errorf("generateRoomCode() length = %d, want 8", len(code))
	}
}

// --- checkOrigin (issue #13) ---

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name          string
		origin        string
		host          string
		allowedOrigin string
		want          bool
	}{
		{"no origin header allowed", "", "example.com", "", true},
		{"same host allowed", "http://example.com", "example.com", "", true},
		{"different host denied", "http://evil.com", "example.com", "", false},
		{"invalid origin denied", "://bad-url", "example.com", "", false},
		{"allowlisted origin allowed", "http://evil.com", "example.com", "http://evil.com", true},
		{"not in allowlist denied", "http://evil.com", "example.com", "http://good.com,http://other.com", false},
		{"same host ignored when allowlist set", "http://example.com", "example.com", "http://good.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.allowedOrigin != "" {
				os.Setenv("ALLOWED_ORIGIN", tt.allowedOrigin)
				defer os.Unsetenv("ALLOWED_ORIGIN")
			} else {
				os.Unsetenv("ALLOWED_ORIGIN")
			}

			r := httptest.NewRequest(http.MethodGet, "http://"+tt.host+"/ws", nil)
			r.Host = tt.host
			if tt.origin != "" {
				r.Header.Set("Origin", tt.origin)
			}

			got := checkOrigin(r)
			if got != tt.want {
				t.Errorf("checkOrigin() = %v, want %v", got, tt.want)
			}
		})
	}
}

// --- room bookkeeping ---

func TestGetOrCreateRoom(t *testing.T) {
	code := "ROOMTEST1"
	r1 := getOrCreateRoom(code)
	r2 := getOrCreateRoom(code)
	if r1 != r2 {
		t.Error("getOrCreateRoom() returned different rooms for the same code")
	}
	if r1.Code != code {
		t.Errorf("room.Code = %q, want %q", r1.Code, code)
	}
	roomsMu.Lock()
	delete(rooms, code)
	roomsMu.Unlock()
}

func TestRemovePlayerDeletesEmptyRoom(t *testing.T) {
	code := "ROOMTEST2"
	room := getOrCreateRoom(code)
	p := &Player{ID: "p1", RoomCode: code}
	room.Players[p.ID] = p

	removePlayer(room, p)

	roomsMu.RLock()
	_, exists := rooms[code]
	roomsMu.RUnlock()
	if exists {
		t.Error("removePlayer() did not delete the room after the last player left")
	}
}

func TestRemovePlayerKeepsNonEmptyRoom(t *testing.T) {
	// Use real websocket connections so broadcastRoomState (invoked by
	// removePlayer for a non-empty room) can write without panicking.
	client1, client2, closeFn := dialTwoTestClients(t)
	defer closeFn()

	code := "ROOMTEST3"
	room := getOrCreateRoom(code)
	p1 := &Player{ID: "p1", RoomCode: code, Conn: client1}
	p2 := &Player{ID: "p2", RoomCode: code, Conn: client2}
	room.Players[p1.ID] = p1
	room.Players[p2.ID] = p2

	removePlayer(room, p1)

	roomsMu.RLock()
	_, exists := rooms[code]
	roomsMu.RUnlock()
	if !exists {
		t.Error("removePlayer() deleted a room that still has players")
	}
	if len(room.Players) != 1 {
		t.Errorf("room.Players length = %d, want 1", len(room.Players))
	}
}

// dialTwoTestClients spins up a bare echo-less websocket server (just enough
// to accept the upgrade) and returns two connected client-side conns whose
// server-side peers stay open for the duration of the test.
func dialTwoTestClients(t *testing.T) (c1, c2 *websocket.Conn, closeFn func()) {
	t.Helper()
	var upg websocket.Upgrader
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upg.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		// Block until the client closes, so the handler goroutine (and
		// its connection) doesn't outlive the test.
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	c1 = dialWS(t, wsURL)
	c2 = dialWS(t, wsURL)
	return c1, c2, func() {
		c1.Close()
		c2.Close()
		srv.Close()
	}
}

// --- concurrent broadcast regression test (issue #11 fix) ---

func TestBroadcastRoomStateConcurrent(t *testing.T) {
	client1, client2, closeFn := dialTwoTestClients(t)
	defer closeFn()

	code := "ROOMTEST4"
	room := getOrCreateRoom(code)
	defer func() {
		roomsMu.Lock()
		delete(rooms, code)
		roomsMu.Unlock()
	}()
	room.Players["p1"] = &Player{ID: "p1", RoomCode: code, Conn: client1}
	room.Players["p2"] = &Player{ID: "p2", RoomCode: code, Conn: client2}

	// Drain reads so client-side buffers don't block, and so the race
	// detector sees concurrent writers hitting the same connections.
	drain := func(c *websocket.Conn) {
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				return
			}
		}
	}
	go drain(client1)
	go drain(client2)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			broadcastRoomState(room)
		}()
	}
	wg.Wait()
}

// --- end-to-end join/vote/reveal/reset flow over a real websocket ---

func dialWS(t *testing.T, wsURL string) *websocket.Conn {
	t.Helper()
	c, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return c
}

func readMsg(t *testing.T, c *websocket.Conn, wantType string) Message {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		var m Message
		if err := c.ReadJSON(&m); err != nil {
			t.Fatalf("read message (want %q): %v", wantType, err)
		}
		if m.Type == wantType {
			return m
		}
	}
}

func TestIntegrationJoinVoteRevealReset(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	host := dialWS(t, wsURL)
	defer host.Close()

	if err := host.WriteJSON(Message{Type: "join", Data: map[string]interface{}{
		"name": "Alice", "roomCode": "",
	}}); err != nil {
		t.Fatalf("host join: %v", err)
	}
	joined := readMsg(t, host, "joined")
	joinedData := joined.Data.(map[string]interface{})
	if isHost, _ := joinedData["isHost"].(bool); !isHost {
		t.Error("first joiner should be host")
	}
	roomCode, _ := joinedData["roomCode"].(string)
	if roomCode == "" {
		t.Fatal("expected a non-empty roomCode")
	}
	readMsg(t, host, "roomState")

	guest := dialWS(t, wsURL)
	defer guest.Close()
	if err := guest.WriteJSON(Message{Type: "join", Data: map[string]interface{}{
		"name": "Bob", "roomCode": roomCode,
	}}); err != nil {
		t.Fatalf("guest join: %v", err)
	}
	guestJoined := readMsg(t, guest, "joined")
	if isHost, _ := guestJoined.Data.(map[string]interface{})["isHost"].(bool); isHost {
		t.Error("second joiner should not be host")
	}
	readMsg(t, guest, "roomState")
	readMsg(t, host, "roomState") // host also sees guest join

	// Invalid name is rejected with an error message (issue #15).
	badGuest := dialWS(t, wsURL)
	defer badGuest.Close()
	badGuest.WriteJSON(Message{Type: "join", Data: map[string]interface{}{
		"name": "", "roomCode": roomCode,
	}})
	errMsg := readMsg(t, badGuest, "error")
	if errMsg.Data.(map[string]interface{})["message"] == "" {
		t.Error("expected a non-empty error message for invalid name")
	}

	if err := host.WriteJSON(Message{Type: "startVoting"}); err != nil {
		t.Fatalf("startVoting: %v", err)
	}
	readMsg(t, host, "roomState")
	readMsg(t, guest, "roomState")

	if err := host.WriteJSON(Message{Type: "vote", Data: map[string]interface{}{"vote": 5.0}}); err != nil {
		t.Fatalf("host vote: %v", err)
	}
	readMsg(t, host, "roomState")
	readMsg(t, guest, "roomState")

	if err := guest.WriteJSON(Message{Type: "vote", Data: map[string]interface{}{"vote": 8.0}}); err != nil {
		t.Fatalf("guest vote: %v", err)
	}
	// All (non-spectator) players voted -> auto-reveal.
	var revealedState map[string]interface{}
	for {
		m := readMsg(t, host, "roomState")
		revealedState = m.Data.(map[string]interface{})
		if revealed, _ := revealedState["revealed"].(bool); revealed {
			break
		}
	}
	if revealed, _ := revealedState["revealed"].(bool); !revealed {
		t.Error("expected room to be auto-revealed once all players voted")
	}
	readMsg(t, guest, "roomState")

	if err := host.WriteJSON(Message{Type: "reset"}); err != nil {
		t.Fatalf("reset: %v", err)
	}
	var resetState map[string]interface{}
	for {
		m := readMsg(t, host, "roomState")
		resetState = m.Data.(map[string]interface{})
		if votingActive, _ := resetState["votingActive"].(bool); !votingActive {
			break
		}
	}
	if revealed, _ := resetState["revealed"].(bool); revealed {
		t.Error("expected revealed to be false after reset")
	}

	roomsMu.Lock()
	delete(rooms, roomCode)
	roomsMu.Unlock()
}
