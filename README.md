const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const imageInput = document.getElementById('imageInput');

const MATERIALS = {
  wood: { label: 'Madera', hp: 1, color: '#b8682a', glow: '#e0a069' },
  glass: { label: 'Cristal', hp: 2, color: '#73d9ff', glow: '#afebff' },
  stone: { label: 'Piedra', hp: 3, color: '#8c98a8', glow: '#c2d0dc' },
  metal: { label: 'Metal', hp: 4, color: '#c8cfdd', glow: '#f5f7fb' },
  crystal: { label: 'Cristal Raro', hp: 5, color: '#d97cff', glow: '#f4ccff' },
};

const POWERUP_TYPES = {
  fire: {
    label: 'Bola de fuego',
    color: '#ff6a59',
    apply() {
      state.balls.forEach((ball) => {
        ball.fireMode = true;
        ball.fireTimer = 12;
      });
      setStatus('Bola de fuego activa');
    },
  },
  wide: {
    label: 'Paleta ancha',
    color: '#70d1ff',
    apply() {
      state.paddle.width = Math.min(280, state.paddle.width + 40);
      state.paddle.wideTimer = 12;
      setStatus('Paleta ancha');
    },
  },
  multi: {
    label: 'Bola múltiple',
    color: '#ffd75a',
    apply() {
      const primary = state.balls[0] || createBall();
      const extraVelocity = 1.1;
      for (let i = 0; i < 2; i += 1) {
        const newBall = {
          ...primary,
          x: primary.x + (i === 0 ? 12 : -12),
          y: primary.y + (i === 0 ? 8 : -8),
          vx: primary.vx * (i === 0 ? 1.15 : -1.15),
          vy: primary.vy * extraVelocity,
          radius: 8,
          speed: primary.speed,
          fireMode: primary.fireMode,
          fireTimer: primary.fireTimer || 0,
          sticky: false,
        };
        state.balls.push(newBall);
      }
      setStatus('Bola múltiple');
    },
  },
  life: {
    label: 'Vida extra',
    color: '#7ef9b4',
    apply() {
      state.lives += 1;
      setStatus('Vida extra');
    },
  },
  speedUp: {
    label: 'Bola rápida',
    color: '#ff9c57',
    apply() {
      state.balls.forEach((ball) => {
        const factor = 1.22;
        ball.vx *= factor;
        ball.vy *= factor;
        ball.speed = Math.min(17, ball.speed * factor);
      });
      setStatus('Velocidad aumentada');
    },
  },
  slow: {
    label: 'Bola lenta',
    color: '#7ca4ff',
    apply() {
      state.balls.forEach((ball) => {
        const factor = 0.82;
        ball.vx *= factor;
        ball.vy *= factor;
        ball.speed = Math.max(3.5, ball.speed * factor);
      });
      setStatus('Velocidad reducida');
    },
  },
  sticky: {
    label: 'Pala pegajosa',
    color: '#d7a4ff',
    apply() {
      state.stickyMode = true;
      state.stickyTimer = 12;
      state.balls.forEach((ball) => {
        ball.stuck = true;
        ball.x = state.paddle.x + state.paddle.width / 2;
        ball.y = state.paddle.y - ball.radius - 4;
      });
      setStatus('Pala pegajosa');
    },
  },
  chain: {
    label: 'Rayo en cadena',
    color: '#7d9dff',
    apply() {
      state.chainMode = true;
      state.chainTimer = 12;
      setStatus('Rayo en cadena');
    },
  },
  rockets: {
    label: 'Cohetes',
    color: '#ff4f8a',
    apply() {
      state.rocketMode = true;
      state.rocketTimer = 12;
      setStatus('Cohetes activos');
    },
  },
};

const state = {
  score: 0,
  lives: 3,
  level: 1,
  running: false,
  paused: false,
  started: false,
  paddle: {
    x: canvas.width / 2 - 90,
    y: canvas.height - 26,
    width: 170,
    height: 18,
    speed: 360,
    wideTimer: 0,
  },
  balls: [],
  bricks: [],
  powerUps: [],
  rockets: [],
  particles: [],
  pointerX: canvas.width / 2,
  keyLeft: false,
  keyRight: false,
  stickyMode: false,
  stickyTimer: 0,
  chainMode: false,
  chainTimer: 0,
  rocketMode: false,
  rocketTimer: 0,
  rocketCooldown: 0,
  lastTime: 0,
  message: 'Listo',
  currentImageName: 'patrón predeterminado',
};

function setStatus(text) {
  state.message = text;
  statusEl.textContent = text;
}

