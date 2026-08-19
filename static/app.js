let ws;
let currentPlayer = {
    name: '',
    isHost: false
};
let roomCode = '';
let countdownTimer = null;

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
        if (isHost) {
            roomCodeGroup.classList.add('hidden');
            roomCodeInput.value = '';
        } else {
            roomCodeGroup.classList.remove('hidden');
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
                document.getElementById('hostControls').classList.remove('hidden');
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
            card.classList.add('waiting');
            card.textContent = '';
        }

        const nameWrapper = document.createElement('div');
        nameWrapper.className = 'player-name-wrapper';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'player-name';
        nameDiv.textContent = player.name;

        nameWrapper.appendChild(nameDiv);

        if (player.isHost) {
            const crownBadge = document.createElement('span');
            crownBadge.className = 'host-badge';
            crownBadge.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>';
            nameWrapper.appendChild(crownBadge);
        }

        playerDiv.appendChild(card);
        playerDiv.appendChild(nameWrapper);
        playersContainer.appendChild(playerDiv);
    });

    // Update center area
    const result = document.getElementById('result');
    const status = document.getElementById('status');

    if (state.revealed) {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        const votes = state.players.filter(p => p.vote !== undefined).map(p => p.vote);
        if (votes.length > 0) {
            const avg = (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(1);
            result.textContent = avg;
            status.textContent = `Average: ${avg} | Votes: ${votes.join(', ')}`;
        }
    } else if (state.votingActive) {
        result.textContent = '?';
        const votedCount = state.players.filter(p => p.hasVoted || p.vote !== undefined).length;
        const allVoted = votedCount === state.players.length && state.players.length > 0;

        if (allVoted && !countdownTimer) {
            startRevealCountdown();
        } else if (!allVoted && countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            status.textContent = `Voting in progress (${votedCount}/${state.players.length})`;
        } else if (!countdownTimer) {
            status.textContent = `Voting in progress (${votedCount}/${state.players.length})`;
        }
    } else {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
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
        const startBtn = document.getElementById('startBtn');
        const revealBtn = document.getElementById('revealBtn');
        const resetBtn = document.getElementById('resetBtn');

        if (state.votingActive) {
            startBtn.classList.add('hidden');
        } else {
            startBtn.classList.remove('hidden');
        }

        if (state.votingActive && !state.revealed) {
            revealBtn.classList.remove('hidden');
        } else {
            revealBtn.classList.add('hidden');
        }

        if (state.revealed) {
            resetBtn.classList.remove('hidden');
        } else {
            resetBtn.classList.add('hidden');
        }
    }
}

function startRevealCountdown() {
    let countdown = 3;
    const status = document.getElementById('status');
    status.textContent = `Revealing in ${countdown}...`;

    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            status.textContent = `Revealing in ${countdown}...`;
        } else {
            clearInterval(countdownTimer);
            countdownTimer = null;
            ws.send(JSON.stringify({ type: 'reveal' }));
        }
    }, 1000);
}

// Host Controls
document.getElementById('startBtn').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'startVoting' }));
    document.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('selected'));
});

document.getElementById('revealBtn').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'reveal' }));
});

document.getElementById('resetBtn').addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'reset' }));
    document.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('selected'));
});

// Voting
document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const vote = parseInt(btn.dataset.vote);
        document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        ws.send(JSON.stringify({
            type: 'vote',
            data: { vote }
        }));
    });
});
