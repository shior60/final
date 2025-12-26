/**
 * 1132916 - FinalTerm 完美基礎格線版
 */

const BOARD_SIZE = 9;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const KOMI = 7.5;

let boardState = [];
let deadStonesSet = new Set();
let capturedSet = new Set(); 
let currentPlayer = BLACK;
let previousBoardJson = null;
let isAiProcessing = false;
let isGameOver = false;
let passCount = 0;
let captures = { [BLACK]: 0, [WHITE]: 0 };
let lastTerritoryInfo = { black: [], white: [] };

function resetGame() {
    boardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
    deadStonesSet.clear();
    capturedSet.clear();
    lastTerritoryInfo = { black: [], white: [] };
    captures = { [BLACK]: 0, [WHITE]: 0 };
    passCount = 0;
    previousBoardJson = null;
    isAiProcessing = false;
    isGameOver = false;
    
    const hcp = parseInt(document.getElementById('handicap-select').value) || 0;
    applyHandicap(hcp);
    currentPlayer = (hcp > 0) ? WHITE : BLACK;
    
    renderBoard();
    updateStatus();
    document.getElementById('result-display').style.display = "none";
    document.getElementById('hint').style.display = "none";
    showMessage(hcp > 0 ? `讓子棋開始 (${hcp}子)` : "黑棋先行");
}

// === 您原封不動的邏輯代碼開始 ===

function applyHandicap(n) {
    const pts = {
        2: [[2, 6], [6, 2]],
        4: [[2, 2], [2, 6], [6, 2], [6, 6]],
        9: [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4], [2, 4], [6, 4], [4, 2], [4, 6]]
    };
    if (pts[n]) pts[n].forEach(([r, c]) => { boardState[r][c] = BLACK; });
}

function handleMove(r, c) {
    if (isGameOver) {
        if (boardState[r][c] !== EMPTY) toggleDeadStone(r, c);
        return;
    }
    if (isAiProcessing || capturedSet.size > 0) return;
    const result = attemptMove(boardState, r, c, currentPlayer, previousBoardJson);
    if (result.success) {
        processMoveResult(result);
    } else if (result.msg) showMessage(result.msg);
}

function processMoveResult(result) {
    previousBoardJson = JSON.stringify(boardState);
    if (result.capturedCoords.length > 0) {
        result.capturedCoords.forEach(coord => capturedSet.add(coord));
        renderBoard(); 
        setTimeout(() => {
            boardState = result.newBoard;
            captures[currentPlayer] += result.captured;
            capturedSet.clear();
            finishTurn();
        }, 500); 
    } else {
        boardState = result.newBoard;
        finishTurn();
    }
}

function finishTurn() {
    currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
    passCount = 0;
    renderBoard();
    updateStatus();
    const mode = document.getElementById('game-mode').value;
    if (mode === 'PvC' && currentPlayer === WHITE && !isGameOver) {
        checkAiTurn();
    }
}

function attemptMove(board, r, c, player, prevJson) {
    if (board[r][c] !== EMPTY) return { success: false, msg: "" };
    let nextBoard = JSON.parse(JSON.stringify(board));
    nextBoard[r][c] = player;
    let capturedCount = 0;
    let capturedCoords = [];
    const opponent = (player === BLACK) ? WHITE : BLACK;
    getNeighbors(r, c).forEach(([nR, nC]) => {
        if (nextBoard[nR][nC] === opponent) {
            const group = findGroup(nextBoard, nR, nC);
            if (countLiberties(nextBoard, group) === 0) {
                group.forEach(p => { 
                    nextBoard[p.r][p.c] = EMPTY; 
                    capturedCount++; 
                    capturedCoords.push(`${p.r},${p.c}`);
                });
            }
        }
    });
    const myGroup = findGroup(nextBoard, r, c);
    if (capturedCount === 0 && countLiberties(nextBoard, myGroup) === 0) return { success: false, msg: "禁著點 (自殺)" };
    if (JSON.stringify(nextBoard) === prevJson) return { success: false, msg: "打劫" };
    return { success: true, newBoard: nextBoard, captured: capturedCount, capturedCoords };
}