function updateHud() {
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  levelEl.textContent = state.level;
  statusEl.textContent = state.message;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createBall() {
  const ball = {
    x: state.paddle.x + state.paddle.width / 2,
    y: state.paddle.y - 12,
    radius: 8,
    vx: 220,
    vy: -240,
    speed: 6.4,
    fireMode: false,
    fireTimer: 0,
    stuck: true,
  };
  state.balls.push(ball);
  return ball;
}

function resetBallState() {
  state.balls = [];
  const ball = createBall();
  ball.stuck = true;
  ball.vx = 0;
  ball.vy = 0;
}

function resetPaddle() {
  state.paddle.width = 170;
  state.paddle.x = canvas.width / 2 - state.paddle.width / 2;
  state.paddle.y = canvas.height - 30;
  state.paddle.wideTimer = 0;
}

function buildBrick(x, y, width, height, baseColor, materialKey) {
  const material = MATERIALS[materialKey] || MATERIALS.stone;
  return {
    x,
    y,
    width,
    height,
    materialKey,
    color: baseColor,
    hp: material.hp,
    maxHp: material.hp,
    glowing: 0,
  };
}

function generateDefaultBricks() {
  const rows = 6;
  const cols = 10;
  const gap = 8;
  const padX = 76;
  const padY = 60;
  const brickWidth = (canvas.width - padX * 2 - gap * (cols - 1)) / cols;
  const brickHeight = 28;
  const palette = ['#6fe4ff', '#ff9a77', '#9df59d', '#ffd36b', '#d39cff', '#ff7eb5'];

  const bricks = [];
  for (let row = 0; row < rows; row += 1) {
    const materialKey = ['wood', 'glass', 'stone', 'metal', 'glass', 'crystal'][row % 6];
    for (let col = 0; col < cols; col += 1) {
      const x = padX + col * (brickWidth + gap);
      const y = padY + row * (brickHeight + gap);
      bricks.push(
        buildBrick(
          x,
          y,
          brickWidth,
          brickHeight,
          palette[row % palette.length],
          materialKey,
        ),
      );
    }
  }

  return bricks;
}

function buildBricksFromImage(img) {
  const cols = 12;
  const rows = 7;
  const padding = 30;
  const gap = 8;
  const width = canvas.width - padding * 2;
  const height = 340;

  const offscreen = document.createElement('canvas');
  offscreen.width = img.width;
  offscreen.height = img.height;
  const octx = offscreen.getContext('2d');
  octx.drawImage(img, 0, 0);

  const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height).data;
  const bricks = [];

  const cellW = Math.floor(offscreen.width / cols);
  const cellH = Math.floor(offscreen.height / rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = col * cellW;
      const y0 = row * cellH;
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      let samples = 0;

      for (let y = y0; y < y0 + cellH; y += 3) {
        for (let x = x0; x < x0 + cellW; x += 3) {
          const index = (y * offscreen.width + x) * 4;
          const a = imageData[index + 3];
          if (a < 28) continue;
          r += imageData[index];
          g += imageData[index + 1];
          b += imageData[index + 2];
          alpha += a;
          samples += 1;
        }
      }

      if (samples === 0) continue;

      const avgR = r / samples;
      const avgG = g / samples;
      const avgB = b / samples;
      const brightness = (avgR + avgG + avgB) / 3;
      const color = `rgb(${avgR}, ${avgG}, ${avgB})`;

      let materialKey = 'glass';
      if (brightness < 60) materialKey = 'stone';
      if (brightness < 35) materialKey = 'wood';
      if (brightness > 180 && (avgR + avgG + avgB) > 500) materialKey = 'crystal';
      if (brightness > 130 && brightness < 190) materialKey = 'metal';

      const brickWidth = (width - gap * (cols - 1)) / cols;
      const brickHeight = 24;
      const x = padding + col * (brickWidth + gap);
      const y = 50 + row * (brickHeight + gap);

      bricks.push(buildBrick(x, y, brickWidth, brickHeight, color, materialKey));
    }
  }

  if (bricks.length === 0) {
    return generateDefaultBricks();
  }

  return bricks;
}

function spawnBrickPowerUp(brick) {
  if (Math.random() > 0.18) return;
  const powerUps = Object.keys(POWERUP_TYPES);
  const type = powerUps[Math.floor(Math.random() * powerUps.length)];
  state.powerUps.push({
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height / 2,
    radius: 10,
    type,
    vy: 130,
  });
}

