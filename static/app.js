let ws;
let currentPlayer = {
    name: '',
    isHost: false,
    isSpectator: false
};
let roomCode = '';
let countdownTimer = null;
let confettiFired = false;

// Join Screen Logic
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeGroup = document.getElementById('roomCodeGroup');
const roleBtns = document.querySelectorAll('.role-btn');

// Parse URL params for direct room join
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
const urlRole = urlParams.get('role');

if (urlRoom) {
    roomCodeInput.value = urlRoom;
    roomCodeGroup.classList.remove('hidden');

    // Hide Host button when joining via shared link
    const hostBtn = document.querySelector('.role-btn[data-role="host"]');
    if (hostBtn) {
        hostBtn.style.display = 'none';
    }

    if (urlRole === 'member' || urlRole === 'spectator') {
        roleBtns.forEach(b => {
            b.classList.remove('active');
            if (b.dataset.role === urlRole) {
                b.classList.add('active');
            }
        });
    } else {
        // Default to member if room provided but no valid role
        roleBtns.forEach(b => {
            b.classList.remove('active');
            if (b.dataset.role === 'member') {
                b.classList.add('active');
            }
        });
    }
    nameInput.focus();
}

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
    const role = document.querySelector('.role-btn.active').dataset.role;
    const isHost = role === 'host';
    const isSpectator = role === 'spectator';
    const enteredRoomCode = roomCodeInput.value.trim();

    if (!name) return;
    if (!isHost && !enteredRoomCode) {
        alert('Please enter a room code');
        return;
    }

    currentPlayer = { name, isHost, isSpectator };
    roomCode = enteredRoomCode;
    connectWebSocket();
});

// Share Modal Logic
const shareBtn = document.getElementById('shareBtn');
const shareModal = document.getElementById('shareModal');
const closeShareModal = document.getElementById('closeShareModal');
const memberLinkInput = document.getElementById('memberLinkInput');
const spectatorLinkInput = document.getElementById('spectatorLinkInput');

shareBtn?.addEventListener('click', () => {
    shareModal.classList.add('active');
});

closeShareModal?.addEventListener('click', () => {
    shareModal.classList.remove('active');
});

shareModal?.addEventListener('click', (e) => {
    if (e.target === shareModal) {
        shareModal.classList.remove('active');
    }
});

// Copy button handlers
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);

        try {
            await navigator.clipboard.writeText(input.value);
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');

            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            input.select();
            document.execCommand('copy');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy';
            }, 2000);
        }
    });
});

function generateShareLinks(roomCode) {
    const baseUrl = window.location.origin;
    const memberLink = `${baseUrl}/?room=${roomCode}&role=member`;
    const spectatorLink = `${baseUrl}/?room=${roomCode}&role=spectator`;

    memberLinkInput.value = memberLink;
    spectatorLinkInput.value = spectatorLink;
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            data: {
                name: currentPlayer.name,
                isHost: currentPlayer.isHost,
                isSpectator: currentPlayer.isSpectator,
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
                document.getElementById('shareBtn').classList.remove('hidden');
                generateShareLinks(roomCode);
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
        const isCurrentPlayer = player.name === currentPlayer.name;
        playerDiv.className = `player ${player.isHost ? 'host' : ''} ${isCurrentPlayer ? 'current-player' : ''}`;

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
        nameDiv.textContent = isCurrentPlayer ? `${player.name} (You)` : player.name;

        // Add emoji picker for other players (no flying animation, just tooltip)
        if (player.name !== currentPlayer.name) {
            const emojiPicker = document.createElement('div');
            emojiPicker.className = 'emoji-picker';
            const emojis = ['🎯', '✈️', '🧻', '😂', '😊'];
            emojis.forEach(emoji => {
                const btn = document.createElement('button');
                btn.className = 'emoji-btn';
                btn.textContent = emoji;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    // Just visual feedback on target card - no flying animation
                    showEmojiOnCard(emoji, card);
                };
                emojiPicker.appendChild(btn);
            });
            playerDiv.appendChild(emojiPicker);
        }

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

            // Check for unanimous vote (excluding spectators)
            const nonSpectatorVotes = state.players.filter(p => !p.isSpectator && p.vote !== undefined);
            const isUnanimous = nonSpectatorVotes.length > 1 &&
                                nonSpectatorVotes.every(p => p.vote === nonSpectatorVotes[0].vote);

            // Trigger confetti on unanimous vote (once per reveal)
            if (isUnanimous && !confettiFired) {
                confettiFired = true;
                triggerConfetti();
            }

            // Show stats
            updateBottomStats(votes, counts);
            bottomStats.classList.add('active');
            document.getElementById('cornerStats').classList.add('active');
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
        document.getElementById('cornerStats').classList.remove('active');
        confettiFired = false; // Reset for next round
    }

    // Show/hide vote panel (keep open after reveal if editing, hide for spectators)
    const votePanel = document.getElementById('votePanel');
    if (!currentPlayer.isSpectator && state.votingActive && !state.revealed) {
        votePanel.classList.add('active');
    } else if (!state.revealed) {
        votePanel.classList.remove('active');
    }
    // Don't hide panel if revealed - let user keep it open to edit

    // Restore selected vote button state
    const currentPlayerData = state.players.find(p => p.name === currentPlayer.name);
    if (currentPlayerData && currentPlayerData.vote !== undefined) {
        document.querySelectorAll('.vote-btn').forEach(btn => {
            if (parseInt(btn.dataset.vote) === currentPlayerData.vote) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
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

    // Render vote distribution bars (only show votes with count > 0)
    voteDistribution.innerHTML = '';
    const allVotes = [0, 1, 2, 3, 5, 8, 13];
    allVotes.forEach(vote => {
        const count = counts[vote] || 0;

        // Skip if no one voted for this number
        if (count === 0) return;

        const height = (count / maxCount) * 100;

        const barDiv = document.createElement('div');
        barDiv.className = 'vote-bar';

        const barContainer = document.createElement('div');
        barContainer.className = 'bar-container';

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${height}%`;

        const barCount = document.createElement('span');
        barCount.className = 'bar-count';
        barCount.textContent = count;
        bar.appendChild(barCount);

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

// Confetti celebration on unanimous vote
function triggerConfetti() {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 999999 };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        // Burst from center with random colors
        confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.4, 0.6), y: Math.random() - 0.2 },
            colors: ['#0D9488', '#EA580C', '#14B8A6', '#F97316']
        });
    }, 250);
}


// Show emoji briefly on target card (simple feedback, no flying)
function showEmojiOnCard(emoji, card) {
    const emojiEl = document.createElement('div');
    emojiEl.textContent = emoji;
    emojiEl.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 48px;
        pointer-events: none;
        z-index: 100;
        animation: emoji-pop 800ms ease-out forwards;
    `;
    card.appendChild(emojiEl);
    
    setTimeout(() => emojiEl.remove(), 800);
}
