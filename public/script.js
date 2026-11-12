const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const ui = {
  score: document.querySelector('#score'),
  lives: document.querySelector('#lives'),
  level: document.querySelector('#level'),
  status: document.querySelector('#status'),
  start: document.querySelector('#startBtn'),
  pause: document.querySelector('#pauseBtn'),
  image: document.querySelector('#imageInput'),
};

// Modos por URL (útiles para grabar videos):
//   ?tiktok   todo junto: vertical 9:16, juega solo, sin interfaz y con efectos
//   ?auto     la paleta juega sola y la partida se reinicia al perder
//   ?clean    oculta barra, marcador y pie de página
//   ?portrait formato vertical 9:16
//   ?juice    estela de la pelota, sacudida de pantalla y más partículas
const params = new URLSearchParams(window.location.search);
const MODE = { tiktok: params.has('tiktok') };
MODE.auto = MODE.tiktok || params.has('auto');
MODE.clean = MODE.tiktok || params.has('clean');
MODE.portrait = MODE.tiktok || params.has('portrait');
MODE.juice = MODE.auto || params.has('juice');

// Tamaño lógico del juego; el canvas real se escala por devicePixelRatio para verse nítido.
const VIEW = MODE.portrait ? { w: 540, h: 960 } : { w: 960, h: 600 };
const DPR = Math.min(window.devicePixelRatio || 1, 3);
canvas.width = Math.round(VIEW.w * DPR);
canvas.height = Math.round(VIEW.h * DPR);
document.documentElement.style.setProperty('--ratio', String(VIEW.w / VIEW.h));
document.body.classList.toggle('clean', MODE.clean);
document.body.classList.toggle('portrait', MODE.portrait);

const BASE_PADDLE_WIDTH = 150;
const BALL_RADIUS = 7;
const POWER_DURATION = 8;
// En modo automático el ritmo es más rápido (varias pelotas y más velocidad) para que el video no se sienta lento.
const MAX_BALLS = MODE.auto ? 6 : 4;
const START_BALLS = MODE.auto ? 3 : 1;
const SPEED_MAX = MODE.auto ? 520 : 430;
const LAUNCH_SPEED = MODE.auto ? 430 : 350;
const MATERIALS = {
  wood: { hp: 1, color: '#cf8a57' },
  glass: { hp: 2, color: '#69a9b5' },
  stone: { hp: 3, color: '#929994' },
  metal: { hp: 4, color: '#6f7a82' },
  crystal: { hp: 5, color: '#8b79a5' },
};
const POWERUPS = {
  fire: { label: 'Fuego', color: '#d66c4e' },
  wide: { label: 'Ancha', color: '#438a9b' },
  multi: { label: 'Múltiple', color: '#b88a35' },
  life: { label: 'Vida', color: '#4d8b63' },
  speedUp: { label: 'Rápida', color: '#b7653e' },
  slow: { label: 'Lenta', color: '#607ba0' },
  sticky: { label: 'Pegajosa', color: '#8566a0' },
  chain: { label: 'Cadena', color: '#596c9e' },
  rockets: { label: 'Cohetes', color: '#b75269' },
};
// Pesos deliberados: utilidades comunes frecuentes, efectos de limpieza raros.
const DROP_WEIGHTS = [
  ['wide', 20], ['slow', 16], ['multi', 14], ['fire', 12],
  ['sticky', 10], ['speedUp', 10], ['rockets', 8], ['chain', 7], ['life', 3],
];

const state = {
  score: 0, lives: 3, level: 1, running: false, paused: false,
  paddle: { x: 0, y: 0, width: BASE_PADDLE_WIDTH, height: 10, speed: 520, wideTimer: 0 },
  balls: [], bricks: [], drops: [], rockets: [], particles: [],
  pointerX: VIEW.w / 2, pointerActive: false, left: false, right: false,
  effects: { fire: 0, sticky: 0, chain: 0, rockets: 0 },
  rocketCooldown: 0, lastTime: 0, status: 'Listo para jugar',
  lastDropAt: 0, bricksDestroyed: 0,
  imageLayout: null, // patrón importado; se conserva al reiniciar tras perder
  shake: 0,
  autoDelay: null, autoStuck: .45, autoAim: 0,
};

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function setStatus(text) { state.status = text; ui.status.textContent = text; }
function updateHud() {
  ui.score.textContent = String(state.score).padStart(4, '0');
  ui.lives.textContent = state.lives;
  ui.level.textContent = state.level;
  ui.status.textContent = state.status;
}