function destroyBrick(brick) {
  brick.hp = 0;
  state.bricks = state.bricks.filter((b) => b !== brick);
  state.score += 20;
  if (state.chainMode) {
    const targetColor = brick.color;
    for (const sameColorBrick of [...state.bricks]) {
      if (sameColorBrick.color === targetColor) {
        sameColorBrick.hp = 0;
        state.score += 35;
        state.bricks = state.bricks.filter((b) => b !== sameColorBrick);
      }
    }
  }
  spawnBrickPowerUp(brick);
  createParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 10);
}

function createParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 200,
      vy: (Math.random() - 0.5) * 180,
      radius: 2 + Math.random() * 3,
      color,
      life: 0.7 + Math.random() * 0.5,
    });
  }
}

function spawnPowerEffect(type) {
  const power = POWERUP_TYPES[type];
  if (!power) return;
  power.apply();
}

function resetLevel() {
  resetPaddle();
  state.bricks = generateDefaultBricks();
  state.powerUps = [];
  state.rockets = [];
  state.particles = [];
  resetBallState();
  setStatus('Nivel ' + state.level);
  updateHud();
}

function loadImageBricks(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      state.currentImageName = file.name;
      state.bricks = buildBricksFromImage(img);
      state.level = 1;
      resetPaddle();
      resetBallState();
      setStatus('Imagen importada: ' + file.name);
      updateHud();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function updatePaddle(dt) {
  const moveDirection = Number(state.keyRight) - Number(state.keyLeft);
  if (moveDirection !== 0) {
    state.paddle.x += moveDirection * state.paddle.speed * dt;
  }

  const pointerTarget = state.pointerX;
  const paddleCenter = state.paddle.x + state.paddle.width / 2;
  const delta = pointerTarget - paddleCenter;
  if (Math.abs(delta) > 2) {
    state.paddle.x += delta * 0.18;
  }

  state.paddle.x = clamp(state.paddle.x, 0, canvas.width - state.paddle.width);

  if (state.paddle.wideTimer > 0) {
    state.paddle.wideTimer -= dt;
    if (state.paddle.wideTimer <= 0) {
      state.paddle.width = 170;
    }
  }

  if (state.stickyTimer > 0) {
    state.stickyTimer -= dt;
    if (state.stickyTimer <= 0) {
      state.stickyMode = false;
    }
  }

  if (state.chainTimer > 0) {
    state.chainTimer -= dt;
    if (state.chainTimer <= 0) {
      state.chainMode = false;
    }
  }

  if (state.rocketTimer > 0) {
    state.rocketTimer -= dt;
    if (state.rocketTimer <= 0) {
      state.rocketMode = false;
    }
  }

  if (state.rocketMode) {
    state.rocketCooldown -= dt;
    if (state.rocketCooldown <= 0) {
      state.rockets.push({
        x: state.paddle.x + state.paddle.width / 2,
        y: state.paddle.y - 12,
        width: 6,
        height: 18,
        vy: -420,
      });
      state.rocketCooldown = 0.4;
    }
  }
}

function updateBalls(dt) {
  for (const ball of [...state.balls]) {
    if (ball.stuck) {
      ball.x = state.paddle.x + state.paddle.width / 2;
      ball.y = state.paddle.y - ball.radius - 4;
      continue;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= canvas.width) {
      ball.vx *= -1;
      ball.x = clamp(ball.x, ball.radius, canvas.width - ball.radius);
    }

    if (ball.y - ball.radius <= 0) {
      ball.vy *= -1;
      ball.y = ball.radius;
    }

    if (ball.y - ball.radius > canvas.height + 30) {
      state.balls = state.balls.filter((b) => b !== ball);
      if (state.balls.length === 0) {
        state.lives -= 1;
        if (state.lives <= 0) {
          setStatus('Game Over');
          state.running = false;
          resetPaddle();
          state.balls = [];
        } else {
          resetBallState();
          setStatus('Pierdes una vida');
        }
      }
      continue;
    }

    const paddleTop = state.paddle.y;
    const paddleBottom = state.paddle.y + state.paddle.height;
    const paddleLeft = state.paddle.x;
    const paddleRight = state.paddle.x + state.paddle.width;

    if (
      ball.y + ball.radius >= paddleTop &&
      ball.y - ball.radius <= paddleBottom &&
      ball.x >= paddleLeft &&
      ball.x <= paddleRight &&
      ball.vy > 0
    ) {
      const relativeImpact = ((ball.x - (state.paddle.x + state.paddle.width / 2)) / (state.paddle.width / 2));
      const speed = Math.hypot(ball.vx, ball.vy) || 320;
      ball.vx = relativeImpact * 280;
      ball.vy = -Math.sqrt(speed * speed - ball.vx * ball.vx);
      ball.y = paddleTop - ball.radius - 1;
    }

    for (const brick of [...state.bricks]) {
      if (
        ball.x + ball.radius > brick.x &&
        ball.x - ball.radius < brick.x + brick.width &&
        ball.y + ball.radius > brick.y &&
        ball.y - ball.radius < brick.y + brick.height
      ) {
        if (ball.fireMode) {
          brick.hp -= 1;
          if (brick.hp <= 0) {
            destroyBrick(brick);
          }
          ball.x += ball.vx * 0.03;
          ball.y += ball.vy * 0.03;
          continue;
        }

        const overlapLeft = ball.x + ball.radius - brick.x;
        const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
        const overlapTop = ball.y + ball.radius - brick.y;
        const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
          ball.vx *= -1;
        } else {
          ball.vy *= -1;
        }

        brick.hp -= 1;
        if (brick.hp <= 0) {
          destroyBrick(brick);
        }
        ball.x += ball.vx * 0.02;
        ball.y += ball.vy * 0.02;
        break;
      }
    }

    if (ball.fireTimer > 0) {
      ball.fireTimer -= dt;
      if (ball.fireTimer <= 0) {
        ball.fireMode = false;
      }
    }
  }

  if (state.bricks.length === 0) {
    state.level += 1;
    setStatus('Nivel completado');
    state.bricks = generateDefaultBricks();
    state.particles = [];
    resetPaddle();
    resetBallState();
    updateHud();
  }
}

