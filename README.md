# Poker Story Points

Real-time collaborative story point estimation tool for agile teams. Teams gather around a virtual poker table to vote on story complexity using Fibonacci numbers (0, 1, 2, 3, 5, 8, 13).

## Features

- **Real-time Voting** - WebSocket-based instant synchronization across all participants
- **Auto-reveal** - Votes reveal automatically when all players submit, with 3-second countdown
- **Mode Calculation** - Shows most common vote (consensus) instead of average
- **Vote Editing** - Change your vote anytime before reveal, or edit after reveal if needed
- **Spectator Mode** - Join as observer without voting rights
- **Emoji Reactions** - Throw emojis at other players' cards with cinematic flying animations
- **Vote Distribution** - Visual bar chart showing how votes are spread
- **Agreement Metric** - Real-time percentage showing team consensus level
- **Dark Theme** - Premium glass-morphism UI with teal/orange accent colors

## Tech Stack

**Backend:**
- Go 1.x
- gorilla/websocket for real-time communication
- In-memory room management

**Frontend:**
- Vanilla JavaScript (no framework)
- CSS custom properties for theming
- WebSocket client
- Responsive design (desktop + mobile)

## Installation

```bash
# Clone repository
git clone https://github.com/aashishtamsya/poker-story-points.git
cd poker-story-points

# Install Go dependencies
go mod download

# Run server
go run main.go
```

Server starts on `http://localhost:8080`

## Usage

1. **Host creates room:**
   - Enter name
   - Select "Host" role
   - Click "Join Room"
   - Share room code with team

2. **Members join:**
   - Enter name
   - Select "Member" role
   - Enter room code
   - Click "Join Room"

3. **Spectators observe:**
   - Enter name
   - Select "Spectator" role
   - Enter room code
   - Watch without voting

4. **Voting flow:**
   - Host clicks "Start Voting"
   - All members select story points (0-13)
   - Auto-reveal triggers when everyone votes
   - View consensus mode and distribution
   - Host clicks "Reset" for next story

## Interactive Features

**Emoji Reactions:**
- Hover over any player's card
- Emoji picker appears
- Click emoji to throw from random screen edge
- Rapid-fire clicking supported

**Vote Changes:**
- Change vote anytime before reveal
- Click edit button on your revealed card to modify
- Countdown cancels if anyone changes vote

**Statistics Panel:**
- Vote distribution bar chart (0-13)
- Agreement percentage (consensus strength)
- Average vote (reference only)

## Architecture

```
main.go              # WebSocket server, room management
static/
  index.html         # UI + CSS
  app.js            # Client logic, WebSocket, animations
go.mod               # Go dependencies
```

**Message Types:**
- `join` - Player joins room
- `startVoting` - Host initiates voting round
- `vote` - Player submits/changes vote
- `reveal` - Manual or auto-reveal votes
- `reset` - Host resets for next story
- `roomState` - Server broadcasts current state

## Design System

- **Primary:** Teal (#0D9488)
- **Accent:** Orange (#EA580C)
- **Background:** Dark navy (#0a0e14)
- **Typography:** Inter (sans-serif)
- **Style:** Flat design with glass-morphism accents
- **Motion:** Cubic bezier easing, 200-300ms transitions

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Android 90+

## License

MIT