function markDeadStonesAuto() {
    deadStonesSet.clear();
    const groups = getAllGroups(boardState);
    for (const group of groups) {
        const color = boardState[group[0].r][group[0].c];
        const libs = countLiberties(boardState, group);
        if (libs <= 2) {
            let isSeki = false;
            getLibertyCoords(boardState, group).forEach(libKey => {
                let [r, c] = libKey.split(',').map(Number);
                getNeighbors(r, c).forEach(([nR, nC]) => {
                    if (boardState[nR][nC] !== EMPTY && boardState[nR][nC] !== color) {
                        if (countLiberties(boardState, findGroup(boardState, nR, nC)) <= 2) isSeki = true;
                    }
                });
            });
            if (isSeki) continue;
        }
        if (libs < 2) group.forEach(p => deadStonesSet.add(`${p.r},${p.c}`));
    }
}

function calculateTerritory(board) {
    let bTerr = 0, wTerr = 0, visited = new Set();
    lastTerritoryInfo = { black: [], white: [] };
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === EMPTY && !visited.has(`${r},${c}`)) {
                const area = floodFill(board, r, c);
                area.coords.forEach(k => visited.add(k));
                if (area.owner === BLACK) {
                    bTerr += area.size;
                    lastTerritoryInfo.black.push(...area.coords);
                } else if (area.owner === WHITE) {
                    wTerr += area.size;
                    lastTerritoryInfo.white.push(...area.coords);
                }
            }
        }
    }
    return { black: bTerr, white: wTerr };
}

function floodFill(board, r, c) {
    let queue = [[r, c]], coords = new Set(), size = 0, neighborsSeen = new Set();
    coords.add(`${r},${c}`);
    let i = 0;
    while(i < queue.length) {
        let [currR, currC] = queue[i++];
        size++;
        getNeighbors(currR, currC).forEach(([nR, nC]) => {
            if (board[nR][nC] === EMPTY) {
                if (!coords.has(`${nR},${nC}`)) { coords.add(`${nR},${nC}`); queue.push([nR, nC]); }
            } else neighborsSeen.add(board[nR][nC]);
        });
    }
    let owners = Array.from(neighborsSeen);
    let owner = (owners.length === 1) ? owners[0] : null;
    return { size, owner, coords: Array.from(coords) };
}

// === 修復格線生成的地方 ===
function renderBoard() {
    // 🔴 僅在這裡加入格線繪製
    const gridLayer = document.getElementById('grid-layer');
    if (gridLayer.innerHTML === '') {
        for(let i=0; i<81; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line';
            gridLayer.appendChild(line);
        }
    }

    const el = document.getElementById('board'); 
    el.innerHTML = '';
    const bTerrSet = new Set(lastTerritoryInfo.black);
    const wTerrSet = new Set(lastTerritoryInfo.white);

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.onclick = () => handleMove(r, c);
            const val = boardState[r][c];
            const coordKey = `${r},${c}`;
            if (val !== EMPTY || capturedSet.has(coordKey)) {
                const s = document.createElement('div');
                const actualColor = capturedSet.has(coordKey) ? (currentPlayer === BLACK ? WHITE : BLACK) : val;
                s.className = `stone ${actualColor === BLACK ? 'black' : 'white'}`;
                if (capturedSet.has(coordKey)) s.classList.add('captured');
                if (countLiberties(boardState, findGroup(boardState, r, c)) === 1) s.classList.add('atari-warn');
                if (deadStonesSet.has(coordKey)) s.style.opacity = "0.4";
                cell.appendChild(s);
            } else if (isGameOver) {
                if (bTerrSet.has(coordKey)) {
                    const marker = document.createElement('div');
                    marker.className = 'territory-marker territory-black';
                    cell.appendChild(marker);
                } else if (wTerrSet.has(coordKey)) {
                    const marker = document.createElement('div');
                    marker.className = 'territory-marker territory-white';
                    cell.appendChild(marker);
                }
            }
            el.appendChild(cell);
        }
    }
}