function updatePowerUps(dt) {
  for (const powerUp of [...state.powerUps]) {
    powerUp.y += powerUp.vy * dt;
    const powerBottom = powerUp.y + powerUp.radius;
    const powerTop = powerUp.y - powerUp.radius;
    const paddleTop = state.paddle.y;
    const paddleLeft = state.paddle.x;
    const paddleRight = state.paddle.x + state.paddle.width;
    const paddleBottom = state.paddle.y + state.paddle.height;

    if (
      powerBottom >= paddleTop &&
      powerTop <= paddleBottom &&
      powerUp.x >= paddleLeft &&
      powerUp.x <= paddleRight
    ) {
      spawnPowerEffect(powerUp.type);
      state.powerUps = state.powerUps.filter((entry) => entry !== powerUp);
      continue;
    }

    if (powerUp.y - powerUp.radius > canvas.height) {
      state.powerUps = state.powerUps.filter((entry) => entry !== powerUp);
    }
  }
}

function updateRockets(dt) {
  for (const rocket of [...state.rockets]) {
    rocket.y += rocket.vy * dt;
    for (const brick of [...state.bricks]) {
      if (
        rocket.x > brick.x &&
        rocket.x < brick.x + brick.width &&
        rocket.y > brick.y &&
        rocket.y < brick.y + brick.height
      ) {
        destroyBrick(brick);
        state.rockets = state.rockets.filter((item) => item !== rocket);
        break;
      }
    }
    if (rocket.y < -30) {
      state.rockets = state.rockets.filter((item) => item !== rocket);
    }
  }
}

function updateParticles(dt) {
  for (const particle of [...state.particles]) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.life <= 0) {
      state.particles = state.particles.filter((item) => item !== particle);
    }
  }
}

function resetAfterGameOver() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.running = false;
  state.paused = false;
  resetPaddle();
  state.bricks = generateDefaultBricks();
  state.powerUps = [];
  state.rockets = [];
  state.particles = [];
  resetBallState();
  setStatus('Listo');
  updateHud();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - state.lastTime) / 1000 || 0.016, 0.032);
  state.lastTime = timestamp;

  if (state.running && !state.paused) {
    updatePaddle(dt);
    updateBalls(dt);
    updatePowerUps(dt);
    updateRockets(dt);
    updateParticles(dt);
  }

  draw();
  requestAnimationFrame(loop);
}

function drawBackground() {
  ctx.fillStyle = '#081722';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(130, 180, 255, 0.07)';
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 70) % canvas.width;
    const y = (i * 160) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
}