function makeBall(x, y, vx = 205, vy = -285, stuck = true) {
  return { x, y, vx, vy, r: BALL_RADIUS, stuck, fire: state.effects.fire > 0, trail: [] };
}
function resetBall() {
  state.balls = Array.from({ length: START_BALLS }, () => makeBall(state.paddle.x + state.paddle.width / 2, state.paddle.y - 10, 0, 0, true));
}
function resetPaddle() {
  state.paddle.width = BASE_PADDLE_WIDTH;
  state.paddle.x = (VIEW.w - state.paddle.width) / 2;
  state.paddle.y = VIEW.h - 28;
  state.paddle.wideTimer = 0;
}
function clearEffects() {
  for (const key of Object.keys(state.effects)) state.effects[key] = 0;
}
// Cada nivel nuevo empieza sin objetos en pantalla y con el contador de drops en cero.
function resetRound() {
  state.drops = [];
  state.rockets = [];
  state.bricksDestroyed = 0;
  state.lastDropAt = 0;
}
function makeBrick(x, y, width, height, materialKey, color) {
  const material = MATERIALS[materialKey] || MATERIALS.stone;
  return { x, y, w: width, h: height, material: materialKey, hp: material.hp, maxHp: material.hp, color: color || material.color };
}
function buildLevel() {
  const rows = Math.min(5 + Math.floor((state.level - 1) / 2), 7) + (MODE.portrait ? 4 : 0);
  const cols = MODE.portrait ? 8 : 10;
  const gap = 8;
  const padX = MODE.portrait ? 28 : 56;
  const brickW = (VIEW.w - padX * 2 - gap * (cols - 1)) / cols;
  const brickH = 25;
  const materials = ['wood', 'glass', 'stone', 'metal', 'crystal'];
  const bricks = [];
  for (let row = 0; row < rows; row += 1) {
    const material = materials[Math.min(materials.length - 1, Math.floor(row * materials.length / rows))];
    for (let col = 0; col < cols; col += 1) {
      bricks.push(makeBrick(padX + col * (brickW + gap), 50 + row * (brickH + gap), brickW, brickH, material));
    }
  }
  state.bricks = bricks;
  resetRound();
}
function loadLayout(layout) {
  state.bricks = layout.map((s) => makeBrick(s.x, s.y, s.w, s.h, s.material, s.color));
  resetRound();
}

// Devuelve una lista de especificaciones de ladrillo (no ladrillos vivos) para poder reiniciar el patrón.
function generateImageBricks(image) {
  const cols = MODE.portrait ? 8 : 12;
  const rows = MODE.portrait ? 14 : 7;
  const sample = document.createElement('canvas');
  sample.width = cols;
  sample.height = rows;
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(cols / image.width, rows / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  sampleCtx.clearRect(0, 0, cols, rows);
  sampleCtx.drawImage(image, (cols - drawW) / 2, (rows - drawH) / 2, drawW, drawH);
  const pixels = sampleCtx.getImageData(0, 0, cols, rows).data;
  const padX = MODE.portrait ? 28 : 34, gap = 8, brickH = 27;
  const brickW = (VIEW.w - padX * 2 - gap * (cols - 1)) / cols;
  const layout = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = (row * cols + col) * 4;
      if (pixels[i + 3] < 30) continue;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const brightness = (r + g + b) / 3;
      const material = brightness < 65 ? 'stone' : brightness > 205 ? 'crystal' : brightness > 145 ? 'metal' : 'glass';
      layout.push({ x: padX + col * (brickW + gap), y: 48 + row * (brickH + gap), w: brickW, h: brickH, material, color: `rgb(${r},${g},${b})` });
    }
  }
  return layout.length ? layout : null;
}

// Partida nueva completa. Si hay un patrón importado, se vuelve a usar en lugar del nivel 1 normal.
function newGame(layout = null) {
  state.score = 0; state.lives = 3; state.level = 1;
  state.running = false; state.paused = false;
  resetPaddle();
  if (layout) loadLayout(layout); else buildLevel();
  resetBall();
  clearEffects();
  state.particles = [];
  state.shake = 0;
  ui.pause.textContent = 'Pausa';
  updateHud();
}

