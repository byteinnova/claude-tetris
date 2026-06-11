'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const LINE_SCORES = [0, 100, 300, 500, 800];

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

// ---- Skins ----

const SKINS = {
  retro: {
    name: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d'],
    boardBg: null,
    gridColor: null,
    draw(ctx, x, y, colorIndex, size, alpha) {
      ctx.globalAlpha = alpha ?? 1;
      ctx.fillStyle = this.colors[colorIndex];
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      ctx.globalAlpha = 1;
    },
  },
  neon: {
    name: 'Neon',
    colors: [null, '#00ffff', '#ffff00', '#ff00ff', '#00ff88', '#ff3355', '#4488ff', '#ff8800'],
    boardBg: '#000005',
    gridColor: '#0d0d1a',
    draw(ctx, x, y, colorIndex, size, alpha) {
      const color = this.colors[colorIndex];
      ctx.globalAlpha = alpha ?? 1;
      const pad = 2;
      const bx = x * size + pad, by = y * size + pad;
      const bw = size - pad * 2, bh = size - pad * 2;
      ctx.fillStyle = color + '22';
      ctx.fillRect(bx, by, bw, bh);
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#7ecfd4', '#f5c97a', '#c89fd4', '#8ed4a0', '#f09090', '#90bce8', '#f5b07a'],
    boardBg: '#faf8f5',
    gridColor: '#ede9e2',
    draw(ctx, x, y, colorIndex, size, alpha) {
      ctx.globalAlpha = alpha ?? 1;
      const pad = 2, r = 6;
      const bx = x * size + pad, by = y * size + pad;
      const bw = size - pad * 2, bh = size - pad * 2;
      ctx.fillStyle = this.colors[colorIndex];
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by,     bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx,     by + bh, r);
      ctx.arcTo(bx,      by + bh, bx,      by,     r);
      ctx.arcTo(bx,      by,      bx + bw, by,     r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(bx + 3, by + 3, bw - 6, 4);
      ctx.globalAlpha = 1;
    },
  },
  pixel: {
    name: 'Pixel',
    colors: [null, '#00b4d8', '#f4a261', '#9b5de5', '#2dc653', '#e63946', '#4895ef', '#f77f00'],
    boardBg: '#1e1e1e',
    gridColor: '#111111',
    draw(ctx, x, y, colorIndex, size, alpha) {
      const color = this.colors[colorIndex];
      ctx.globalAlpha = alpha ?? 1;
      const bx = x * size, by = y * size;
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, size, size);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, size, 2);
      ctx.fillRect(bx, by, 2, size);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx + size - 2, by, 2, size);
      ctx.fillRect(bx, by + size - 2, size, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let pr = 5; pr < size - 2; pr += 7)
        for (let pc = 5; pc < size - 2; pc += 7)
          ctx.fillRect(bx + pc, by + pr, 2, 2);
      ctx.globalAlpha = 1;
    },
  },
};

// ---- DOM refs ----

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
const themeSwitch = document.getElementById('theme-switch');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

let currentSkin = SKINS.retro;
let gridColor = '#22222e';

// ---- Tema ----

function readGridColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--grid').trim();
  if (value) gridColor = value;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSwitch.checked = theme === 'light';
  if (!currentSkin.gridColor) readGridColor();
}

const savedTheme = localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark';
applyTheme(savedTheme);

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem('tetris-theme', theme);
});

// ---- Skin ----

function applySkin(id) {
  currentSkin = SKINS[id] || SKINS.retro;
  localStorage.setItem('tetris-skin', id);
  if (currentSkin.gridColor) {
    gridColor = currentSkin.gridColor;
  } else {
    readGridColor();
  }
  document.querySelectorAll('.skin-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.skin === id)
  );
}

document.querySelectorAll('.skin-btn').forEach(btn =>
  btn.addEventListener('click', () => applySkin(btn.dataset.skin))
);

const savedSkin = localStorage.getItem('tetris-skin') || 'retro';
applySkin(savedSkin);

// ---- Game logic ----

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
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Drawing ----

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  currentSkin.draw(context, x, y, colorIndex, size, alpha);
}

function fillBg(context, w, h) {
  if (!currentSkin.boardBg) return;
  context.fillStyle = currentSkin.boardBg;
  context.fillRect(0, 0, w, h);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
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
  fillBg(ctx, canvas.width, canvas.height);
  drawGrid();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  fillBg(nextCtx, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Overlay / flow ----

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
      if (gameOver) return;
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

init();
