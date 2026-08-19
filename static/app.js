let ws;
let currentPlayer = {
    name: '',
    isHost: false
};
let roomCode = '';
let hasVoted = false;

// Join Screen Logic
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeGroup = document.getElementById('roomCodeGroup');
const roleBtns = document.querySelectorAll('.role-btn');

roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        roleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isHost = btn.dataset.role === 'host';
        roomCodeGroup.style.display = isHost ? 'none' : 'block';
        if (isHost) {
            roomCodeInput.value = '';
        }
    });
});

joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const isHost = document.querySelector('.role-btn.active').dataset.role === 'host';
    const enteredRoomCode = roomCodeInput.value.trim();

    if (!name) return;
    if (!isHost && !enteredRoomCode) {
        alert('Please enter a room code');
        return;
    }

    currentPlayer = { name, isHost };
    roomCode = enteredRoomCode;
    connectWebSocket();
});

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            data: {
                name: currentPlayer.name,
                isHost: currentPlayer.isHost,
                roomCode: roomCode
            }
        }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        console.log('WebSocket closed');
    };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'joined':
            roomCode = msg.data.roomCode;
            document.getElementById('joinScreen').style.display = 'none';
            document.getElementById('gameScreen').style.display = 'block';
            document.getElementById('displayRoomCode').textContent = roomCode;

            if (msg.data.isHost) {
                document.getElementById('hostControls').style.display = 'flex';
            }
            break;

        case 'roomState':
            updateRoomState(msg.data);
            break;
    }
}

function updateRoomState(state) {
    const playersContainer = document.getElementById('playersContainer');
    playersContainer.innerHTML = '';

    state.players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player ${player.isHost ? 'host' : ''}`;

        const card = document.createElement('div');
        card.className = 'card';

        if (state.revealed && player.vote !== undefined) {
            card.textContent = player.vote;
        } else if (player.hasVoted || player.vote !== undefined) {
            card.classList.add('voted');
            card.textContent = '✓';
        } else {
            card.classList.add('hidden');
            card.textContent = '?';
        }

        const nameDiv = document.createElement('div');
        nameDiv.className = 'player-name';
        nameDiv.textContent = player.name;

        playerDiv.appendChild(card);
        playerDiv.appendChild(nameDiv);
        playersContainer.appendChild(playerDiv);
    });

    // Update center area
    const result = document.getElementById('result');
    const status = document.getElementById('status');

    if (state.revealed) {
        const votes = state.players.filter(p => p.vote !== undefined).map(p => p.vote);
        if (votes.length > 0) {
            const avg = (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(1);
            result.textContent = avg;
            status.textContent = `Average: ${avg} | Votes: ${votes.join(', ')}`;
        }
    } else if (state.votingActive) {
        result.textContent = '?';
        const votedCount = state.players.filter(p => p.hasVoted || p.vote !== undefined).length;
        status.textContent = `Voting in progress (${votedCount}/${state.players.length})`;
    } else {
        result.textContent = '?';
        status.textContent = 'Waiting to start...';
    }

    // Show/hide vote panel
    const votePanel = document.getElementById('votePanel');
    if (state.votingActive && !state.revealed) {
        votePanel.classList.add('active');
    } else {
        votePanel.classList.remove('active');
    }

    // Update host controls
    if (currentPlayer.isHost) {
        document.getElementById('startBtn').style.display = state.votingActive ? 'none' : 'block';
        document.getElementById('revealBtn').style.display = state.votingActive && !state.revealed ? 'block' : 'none';
        document.getElementById('resetBtn').style.display = state.revealed ? 'block' : 'none';
    }
}

// Host Controls
document.getElementById('startBtn').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'startVoting' }));
    hasVoted = false;
    document.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('selected'));
});

document.getElementById('revealBtn').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'reveal' }));
});

document.getElementById('resetBtn').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'reset' }));
    hasVoted = false;
    document.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('selected'));
});

// Voting
document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (hasVoted) return;

        const vote = parseInt(btn.dataset.vote);
        document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        ws.send(JSON.stringify({
            type: 'vote',
            data: { vote }
        }));

        hasVoted = true;
    });
});
