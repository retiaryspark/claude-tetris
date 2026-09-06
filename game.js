'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const clearedLineCount = clearLines();
  updateComboStreak(clearedLineCount);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  handleGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  comboCount = 0;
  bestComboThisGame = 0;
  removeGameOverRecordsPanel();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Tabla de récords locales ----
const RECORDS_STORAGE_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const PLAYER_NAME_MAX_LENGTH = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsContainer = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const resetRecordsConfirm = document.getElementById('reset-records-confirm');
const resetRecordsConfirmBtn = document.getElementById('reset-records-confirm-btn');
const resetRecordsCancelBtn = document.getElementById('reset-records-cancel-btn');

let comboCount = 0;
let bestComboThisGame = 0;

function createEmptyRecords() {
  return { topScores: [], bestCombo: 0, maxLines: 0 };
}

function isValidScoreEntry(entry) {
  return entry
    && typeof entry.name === 'string'
    && Number.isFinite(entry.score)
    && Number.isFinite(entry.lines)
    && Number.isFinite(entry.level);
}

function sanitizeRecords(parsed) {
  if (!parsed || typeof parsed !== 'object') return createEmptyRecords();
  const topScores = Array.isArray(parsed.topScores)
    ? parsed.topScores.filter(isValidScoreEntry).slice(0, MAX_RECORDS)
    : [];
  return {
    topScores,
    bestCombo: Number.isFinite(parsed.bestCombo) ? parsed.bestCombo : 0,
    maxLines: Number.isFinite(parsed.maxLines) ? parsed.maxLines : 0,
  };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    return raw ? sanitizeRecords(JSON.parse(raw)) : createEmptyRecords();
  } catch {
    return createEmptyRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage no disponible (p. ej. file:// con almacenamiento bloqueado); se pierde la persistencia, no el juego.
  }
}

function updateComboStreak(clearedLineCount) {
  comboCount = clearedLineCount > 0 ? comboCount + 1 : 0;
  bestComboThisGame = Math.max(bestComboThisGame, comboCount);
}

function recordGameResult(records) {
  return {
    ...records,
    bestCombo: Math.max(records.bestCombo, bestComboThisGame),
    maxLines: Math.max(records.maxLines, lines),
  };
}

function qualifiesForTopScores(records, finalScore) {
  if (finalScore <= 0) return false;
  if (records.topScores.length < MAX_RECORDS) return true;
  const lowestTopScore = records.topScores[records.topScores.length - 1].score;
  return finalScore > lowestTopScore;
}

function insertScoreEntry(records, entry) {
  const topScores = [...records.topScores, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  return { ...records, topScores };
}

function buildRecordsTableHead() {
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Líneas</th><th>Nivel</th></tr>';
  return head;
}

function buildRecordsTableRow(entry, rank, isHighlighted) {
  const row = document.createElement('tr');
  row.className = isHighlighted ? 'records-row records-row--highlight' : 'records-row';
  [rank, entry.name, entry.score.toLocaleString(), entry.lines, entry.level].forEach(value => {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
  });
  return row;
}

function buildRecordsTable(topScores, highlightEntry) {
  if (topScores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Aún no hay récords. ¡Sé el primero!';
    return empty;
  }
  const table = document.createElement('table');
  table.className = 'records-table';
  table.appendChild(buildRecordsTableHead());
  const body = document.createElement('tbody');
  topScores.forEach((entry, index) => {
    body.appendChild(buildRecordsTableRow(entry, index + 1, entry === highlightEntry));
  });
  table.appendChild(body);
  return table;
}

function buildRecordsStats(records) {
  const stats = document.createElement('p');
  stats.className = 'records-stats';
  stats.textContent = `Mejor combo: ${records.bestCombo}   Líneas máx: ${records.maxLines}`;
  return stats;
}

function renderRecordsInto(container, records, highlightEntry) {
  container.innerHTML = '';
  container.appendChild(buildRecordsTable(records.topScores, highlightEntry));
  container.appendChild(buildRecordsStats(records));
}

function refreshStartScreenRecords() {
  renderRecordsInto(startRecordsContainer, loadRecords(), null);
}

function removeGameOverRecordsPanel() {
  document.querySelectorAll('.game-over-records-panel').forEach(panel => panel.remove());
}

function buildRecordsPanel(records, highlightEntry) {
  const panel = document.createElement('div');
  panel.className = 'game-over-records-panel';
  renderRecordsInto(panel, records, highlightEntry);
  return panel;
}

function buildScoreEntry(rawName) {
  const trimmedName = rawName.trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return { name: trimmedName || 'Jugador', score, lines, level };
}

function buildNameEntryPanel(records) {
  const panel = document.createElement('div');
  panel.className = 'game-over-records-panel name-entry-panel';

  const label = document.createElement('p');
  label.textContent = '¡Nuevo récord! Escribe tu nombre:';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = PLAYER_NAME_MAX_LENGTH;
  input.placeholder = 'Nombre';
  input.setAttribute('aria-label', 'Nombre del jugador');

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Guardar';

  const submitName = () => {
    const result = saveHighScoreEntry(input.value);
    if (result) panel.replaceWith(buildRecordsPanel(result.updatedRecords, result.entry));
  };

  saveButton.addEventListener('click', submitName);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitName();
  });

  panel.append(label, input, saveButton);
  return panel;
}

let pendingHighScoreRecords = null;

function saveHighScoreEntry(rawName) {
  if (!pendingHighScoreRecords) return null;
  const entry = buildScoreEntry(rawName);
  const updatedRecords = insertScoreEntry(pendingHighScoreRecords, entry);
  saveRecords(updatedRecords);
  pendingHighScoreRecords = null;
  return { updatedRecords, entry };
}

function handleGameOverRecords() {
  const records = recordGameResult(loadRecords());
  saveRecords(records);
  removeGameOverRecordsPanel();
  pendingHighScoreRecords = null;

  const overlayBox = overlay.querySelector('.overlay-box');
  if (!overlayBox) return;

  if (qualifiesForTopScores(records, score)) {
    pendingHighScoreRecords = records;
    const panel = buildNameEntryPanel(records);
    overlayBox.appendChild(panel);
    panel.querySelector('input').focus();
  } else {
    overlayBox.appendChild(buildRecordsPanel(records, null));
  }
}

restartBtn.addEventListener('click', () => saveHighScoreEntry(''));

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsConfirm.classList.remove('hidden');
});

resetRecordsCancelBtn.addEventListener('click', () => {
  resetRecordsConfirm.classList.add('hidden');
});

resetRecordsConfirmBtn.addEventListener('click', () => {
  saveRecords(createEmptyRecords());
  resetRecordsConfirm.classList.add('hidden');
  refreshStartScreenRecords();
});

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

gameOver = true;
refreshStartScreenRecords();
