/**
 * 1132916 - FinalTerm 專業版 (AI 修正與算式註解版)
 * 修正重點：修復 AI 落子邏輯，加入詳細判定註解
 */

const BOARD_SIZE = 9;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const KOMI = 7.5; // 標準貼目

let boardState = [];
let deadStonesSet = new Set();
let currentPlayer = BLACK;
let previousBoardJson = null;
let isAiProcessing = false;
let isGameOver = false;
let passCount = 0;
let captures = { [BLACK]: 0, [WHITE]: 0 };

function resetGame() {
    boardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
    deadStonesSet.clear();
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
    document.getElementById('result-display').innerHTML = "";
    document.getElementById('hint').style.display = "none";
    showMessage(hcp > 0 ? `讓子棋開始 (${hcp}子)` : "黑棋先行");
}

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
    if (isAiProcessing) return;

    const result = attemptMove(boardState, r, c, currentPlayer, previousBoardJson);
    if (result.success) {
        previousBoardJson = JSON.stringify(boardState);
        boardState = result.newBoard;
        captures[currentPlayer] += result.captured;
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        passCount = 0;
        renderBoard();
        updateStatus();
        
        // 判斷是否輪到電腦
        const mode = document.getElementById('game-mode').value;
        if (mode === 'PvC' && !isGameOver) {
            checkAiTurn();
        }
    } else if (result.msg) showMessage(result.msg);
}

function attemptMove(board, r, c, player, prevJson) {
    if (board[r][c] !== EMPTY) return { success: false, msg: "" };
    let nextBoard = JSON.parse(JSON.stringify(board));
    nextBoard[r][c] = player;
    let capturedCount = 0;
    const opponent = (player === BLACK) ? WHITE : BLACK;
    
    getNeighbors(r, c).forEach(([nR, nC]) => {
        if (nextBoard[nR][nC] === opponent) {
            const group = findGroup(nextBoard, nR, nC);
            if (countLiberties(nextBoard, group) === 0) {
                group.forEach(p => { 
                    nextBoard[p.r][p.c] = EMPTY; 
                    capturedCount++; 
                });
            }
        }
    });

    const myGroup = findGroup(nextBoard, r, c);
    if (capturedCount === 0 && countLiberties(nextBoard, myGroup) === 0) return { success: false, msg: "禁著點 (自殺)" };
    if (JSON.stringify(nextBoard) === prevJson) return { success: false, msg: "打劫" };

    return { success: true, newBoard: nextBoard, captured: capturedCount };
}

// === 核心判定演算法 (加入註解說明) ===

/**
 * 判定活棋/死子邏輯
 * 公式：判斷棋塊氣數 (Liberties)。若 libs < 2 且非「雙活」則標記為死子
 */
function markDeadStonesAuto() {
    deadStonesSet.clear();
    const groups = getAllGroups(boardState);
    for (const group of groups) {
        const color = boardState[group[0].r][group[0].c];
        const libs = countLiberties(boardState, group);
        
        // 【雙活判定算式】
        // 當氣數不足時，檢查是否有公氣與對手低氣數棋塊相連
        if (libs <= 2) {
            let seki = false;
            getLibertyCoords(boardState, group).forEach(libKey => {
                let [r, c] = libKey.split(',').map(Number);
                getNeighbors(r, c).forEach(([nR, nC]) => {
                    if (boardState[nR][nC] !== EMPTY && boardState[nR][nC] !== color) {
                        if (countLiberties(boardState, findGroup(boardState, nR, nC)) <= 2) seki = true;
                    }
                });
            });
            if (seki) continue; // 雙活保護
        }

        // 【活棋判斷基準】
        // 若氣數 < 2 且不具備雙活特徵，則標記為死子
        if (libs < 2) group.forEach(p => deadStonesSet.add(`${p.r},${p.c}`));
    }
}

/**
 * 領地計算公式 (Flood Fill)
 * 區域總分 = 空地格數，僅當空地完全被單一顏色包圍時計入該色得分
 */
function calculateTerritory(board) {
    let bTerr = 0, wTerr = 0, visited = new Set();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === EMPTY && !visited.has(`${r},${c}`)) {
                const area = floodFill(board, r, c);
                area.coords.forEach(k => visited.add(k));
                
                // 【歸屬算式】Neighbors.Color == 1 ? Black : White
                if (area.owner === BLACK) bTerr += area.size;
                else if (area.owner === WHITE) wTerr += area.size;
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
    return { size, owner, coords };
}

// === 工具與渲染 ===

function renderBoard() {
    const el = document.getElementById('board'); el.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell'; cell.onclick = () => handleMove(r, c);
            const val = boardState[r][c];
            if (val !== EMPTY) {
                const s = document.createElement('div');
                s.className = `stone ${val === BLACK ? 'black' : 'white'}`;
                // UX: 叫吃提醒
                if (countLiberties(boardState, findGroup(boardState, r, c)) === 1) s.classList.add('atari-warn');
                if (deadStonesSet.has(`${r},${c}`)) s.style.opacity = "0.4";
                cell.appendChild(s);
            }
            el.appendChild(cell);
        }
    }
}

