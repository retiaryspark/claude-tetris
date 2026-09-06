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
  clearLines();
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
  const skin = SKINS[activeSkin];
  const color = skin.colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x, y, color, size);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = SKINS[activeSkin].gridColor;
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
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

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

// ---- Skins ----
const SKIN_STORAGE_KEY = 'tetris.skin';
const skinSelectEl = document.getElementById('skin-select');

const NEON_GLOW_BLUR = 12;
const PASTEL_CORNER_RADIUS = 6;
const PIXEL_TEXTURE_CELL = 6;

function drawRetroBlock(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawNeonBlock(context, x, y, color, size) {
  context.save();
  context.shadowColor = color;
  context.shadowBlur = NEON_GLOW_BLUR;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.restore();
}

function drawPastelBlock(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const blockSize = size - 2;
  context.fillStyle = color;
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, blockSize, blockSize, PASTEL_CORNER_RADIUS);
    context.fill();
  } else {
    context.fillRect(px, py, blockSize, blockSize);
  }
}

function drawPixelBlock(context, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const blockSize = size - 2;
  context.fillStyle = color;
  context.fillRect(px, py, blockSize, blockSize);
  context.fillStyle = 'rgba(0,0,0,0.18)';
  for (let row = 0; row * PIXEL_TEXTURE_CELL < blockSize; row++) {
    for (let col = 0; col * PIXEL_TEXTURE_CELL < blockSize; col++) {
      if ((row + col) % 2 === 0) continue;
      const cellWidth = Math.min(PIXEL_TEXTURE_CELL, blockSize - col * PIXEL_TEXTURE_CELL);
      const cellHeight = Math.min(PIXEL_TEXTURE_CELL, blockSize - row * PIXEL_TEXTURE_CELL);
      context.fillRect(px + col * PIXEL_TEXTURE_CELL, py + row * PIXEL_TEXTURE_CELL, cellWidth, cellHeight);
    }
  }
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(px, py, blockSize, 2);
  context.fillRect(px, py, 2, blockSize);
}

const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    gridColor: '#22222e',
    boardBackground: '#1a1a25',
    drawBlock: drawRetroBlock,
  },
  neon: {
    label: 'Neón',
    colors: [null, '#00e5ff', '#fff176', '#e040fb', '#69f0ae', '#ff5252', '#536dfe', '#ffab40'],
    gridColor: '#111318',
    boardBackground: '#000000',
    drawBlock: drawNeonBlock,
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a7d8de', '#fbe7a1', '#d9b8e0', '#bfe3c0', '#f3b8b8', '#b8c2ea', '#f6cfa0'],
    gridColor: '#3a3a4a',
    boardBackground: '#2a2a38',
    drawBlock: drawPastelBlock,
  },
  pixel: {
    label: 'Pixel art',
    colors: COLORS,
    gridColor: '#22222e',
    boardBackground: '#1a1a25',
    drawBlock: drawPixelBlock,
  },
};

function loadSkinPreference() {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY);
    if (stored && SKINS[stored]) return stored;
  } catch (e) {
    // localStorage unavailable (e.g. file:// under restrictive privacy settings)
  }
  return 'retro';
}

function saveSkinPreference(skinName) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skinName);
  } catch (e) {
    // ignore write failures
  }
}

function applySkinToCanvases() {
  const background = SKINS[activeSkin].boardBackground;
  canvas.style.background = background;
  nextCanvas.style.background = background;
}

function setSkin(skinName) {
  if (!SKINS[skinName]) return;
  activeSkin = skinName;
  saveSkinPreference(skinName);
  applySkinToCanvases();
  drawNext();
}

let activeSkin = loadSkinPreference();
skinSelectEl.value = activeSkin;
skinSelectEl.addEventListener('change', e => setSkin(e.target.value));
applySkinToCanvases();

init();
