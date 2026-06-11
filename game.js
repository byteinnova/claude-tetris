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
const HS_KEY = 'tetris-highscores';
const MAX_HS = 5;

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
const nameInput = document.getElementById('hs-name-input');
const saveBtn = document.getElementById('hs-save-btn');
const hsTableBody = document.getElementById('hs-tbody');
const clearHsBtn = document.getElementById('clear-hs-btn');
const comboEl = document.getElementById('combo');
const maxLinesEl = document.getElementById('max-lines');

const themeSwitch = document.getElementById('theme-switch');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, maxLinesCleared;

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

// Por defecto modo oscuro; respeta la preferencia guardada si existe.
const savedTheme = localStorage.getItem('tetris-theme') === 'light' ? 'light' : 'dark';
applyTheme(savedTheme);

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem('tetris-theme', theme);
});

// ---- High scores ----

function loadHighScores() {
  try {
    return JSON.parse(localStorage.getItem(HS_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HS_KEY, JSON.stringify(list));
}

function insertsIntoTop(scoreValue) {
  const list = loadHighScores();
  if (list.length < MAX_HS) return true;
  return scoreValue >= list[list.length - 1].score;
}

function insertHighScore(entry) {
  const list = loadHighScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  if (list.length > MAX_HS) list.length = MAX_HS;
  saveHighScores(list);
  return list.findIndex(e => e === entry || (e.score === entry.score && e.name === entry.name));
}

function renderHighScores(highlightIdx) {
  const list = loadHighScores();
  hsTableBody.innerHTML = '';
  if (list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Sin records';
    td.className = 'hs-empty';
    tr.appendChild(td);
    hsTableBody.appendChild(tr);
    return;
  }
  list.forEach(function(entry, i) {
    const tr = document.createElement('tr');
    if (i === highlightIdx) tr.className = 'hs-new';
    const rank = document.createElement('td');
    rank.textContent = i + 1;
    const name = document.createElement('td');
    name.textContent = entry.name;
    const sc = document.createElement('td');
    sc.textContent = entry.score.toLocaleString();
    const extra = document.createElement('td');
    extra.textContent = (entry.maxLines || 0) + 'L / ' + (entry.bestCombo || 0) + 'C';
    tr.appendChild(rank);
    tr.appendChild(name);
    tr.appendChild(sc);
    tr.appendChild(extra);
    hsTableBody.appendChild(tr);
  });
}

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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLinesCleared) maxLinesCleared = cleared;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
  comboEl.textContent = combo;
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
  maxLinesEl.textContent = maxLinesCleared;
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
  overlayScore.textContent = 'Puntuación: ' + score.toLocaleString();

  const qualifies = insertsIntoTop(score);
  const nameSection = document.getElementById('hs-name-section');
  const hsSection = document.getElementById('hs-section');

  if (qualifies) {
    nameSection.classList.remove('hidden');
    nameInput.value = '';
    nameInput.focus();
  } else {
    nameSection.classList.add('hidden');
  }

  renderHighScores(-1);
  hsSection.classList.remove('hidden');

  overlay.classList.remove('hidden');
}

function saveScore() {
  const name = nameInput.value.trim() || 'AAA';
  const entry = {
    name: name,
    score: score,
    maxLines: maxLinesCleared,
    bestCombo: maxCombo
  };
  const idx = insertHighScore(entry);
  renderHighScores(idx);
  document.getElementById('hs-name-section').classList.add('hidden');
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
    document.getElementById('hs-name-section').classList.add('hidden');
    document.getElementById('hs-section').classList.add('hidden');
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
  combo = 0;
  maxCombo = 0;
  maxLinesCleared = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  comboEl.textContent = '0';
  document.getElementById('hs-name-section').classList.add('hidden');
  document.getElementById('hs-section').classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

saveBtn.addEventListener('click', saveScore);

nameInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') saveScore();
});

clearHsBtn.addEventListener('click', function() {
  localStorage.removeItem(HS_KEY);
  renderHighScores(-1);
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

init();

// Show the high scores table in the overlay before the first game starts.
// init() hides the overlay; we show it here after init() sets up the board.
overlayTitle.textContent = 'TETRIS';
overlayScore.textContent = 'Presiona Reiniciar para jugar';
renderHighScores(-1);
document.getElementById('hs-section').classList.remove('hidden');
document.getElementById('hs-name-section').classList.add('hidden');
overlay.classList.remove('hidden');
cancelAnimationFrame(animId);