function chooseDrop() {
  const roll = Math.random() * DROP_WEIGHTS.reduce((sum, item) => sum + item[1], 0);
  let cursor = 0;
  for (const [type, weight] of DROP_WEIGHTS) {
    cursor += weight;
    if (roll < cursor) return type;
  }
  return 'wide';
}
function maybeDrop(brick) {
  // 11% por ladrillo destruido, con máximo 2 objetos simultáneos y 4 ladrillos entre drops.
  if (state.drops.length >= 2 || state.bricksDestroyed - state.lastDropAt < 4 || Math.random() > 0.11) return;
  state.lastDropAt = state.bricksDestroyed;
  state.drops.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, r: 10, vy: 115, type: chooseDrop() });
}
function burst(x, y, color, count = MODE.juice ? 12 : 7) {
  for (let i = 0; i < count; i += 1) state.particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: (Math.random() - .5) * 130, life: .35 + Math.random() * .3, color });
}
function destroyBrick(brick, chain = false) {
  const index = state.bricks.indexOf(brick);
  if (index < 0) return;
  state.bricks.splice(index, 1);
  state.score += 10 * brick.maxHp;
  state.bricksDestroyed += 1;
  burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);
  if (MODE.juice) state.shake = Math.min(7, state.shake + brick.maxHp * .9);
  if (!chain) maybeDrop(brick);
  if (state.effects.chain > 0 && !chain) {
    const targets = state.bricks.filter((other) => other.color === brick.color).slice(0, 2);
    targets.forEach((target) => destroyBrick(target, true));
  }
}
function damageBrick(brick, amount = 1) {
  brick.hp -= amount;
  if (brick.hp <= 0) destroyBrick(brick);
}

function applyPower(type) {
  switch (type) {
    case 'wide':
      state.paddle.width = Math.min(210, Math.max(state.paddle.width, BASE_PADDLE_WIDTH + 35));
      state.paddle.wideTimer = POWER_DURATION;
      break;
    case 'multi': {
      const source = state.balls.find((ball) => !ball.stuck) || state.balls[0];
      if (source && state.balls.length < MAX_BALLS) {
        const count = Math.min(2, MAX_BALLS - state.balls.length);
        for (let i = 0; i < count; i += 1) {
          const angle = (i === 0 ? -0.36 : 0.36);
          const speed = Math.hypot(source.vx, source.vy) || 350;
          const baseAngle = Math.atan2(source.vy || -1, source.vx || 0);
          state.balls.push(makeBall(source.x, source.y, Math.cos(baseAngle + angle) * speed, Math.sin(baseAngle + angle) * speed, source.stuck));
        }
      }
      break;
    }
    case 'life': state.lives = Math.min(5, state.lives + 1); break;
    case 'speedUp': changeBallSpeed(1.12); break;
    case 'slow': changeBallSpeed(.90); break;
    case 'fire': state.effects.fire = POWER_DURATION; state.balls.forEach((ball) => { ball.fire = true; }); break;
    case 'sticky':
      state.effects.sticky = POWER_DURATION;
      state.balls.forEach((ball) => { ball.stuck = true; ball.vx = 0; ball.vy = 0; });
      break;
    case 'chain': state.effects.chain = 7; break;
    case 'rockets': state.effects.rockets = 7; state.rocketCooldown = 0; break;
    default: return;
  }
  setStatus(`${POWERUPS[type].label} activada`);
  updateHud();
}
function changeBallSpeed(factor) {
  for (const ball of state.balls) {
    if (ball.stuck) continue;
    const current = Math.hypot(ball.vx, ball.vy);
    const speed = clamp(current * factor, 230, SPEED_MAX);
    const scale = speed / (current || 1);
    ball.vx *= scale;
    ball.vy *= scale;
  }
}

// --- Piloto automático (modo ?auto / ?tiktok) ---