// 其餘邏輯 (AI, 輔助工具等)
function checkAiTurn() { isAiProcessing = true; updateStatus(); setTimeout(computerPlay, 600); }
function computerPlay() { if (isGameOver) return; let moves = []; for (let r = 0; r < 9; r++) { for (let c = 0; c < 9; c++) { const res = attemptMove(boardState, r, c, WHITE, previousBoardJson); if (res.success) { let score = res.captured * 50; score -= (Math.abs(r - 4) + Math.abs(c - 4)); moves.push({ r, c, score, result: res }); } } } if (moves.length > 0) { moves.sort((a, b) => b.score - a.score); isAiProcessing = false; processMoveResult(moves[0].result); } else { isAiProcessing = false; handlePass(); } }
function getNeighbors(r, c) { let n = []; if (r > 0) n.push([r-1, c]); if (r < BOARD_SIZE-1) n.push([r+1, c]); if (c > 0) n.push([r, c-1]); if (c < BOARD_SIZE-1) n.push([r, c+1]); return n; }
function findGroup(board, r, c) { const color = board[r][c], group = [], queue = [[r, c]], visited = new Set(); visited.add(`${r},${c}`); let i = 0; while(i < queue.length) { let [currR, currC] = queue[i++]; group.push({r: currR, c: currC}); getNeighbors(currR, currC).forEach(([nR, nC]) => { if (!visited.has(`${nR},${nC}`) && board[nR][nC] === color) { visited.add(`${nR},${nC}`); queue.push([nR, nC]); } }); } return group; }
function getAllGroups(board) { let groups = [], visited = new Set(); for (let r = 0; r < BOARD_SIZE; r++) { for (let c = 0; c < BOARD_SIZE; c++) { if (board[r][c] !== EMPTY && !visited.has(`${r},${c}`)) { const g = findGroup(board, r, c); g.forEach(p => visited.add(`${p.r},${p.c}`)); groups.push(g); } } } return groups; }
function countLiberties(board, group) { return getLibertyCoords(board, group).size; }
function getLibertyCoords(board, group) { let libs = new Set(); group.forEach(p => { getNeighbors(p.r, p.c).forEach(([nR, nC]) => { if (board[nR][nC] === EMPTY) libs.add(`${nR},${nC}`); }); }); return libs; }
function handlePass() { passCount++; showMessage(`${currentPlayer === BLACK ? '黑棋' : '白棋'} Pass`); if (passCount >= 2) endGame(); else { currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK; updateStatus(); const mode = document.getElementById('game-mode').value; if (mode === 'PvC' && currentPlayer === WHITE) checkAiTurn(); } }
function endGame() { isGameOver = true; markDeadStonesAuto(); updateFinalScore(); document.getElementById('hint').style.display = "block"; renderBoard(); }
function updateFinalScore() { let tempBoard = JSON.parse(JSON.stringify(boardState)); let bonus = { [BLACK]: 0, [WHITE]: 0 }; deadStonesSet.forEach(key => { let [r, c] = key.split(',').map(Number); bonus[tempBoard[r][c] === BLACK ? WHITE : BLACK]++; tempBoard[r][c] = EMPTY; }); const res = calculateTerritory(tempBoard); const bT = res.black + captures[BLACK] + bonus[BLACK]; const wT = res.white + captures[WHITE] + bonus[WHITE] + KOMI; document.getElementById('result-display').style.display = "block"; document.getElementById('result-display').innerHTML = `【終局結算報告】<br>黑：${bT} | 白：${wT.toFixed(1)} <br>🏆 判定：${bT > wT ? '黑棋勝' : '白棋勝'}`; }
function toggleDeadStone(r, c) { const key = `${r},${c}`; const group = findGroup(boardState, r, c); const isDead = deadStonesSet.has(key); group.forEach(p => isDead ? deadStonesSet.delete(`${p.r},${p.c}`) : deadStonesSet.add(`${p.r},${p.c}`)); updateFinalScore(); renderBoard(); }
function updateStatus() { document.getElementById('player-indicator').style.backgroundColor = (currentPlayer === BLACK) ? 'black' : 'white'; document.getElementById('current-player-text').innerText = (currentPlayer === BLACK) ? '黑棋' : '白棋'; document.getElementById('thinking-msg').style.display = isAiProcessing ? 'inline' : 'none'; }
function showMessage(m) { document.getElementById('message-area').innerText = m; }

resetGame();
