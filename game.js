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
  '#90caf9', // J - azul pálido
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
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const startLevelSelect = document.getElementById('start-level-select');

const themeSwitch = document.getElementById('theme-switch');
const nameInputSection = document.getElementById('name-input-section');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordsOverlayEl = document.getElementById('records-overlay');
const recordsMainEl = document.getElementById('records-main');

let board, current, next, score, lines, level, startLevel, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, maxLinesSingle;

// ---- Tema (claro / oscuro) ----
// El color de la rejilla se dibuja en el canvas, así que lo leemos del
// tema CSS activo y lo cacheamos para no recalcularlo en cada frame.
let gridColor = '#22222e';

function readGridColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--grid').trim();
  if (value) gridColor = value;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSwitch.checked = theme === 'light';
  readGridColor();
}

// ---- Records ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || []; }
  catch { return []; }
}

function qualifiesForTop(s) {
  const r = loadRecords();
  return r.length < MAX_RECORDS || s > r[r.length - 1].score;
}

function saveRecord(name, s, mc, ml) {
  const r = loadRecords();
  const entry = { name: name.trim() || 'AAA', score: s, maxCombo: mc, maxLines: ml };
  r.push(entry);
  r.sort((a, b) => b.score - a.score);
  r.splice(MAX_RECORDS);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(r));
  return r.findIndex(e => e.name === entry.name && e.score === entry.score && e.maxCombo === entry.maxCombo);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRecords(highlightIdx = -1) {
  const r = loadRecords();
  const makeTable = (compact) => {
    if (!r.length) return '<p class="no-records">Sin récords aún</p>';
    return `<table class="records-table">
      <thead><tr><th>#</th><th>Nombre</th><th>Score</th><th>Combo</th><th>Líneas</th></tr></thead>
      <tbody>${r.map((e, i) => `
        <tr class="${i === highlightIdx ? 'record-new' : ''}">
          <td>${i + 1}</td>
          <td>${escapeHtml(e.name)}</td>
          <td>${e.score.toLocaleString()}</td>
          <td>${e.maxCombo}x</td>
          <td>${e.maxLines}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  };
  recordsOverlayEl.innerHTML = makeTable(true);
  recordsMainEl.innerHTML = makeTable(false);
}

// Por defecto modo oscuro; respeta la preferencia guardada si existe.
const savedTheme = localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark';
applyTheme(savedTheme);

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem('tetris-theme', theme);
});

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
    if (cleared > maxLinesSingle) maxLinesSingle = cleared;
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
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
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
  overlayScore.textContent = `Score: ${score.toLocaleString()} · Combo: ${maxCombo}x · Líneas: ${maxLinesSingle}`;
  renderRecords();
  nameInputSection.classList.add('hidden');
  if (qualifiesForTop(score)) {
    nameInputSection.classList.remove('hidden');
    playerNameInput.value = '';
    setTimeout(() => playerNameInput.focus(), 50);
  }
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    startLevelSelect.value = String(startLevel);
    pauseOverlay.classList.remove('hidden');
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
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  maxLinesSingle = 0;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
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
resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);

saveScoreBtn.addEventListener('click', () => {
  const idx = saveRecord(playerNameInput.value, score, maxCombo, maxLinesSingle);
  nameInputSection.classList.add('hidden');
  renderRecords(idx);
});

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveScoreBtn.click();
});

resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(RECORDS_KEY);
  renderRecords();
});

renderRecords();
init();