// Refleja una posición X contra las paredes laterales para predecir dónde caerá la pelota.
function foldX(x) {
  const span = VIEW.w - 2 * BALL_RADIUS;
  let u = (x - BALL_RADIUS) % (2 * span);
  if (u < 0) u += 2 * span;
  if (u > span) u = 2 * span - u;
  return u + BALL_RADIUS;
}
function autoTarget() {
  const p = state.paddle;
  const free = state.balls.filter((ball) => !ball.stuck);
  const falling = free
    .filter((ball) => ball.vy > 0 && ball.y < p.y)
    .map((ball) => ({ ball, t: (p.y - ball.r - ball.y) / ball.vy }))
    .sort((a, b) => a.t - b.t)[0];
  const lowestDrop = state.drops.reduce((low, drop) => (!low || drop.y > low.y ? drop : low), null);
  let centerX = p.x + p.width / 2;
  if (falling && !(falling.t > 1 && lowestDrop)) {
    // Se apunta con un pequeño desfase aleatorio para variar el ángulo de rebote.
    centerX = foldX(falling.ball.x + falling.ball.vx * Math.max(0, falling.t)) - state.autoAim;
  } else if (lowestDrop) {
    centerX = lowestDrop.x;
  } else if (free.length) {
    centerX = free.reduce((low, ball) => (ball.y > low.y ? ball : low)).x;
  }
  return centerX - p.width / 2;
}
function autoPlay(dt) {
  if (state.paused) return;
  if (!state.running) {
    if (state.autoDelay === null) state.autoDelay = state.lives <= 0 ? 1.8 : .9;
    state.autoDelay -= dt;
    if (state.autoDelay <= 0) {
      state.autoDelay = null;
      if (state.lives <= 0) newGame(state.imageLayout);
      launch();
    }
    return;
  }
  if (state.balls.some((ball) => ball.stuck)) {
    state.autoStuck -= dt;
    if (state.autoStuck <= 0) { launch(); state.autoStuck = .45; }
  } else {
    state.autoStuck = .45;
  }
}

function movePaddle(dt) {
  if (MODE.auto) {
    const maxStep = state.paddle.speed * 1.6 * dt;
    state.paddle.x += clamp(autoTarget() - state.paddle.x, -maxStep, maxStep);
  } else {
    const direction = Number(state.right) - Number(state.left);
    if (direction) {
      state.paddle.x += direction * state.paddle.speed * dt;
      state.pointerActive = false;
    } else if (state.pointerActive) {
      const target = state.pointerX - state.paddle.width / 2;
      state.paddle.x += (target - state.paddle.x) * Math.min(1, dt * 18);
    }
  }
  state.paddle.x = clamp(state.paddle.x, 0, VIEW.w - state.paddle.width);
  if (state.paddle.wideTimer > 0 && (state.paddle.wideTimer -= dt) <= 0) {
    state.paddle.width = BASE_PADDLE_WIDTH;
    state.paddle.x = clamp(state.paddle.x, 0, VIEW.w - state.paddle.width);
  }
}
function advanceEffects(dt) {
  for (const name of Object.keys(state.effects)) {
    if (state.effects[name] > 0) state.effects[name] = Math.max(0, state.effects[name] - dt);
  }
  for (const ball of state.balls) ball.fire = state.effects.fire > 0;
  if (state.effects.rockets > 0) {
    state.rocketCooldown -= dt;
    if (state.rocketCooldown <= 0) {
      const y = state.paddle.y - 7;
      state.rockets.push({ x: state.paddle.x + state.paddle.width * .32, y, vy: -360 }, { x: state.paddle.x + state.paddle.width * .68, y, vy: -360 });
      state.rocketCooldown = .8;
    }
  }
}