function handlePass() {
    passCount++;
    showMessage(`${currentPlayer === BLACK ? '黑棋' : '白棋'} Pass`);
    if (passCount >= 2) endGame();
    else { 
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK; 
        updateStatus(); 
        const mode = document.getElementById('game-mode').value;
        if (mode === 'PvC') checkAiTurn(); 
    }
}

function endGame() {
    isGameOver = true;
    markDeadStonesAuto();
    updateFinalScore();
    document.getElementById('hint').style.display = "block";
    renderBoard();
}

/**
 * 終局總分算式
 * 黑分 = 黑地 + 提子；白分 = 白地 + 提子 + 7.5 (貼目)
 */
function updateFinalScore() {
    let tempBoard = JSON.parse(JSON.stringify(boardState));
    let bonus = { [BLACK]: 0, [WHITE]: 0 };
    deadStonesSet.forEach(key => {
        let [r, c] = key.split(',').map(Number);
        bonus[tempBoard[r][c] === BLACK ? WHITE : BLACK]++;
        tempBoard[r][c] = EMPTY;
    });
    const res = calculateTerritory(tempBoard);
    const bT = res.black + captures[BLACK] + bonus[BLACK];
    const wT = res.white + captures[WHITE] + bonus[WHITE] + KOMI;
    
    document.getElementById('result-display').innerHTML = 
        `【終局結算】 黑：${bT} | 白：${wT.toFixed(1)}<br>` +
        `🏆 勝負：${bT > wT ? '黑棋勝' : '白棋勝'}`;
}

// === AI 修正核心邏輯 ===
function checkAiTurn() {
    if (isGameOver) return;
    isAiProcessing = true;
    updateStatus();
    // 延遲 AI 落子以模擬思考時間
    setTimeout(computerPlay, 600);
}

function computerPlay() {
    if (isGameOver) return;
    let moves = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            // 檢查每一個格子是否為合法棋步
            const res = attemptMove(boardState, r, c, WHITE, previousBoardJson);
            if (res.success) {
                // AI 簡單權重公式：吃子數 * 50 + 距離中心距離分
                let score = res.captured * 50; 
                score -= (Math.abs(r - 4) + Math.abs(c - 4)); 
                moves.push({ r, c, score });
            }
        }
    }

    if (moves.length > 0) {
        // 選擇權重最高的棋步
        moves.sort((a, b) => b.score - a.score);
        const best = moves[0];
        
        // 執行落子，跳過 handleMove 的模式檢查
        previousBoardJson = JSON.stringify(boardState);
        boardState = attemptMove(boardState, best.r, best.c, WHITE, previousBoardJson).newBoard;
        captures[WHITE] += attemptMove(boardState, best.r, best.c, WHITE, previousBoardJson).captured || 0;
        
        // 結束電腦回合
        currentPlayer = BLACK;
        passCount = 0;
        isAiProcessing = false;
        renderBoard();
        updateStatus();
    } else {
        // 若無處可下，電腦選擇虛手
        isAiProcessing = false;
        handlePass();
    }
}

// 輔助函式與狀態更新保持不變...
function getNeighbors(r, c) { let n = []; if (r > 0) n.push([r-1, c]); if (r < BOARD_SIZE-1) n.push([r+1, c]); if (c > 0) n.push([r, c-1]); if (c < BOARD_SIZE-1) n.push([r, c+1]); return n; }
function findGroup(board, r, c) { const color = board[r][c], group = [], queue = [[r, c]], visited = new Set(); visited.add(`${r},${c}`); let i = 0; while(i < queue.length) { let [currR, currC] = queue[i++]; group.push({r: currR, c: currC}); getNeighbors(currR, currC).forEach(([nR, nC]) => { if (!visited.has(`${nR},${nC}`) && board[nR][nC] === color) { visited.add(`${nR},${nC}`); queue.push([nR, nC]); } }); } return group; }
function getAllGroups(board) { let groups = [], visited = new Set(); for (let r = 0; r < BOARD_SIZE; r++) { for (let c = 0; c < BOARD_SIZE; c++) { if (board[r][c] !== EMPTY && !visited.has(`${r},${c}`)) { const g = findGroup(board, r, c); g.forEach(p => visited.add(`${p.r},${p.c}`)); groups.push(g); } } } return groups; }
function countLiberties(board, group) { return getLibertyCoords(board, group).size; }
function getLibertyCoords(board, group) { let libs = new Set(); group.forEach(p => { getNeighbors(p.r, p.c).forEach(([nR, nC]) => { if (board[nR][nC] === EMPTY) libs.add(`${nR},${nC}`); }); }); return libs; }
function toggleDeadStone(r, c) { const key = `${r},${c}`; const group = findGroup(boardState, r, c); const isDead = deadStonesSet.has(key); group.forEach(p => isDead ? deadStonesSet.delete(`${p.r},${p.c}`) : deadStonesSet.add(`${p.r},${p.c}`)); renderBoard(); updateFinalScore(); }
function updateStatus() { document.getElementById('player-indicator').style.backgroundColor = (currentPlayer === BLACK) ? 'black' : 'white'; document.getElementById('current-player-text').innerText = (currentPlayer === BLACK) ? '黑棋' : '白棋'; document.getElementById('thinking-msg').style.display = isAiProcessing ? 'inline' : 'none'; }
function showMessage(m) { document.getElementById('message-area').innerText = m; }

resetGame();