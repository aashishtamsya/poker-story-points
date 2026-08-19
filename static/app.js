let ws;
let currentPlayer = {
    name: '',
    isHost: false
};
let roomCode = '';
let countdownTimer = null;
let emojiPickerTimer = null;

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
            document.getElementById('userName').textContent = currentPlayer.name;
            document.getElementById('userAvatar').textContent = currentPlayer.name.charAt(0).toUpperCase();

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

            // Add edit button for current player
            if (player.name === currentPlayer.name) {
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-vote-btn';
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    openVotePanelForEdit();
                };
                editBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span class="tooltip">Change my card</span>
                `;
                card.appendChild(editBtn);
            }
        } else if (player.hasVoted || player.vote !== undefined) {
            card.classList.add('voted');
            card.textContent = '✓';
        } else {
            card.classList.add('waiting');
            card.textContent = '';
        }

        const nameDiv = document.createElement('div');
        nameDiv.className = 'player-name';
        nameDiv.textContent = player.name;

        // Add emoji picker
        const emojiPicker = document.createElement('div');
        emojiPicker.className = 'emoji-picker';
        const emojis = ['🎯', '✈️', '🧻', '😂', '😊'];
        emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            btn.onclick = (e) => {
                e.stopPropagation();
                throwEmoji(emoji, emojiPicker, card);
                // Don't hide picker - allow rapid clicks
            };
            emojiPicker.appendChild(btn);
        });

        // Handle hover with auto-dismiss
        playerDiv.addEventListener('mouseenter', () => {
            showEmojiPicker(emojiPicker);
        });

        playerDiv.addEventListener('mouseleave', () => {
            startEmojiPickerDismissTimer(emojiPicker);
        });

        emojiPicker.addEventListener('mouseenter', () => {
            clearEmojiPickerTimer();
        });

        emojiPicker.addEventListener('mouseleave', () => {
            hideEmojiPicker(emojiPicker);
        });

        playerDiv.appendChild(emojiPicker);
        playerDiv.appendChild(card);
        playerDiv.appendChild(nameDiv);
        playersContainer.appendChild(playerDiv);
    });

    // Update center area and stats
    const result = document.getElementById('result');
    const bottomStats = document.getElementById('bottomStats');

    if (state.revealed) {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        const votes = state.players.filter(p => p.vote !== undefined).map(p => p.vote);
        if (votes.length > 0) {
            // Calculate mode (most common vote)
            const counts = {};
            votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
            const mode = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

            result.textContent = mode;

            // Show bottom stats
            updateBottomStats(votes, counts);
            bottomStats.classList.add('active');
        }
    } else if (state.votingActive) {
        result.textContent = '?';
        bottomStats.classList.remove('active');
        const votedCount = state.players.filter(p => p.hasVoted || p.vote !== undefined).length;
        const allVoted = votedCount === state.players.length && state.players.length > 0;

        if (allVoted && !countdownTimer) {
            startRevealCountdown();
        } else if (!allVoted && countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
    } else {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        result.textContent = '?';
        bottomStats.classList.remove('active');
    }

    // Show/hide vote panel (keep open after reveal if editing)
    const votePanel = document.getElementById('votePanel');
    if (state.votingActive && !state.revealed) {
        votePanel.classList.add('active');
    } else if (!state.revealed) {
        votePanel.classList.remove('active');
    }
    // Don't hide panel if revealed - let user keep it open to edit

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
    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            ws.send(JSON.stringify({ type: 'reveal' }));
        }
    }, 1000);
}

function updateBottomStats(votes, counts) {
    const voteDistribution = document.getElementById('voteDistribution');
    const agreementValue = document.getElementById('agreementValue');
    const averageValue = document.getElementById('averageValue');

    // Calculate stats
    const avg = (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(1);
    const maxCount = Math.max(...Object.values(counts));
    const agreement = ((maxCount / votes.length) * 100).toFixed(0);

    // Update values
    agreementValue.textContent = `${agreement}%`;
    averageValue.textContent = avg;

    // Render vote distribution bars
    voteDistribution.innerHTML = '';
    const allVotes = [0, 1, 2, 3, 5, 8, 13];
    allVotes.forEach(vote => {
        const count = counts[vote] || 0;
        const height = count > 0 ? (count / maxCount) * 100 : 0;

        const barDiv = document.createElement('div');
        barDiv.className = 'vote-bar';

        const barContainer = document.createElement('div');
        barContainer.className = 'bar-container';

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${height}%`;

        if (count > 0) {
            const barCount = document.createElement('span');
            barCount.className = 'bar-count';
            barCount.textContent = count;
            bar.appendChild(barCount);
        }

        barContainer.appendChild(bar);

        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = vote;

        barDiv.appendChild(barContainer);
        barDiv.appendChild(label);
        voteDistribution.appendChild(barDiv);
    });
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

// Open vote panel for editing after reveal
function openVotePanelForEdit() {
    const votePanel = document.getElementById('votePanel');
    votePanel.classList.add('active');
}

// Emoji picker show/hide functions
function showEmojiPicker(picker) {
    clearEmojiPickerTimer();
    picker.classList.add('visible');
    startEmojiPickerDismissTimer(picker);
}

function hideEmojiPicker(picker) {
    clearEmojiPickerTimer();
    picker.classList.remove('visible');
}

function startEmojiPickerDismissTimer(picker) {
    clearEmojiPickerTimer();
    emojiPickerTimer = setTimeout(() => {
        picker.classList.remove('visible');
    }, 3000);
}

function clearEmojiPickerTimer() {
    if (emojiPickerTimer) {
        clearTimeout(emojiPickerTimer);
        emojiPickerTimer = null;
    }
}

// Emoji throwing animation
function throwEmoji(emoji, sourcePicker, targetCard) {
    const flyingEmoji = document.createElement('div');
    flyingEmoji.className = 'flying-emoji';
    flyingEmoji.textContent = emoji;

    const sourceRect = sourcePicker.getBoundingClientRect();
    const targetRect = targetCard.getBoundingClientRect();

    // Start from center of picker
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;

    flyingEmoji.style.left = startX + 'px';
    flyingEmoji.style.top = startY + 'px';

    // Target center of card
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    const deltaX = targetX - startX;
    const deltaY = targetY - startY;

    flyingEmoji.style.setProperty('--mid-x', (deltaX * 0.5) + 'px');
    flyingEmoji.style.setProperty('--mid-y', (deltaY * 0.5 - 60) + 'px');
    flyingEmoji.style.setProperty('--target-x', deltaX + 'px');
    flyingEmoji.style.setProperty('--target-y', deltaY + 'px');

    document.body.appendChild(flyingEmoji);

    setTimeout(() => {
        flyingEmoji.remove();
    }, 800);
}