function renderBrick(brick) {
  const material = MATERIALS[brick.materialKey] || MATERIALS.stone;
  const fill = brick.color || material.color;

  ctx.fillStyle = fill;
  ctx.shadowColor = material.glow;
  ctx.shadowBlur = 9;
  roundedRect(ctx, brick.x, brick.y, brick.width, brick.height, 8, true, false);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.stroke();

  const ratio = brick.hp / brick.maxHp;
  ctx.fillStyle = `rgba(0, 0, 0, ${0.28 + (1 - ratio) * 0.2})`;
  ctx.fillRect(brick.x + 6, brick.y + brick.height - 8, brick.width - 12, 4);
  ctx.fillStyle = '#dfefff';
  ctx.fillRect(brick.x + 6, brick.y + brick.height - 8, (brick.width - 12) * ratio, 4);
}

function roundedRect(context, x, y, width, height, radius, fill, stroke) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  if (fill) context.fill();
  if (stroke) context.stroke();
}

function drawPaddle() {
  const { x, y, width, height } = state.paddle;
  ctx.fillStyle = '#5fe2f6';
  ctx.shadowColor = '#7fe9ff';
  ctx.shadowBlur = 16;
  roundedRect(ctx, x, y, width, height, 10, true, false);
  ctx.shadowBlur = 0;
}

function drawBalls() {
  for (const ball of state.balls) {
    ctx.beginPath();
    ctx.fillStyle = ball.fireMode ? '#ff8b5e' : '#f6f8ff';
    ctx.shadowColor = ball.fireMode ? '#ff5c39' : '#a9d0ff';
    ctx.shadowBlur = 14;
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawPowerUps() {
  for (const item of state.powerUps) {
    const type = POWERUP_TYPES[item.type];
    ctx.beginPath();
    ctx.fillStyle = type.color;
    ctx.shadowColor = type.color;
    ctx.shadowBlur = 12;
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#061622';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(type.label.charAt(0), item.x, item.y + 4);
  }
}

function drawRockets() {
  for (const rocket of state.rockets) {
    ctx.fillStyle = '#ff4f8a';
    ctx.shadowColor = '#ff7ea8';
    ctx.shadowBlur = 10;
    roundedRect(ctx, rocket.x, rocket.y, rocket.width, rocket.height, 4, true, false);
    ctx.shadowBlur = 0;
  }
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.beginPath();
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function draw() {
  drawBackground();

  for (const brick of state.bricks) {
    renderBrick(brick);
  }

  drawRockets();
  drawPaddle();
  drawBalls();
  drawPowerUps();
  drawParticles();

  if (!state.running && state.balls.length === 0 && state.lives > 0) {
    ctx.fillStyle = 'rgba(10, 14, 18, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '700 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Presiona Iniciar', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '500 18px sans-serif';
    ctx.fillStyle = '#a7c5d8';
    ctx.fillText('Mouse / flechas / A / D', canvas.width / 2, canvas.height / 2 + 25);
  }
}

function launchBall() {
  if (state.balls.length === 0) {
    resetBallState();
  }

  const ball = state.balls[0];
  if (!ball) return;

  if (ball.stuck) {
    ball.stuck = false;
    ball.vx = (Math.random() > 0.5 ? 1 : -1) * 220;
    ball.vy = -240;
    ball.x = state.paddle.x + state.paddle.width / 2;
    ball.y = state.paddle.y - ball.radius - 4;
  }
}

function handleKeyChange(event, isPressed) {
  const code = event.key.toLowerCase();
  if (code === 'arrowleft' || code === 'a') state.keyLeft = isPressed;
  if (code === 'arrowright' || code === 'd') state.keyRight = isPressed;
  if (code === ' ' && isPressed) {
    if (!state.running) {
      state.running = true;
      setStatus('Jugando');
      updateHud();
    }
    launchBall();
  }

  if (code === 'p' && isPressed) {
    state.paused = !state.paused;
    setStatus(state.paused ? 'Pausado' : 'Jugando');
  }
}

startBtn.addEventListener('click', () => {
  if (!state.started) {
    state.started = true;
  }
  state.running = true;
  state.paused = false;
  setStatus('Jugando');
  updateHud();
  launchBall();
});

pauseBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  setStatus(state.paused ? 'Pausado' : 'Jugando');
});

imageInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) loadImageBricks(file);
});

window.addEventListener('keydown', (event) => handleKeyChange(event, true));
window.addEventListener('keyup', (event) => handleKeyChange(event, false));

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  state.pointerX = (event.clientX - rect.left) * scaleX;
});

canvas.addEventListener('click', () => {
  if (!state.running) {
    state.running = true;
    state.paused = false;
    setStatus('Jugando');
  }
  launchBall();
});

resetPaddle();
state.bricks = generateDefaultBricks();
resetBallState();
updateHud();
requestAnimationFrame(loop);