function collideBallWithBrick(ball, brick) {
  const nearestX = clamp(ball.x, brick.x, brick.x + brick.w);
  const nearestY = clamp(ball.y, brick.y, brick.y + brick.h);
  const dx = ball.x - nearestX, dy = ball.y - nearestY;
  if (dx * dx + dy * dy > ball.r * ball.r) return false;
  damageBrick(brick, 1);
  if (!ball.fire) {
    if (Math.abs(dx) > Math.abs(dy)) ball.vx *= -1;
    else ball.vy *= -1;
  }
  return true;
}
function updateBalls(dt) {
  for (const ball of [...state.balls]) {
    if (ball.stuck) {
      ball.x = state.paddle.x + state.paddle.width / 2;
      ball.y = state.paddle.y - ball.r - 3;
      ball.trail.length = 0;
      continue;
    }
    if (MODE.juice) {
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 9) ball.trail.shift();
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
    if (ball.x + ball.r > VIEW.w) { ball.x = VIEW.w - ball.r; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
    const p = state.paddle;
    if (ball.vy > 0 && ball.y + ball.r >= p.y && ball.y - ball.r <= p.y + p.height && ball.x >= p.x && ball.x <= p.x + p.width) {
      state.autoAim = (Math.random() - .5) * p.width * .7;
      if (state.effects.sticky > 0) { ball.stuck = true; ball.vx = 0; ball.vy = 0; }
      else {
        const offset = clamp((ball.x - (p.x + p.width / 2)) / (p.width / 2), -.88, .88);
        const speed = clamp(Math.hypot(ball.vx, ball.vy), 230, SPEED_MAX);
        const angle = offset * 1.05;
        ball.vx = speed * Math.sin(angle);
        ball.vy = -speed * Math.cos(angle);
        ball.y = p.y - ball.r - 1;
      }
    }
    for (const brick of [...state.bricks]) {
      if (collideBallWithBrick(ball, brick)) {
        if (!ball.fire) break;
      }
    }
    if (ball.y - ball.r > VIEW.h) {
      state.balls.splice(state.balls.indexOf(ball), 1);
    }
  }
  if (state.balls.length === 0) {
    state.lives -= 1;
    updateHud();
    if (state.lives <= 0) {
      state.running = false;
      setStatus('Fin de la partida · Iniciar para volver a jugar');
    } else {
      resetBall();
      setStatus('Vida perdida · Espacio para continuar');
    }
  }
}
function updateDrops(dt) {
  for (const drop of [...state.drops]) {
    drop.y += drop.vy * dt;
    if (drop.y - drop.r > VIEW.h) { state.drops.splice(state.drops.indexOf(drop), 1); continue; }
    const p = state.paddle;
    if (drop.y + drop.r >= p.y && drop.x >= p.x && drop.x <= p.x + p.width) {
      state.drops.splice(state.drops.indexOf(drop), 1);
      applyPower(drop.type);
    }
  }
}
function updateRockets(dt) {
  for (const rocket of [...state.rockets]) {
    rocket.y += rocket.vy * dt;
    const hit = state.bricks.find((brick) => rocket.x >= brick.x && rocket.x <= brick.x + brick.w && rocket.y >= brick.y && rocket.y <= brick.y + brick.h);
    if (hit) { damageBrick(hit); state.rockets.splice(state.rockets.indexOf(rocket), 1); }
    else if (rocket.y < 0) state.rockets.splice(state.rockets.indexOf(rocket), 1);
  }
}
function updateParticles(dt) {
  state.particles = state.particles.filter((p) => (p.life -= dt) > 0);
  state.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; });
}
// Lanza todas las pelotas pegadas a la paleta, alternando la dirección de cada una.
function launch() {
  if (!state.running) { state.running = true; state.paused = false; }
  const speed = LAUNCH_SPEED;
  let direction = Math.random() > .5 ? 1 : -1;
  state.balls.filter((item) => item.stuck).forEach((ball, i) => {
    const sideways = Math.max(.2, .55 - i * .1);
    ball.stuck = false;
    ball.vx = direction * speed * sideways;
    ball.vy = -speed * Math.sqrt(1 - sideways * sideways);
    direction *= -1;
  });
  setStatus('En juego');
}
function advanceLevel() {
  state.level += 1;
  buildLevel();
  resetPaddle();
  resetBall();
  clearEffects();
  if (MODE.juice) state.shake = 8;
  setStatus('Nivel completado · Espacio para lanzar');
  state.running = false;
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  ctx.fillStyle = '#fbfcfa';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.save();
  if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);
  // Sutiles guías laterales del área de juego.
  ctx.strokeStyle = '#eef0eb'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(20, VIEW.h - 20); ctx.moveTo(VIEW.w - 20, 20); ctx.lineTo(VIEW.w - 20, VIEW.h - 20); ctx.stroke();
  for (const brick of state.bricks) {
    const ratio = brick.hp / brick.maxHp;
    ctx.globalAlpha = .52 + .48 * ratio;
    ctx.fillStyle = brick.color;
    ctx.beginPath(); ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4); ctx.fill();
    ctx.globalAlpha = 1;
    if (brick.maxHp > 1) {
      ctx.fillStyle = 'rgb(255 255 255 / 68%)';
      ctx.fillRect(brick.x + 5, brick.y + brick.h - 4, (brick.w - 10) * ratio, 2);
    }
  }
  const p = state.paddle;
  ctx.fillStyle = '#284f40'; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.width, p.height, 5); ctx.fill();
  for (const ball of state.balls) {
    const color = ball.fire ? '#d66c4e' : '#202722';
    if (ball.trail.length > 1) {
      ctx.fillStyle = color;
      ball.trail.forEach((point, i) => {
        const k = (i + 1) / ball.trail.length;
        ctx.globalAlpha = k * .22;
        ctx.beginPath(); ctx.arc(point.x, point.y, ball.r * (.45 + .5 * k), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const drop of state.drops) {
    ctx.fillStyle = POWERUPS[drop.type].color;
    ctx.beginPath(); ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '600 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(POWERUPS[drop.type].label[0], drop.x, drop.y);
  }
  for (const rocket of state.rockets) {
    ctx.fillStyle = '#b75269'; ctx.fillRect(rocket.x - 2, rocket.y - 7, 4, 12);
  }
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.min(1, particle.life * 2);
    ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // En modo automático no se muestra el cartel entre niveles o reinicios, solo la pausa manual.
  if ((!state.running && !MODE.auto) || state.paused) {
    ctx.fillStyle = 'rgb(251 252 250 / 78%)'; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.fillStyle = '#28312b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 22px system-ui, sans-serif';
    const label = state.paused ? 'En pausa' : state.lives <= 0 ? 'Fin de la partida' : 'Brick Out';
    ctx.fillText(label, VIEW.w / 2, VIEW.h / 2 - 8);
    ctx.fillStyle = '#747c74'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(state.paused ? 'Pulsa Pausa para continuar' : 'Pulsa Iniciar o espacio para jugar', VIEW.w / 2, VIEW.h / 2 + 20);
  }
}
function frame(timestamp) {
  const dt = Math.min((timestamp - (state.lastTime || timestamp)) / 1000, .03);
  state.lastTime = timestamp;
  if (MODE.auto) autoPlay(dt);
  if (state.running && !state.paused) {
    movePaddle(dt); advanceEffects(dt); updateBalls(dt); updateDrops(dt); updateRockets(dt);
    if (state.bricks.length === 0 && state.lives > 0) advanceLevel();
  }
  if (!state.paused) {
    updateParticles(dt);
    state.shake = Math.max(0, state.shake - dt * 28);
  }
  draw();
  requestAnimationFrame(frame);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  state.pointerX = (event.clientX - rect.left) * VIEW.w / rect.width;
  state.pointerActive = true;
}
canvas.addEventListener('pointermove', pointerPosition);
canvas.addEventListener('pointerdown', (event) => { pointerPosition(event); if (!state.running && state.lives > 0) launch(); else if (state.balls.some((ball) => ball.stuck)) launch(); });
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (key === 'arrowleft' || key === 'a') state.left = true;
  if (key === 'arrowright' || key === 'd') state.right = true;
  if (key === ' ' && !event.repeat && state.lives > 0) launch();
  if (key === 'p' && !event.repeat) togglePause();
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'arrowleft' || key === 'a') state.left = false;
  if (key === 'arrowright' || key === 'd') state.right = false;
});
function togglePause() {
  if (!state.running && !state.paused) return;
  state.paused = !state.paused;
  setStatus(state.paused ? 'En pausa' : 'En juego');
  ui.pause.textContent = state.paused ? 'Continuar' : 'Pausa';
}
ui.start.addEventListener('click', () => {
  if (state.lives <= 0) newGame(state.imageLayout);
  if (state.paused) state.paused = false;
  launch(); ui.pause.textContent = 'Pausa'; updateHud();
});
ui.pause.addEventListener('click', togglePause);
ui.image.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    const layout = generateImageBricks(image);
    URL.revokeObjectURL(image.src);
    if (!layout) { setStatus('No se encontraron bloques en la imagen'); return; }
    state.imageLayout = layout;
    newGame(layout);
    setStatus(`Imagen convertida · ${layout.length} bloques`);
  };
  image.onerror = () => setStatus('No se pudo cargar la imagen');
  image.src = URL.createObjectURL(file);
  event.target.value = '';
});

resetPaddle(); buildLevel(); resetBall(); updateHud(); requestAnimationFrame(frame);
