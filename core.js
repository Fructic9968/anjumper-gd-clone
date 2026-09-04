/* ============================================================
   core.js — ядро игры
   • Канвас 16:9 с фиксированным логическим разрешением
   • Адаптивность через CSS + учёт devicePixelRatio
   • Игровой цикл на requestAnimationFrame с delta time
   • FPS-счётчик + интеграция модуля игрока (player.js)
   ============================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────
   1. КОНФИГУРАЦИЯ (позже её читают все модули)
   ──────────────────────────────────────────────────────────── */
const CONFIG = {
  // Логическое разрешение ВСЕГДА 1280×720 (16:9).
  // Экран может быть любым — картинку масштабирует CSS,
  // поэтому физика и координаты от размера окна не зависят.
  WIDTH: 1280,
  HEIGHT: 720,

  MAX_DELTA: 0.1,    // сек. Потолок Δt: защита от «телепорта» после сворачивания вкладки
  FPS_UPDATE: 0.5,   // сек. Как часто обновлять HUD со счётчиком FPS
  SCROLL_SPEED: 360, // px/сек. Базовая скорость мира (движение уровня влево)
  DEBUG: true,       // отладочная информация и хитбоксы на экране
};

// Уровень земли: верхний край пола. От него отталкиваются
// игрок (player.js) и будущие блоки уровня (level.js).
CONFIG.GROUND_Y = CONFIG.HEIGHT - 120;

// Общая палитра — ей пользуются все модули
const COLORS = {
  bgTop:      '#101532',
  bgBottom:   '#1c1040',
  grid:       'rgba(0, 229, 255, 0.07)',
  ground:     '#0b0f22',
  groundLine: '#00e5ff',
  accent:     '#ffb300',
  text:       '#eaf6ff',
};

/* ────────────────────────────────────────────────────────────
   2. СОСТОЯНИЕ ИГРЫ
   ──────────────────────────────────────────────────────────── */
const Game = {
  canvas: null,
  ctx: null,
  player: null,      // экземпляр куба из player.js
  state: 'boot',     // позже: 'menu' | 'playing' | 'dead' (см. ui.js)
  time: 0,           // суммарное время с запуска (сек)
  lastDelta: 0,      // Δt последнего кадра (сек)
  worldX: 0,         // сколько мир «прокрутился» влево
};

// Константа временной сцены
const CELL = 72; // размер клетки сетки

// Ссылки на HUD (инициализируются в init)
let fpsValueEl = null;
let fpsMsEl = null;

/* ────────────────────────────────────────────────────────────
   3. CANVAS И АДАПТИВНОСТЬ
   ──────────────────────────────────────────────────────────── */
function initCanvas() {
  Game.canvas = document.getElementById('game');
  Game.ctx = Game.canvas.getContext('2d');
  fitCanvas();
  // Слушаем ресайз на случай смены devicePixelRatio (зум, другой монитор)
  window.addEventListener('resize', fitCanvas);
}

function fitCanvas() {
  // Внутренний буфер = логика × devicePixelRatio → чёткость на Retina
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  Game.canvas.width  = CONFIG.WIDTH  * dpr;
  Game.canvas.height = CONFIG.HEIGHT * dpr;
  // Дальше рисуем в координатах 1280×720 — про DPR забываем
  Game.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ────────────────────────────────────────────────────────────
   4. ИГРОВОЙ ЦИКЛ: requestAnimationFrame + delta time
   ──────────────────────────────────────────────────────────── */
let lastTime = 0;
let fpsTimer = 0;
let fpsFrames = 0;

function loop(now) {
  requestAnimationFrame(loop);

  // --- Время кадра (Δt в секундах) ---
  if (lastTime === 0) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > CONFIG.MAX_DELTA) dt = CONFIG.MAX_DELTA;

  Game.time += dt;
  Game.lastDelta = dt;

  update(dt);
  render();
  trackFPS(dt);
}

/* ────────────────────────────────────────────────────────────
   5. UPDATE — логика кадра
   ──────────────────────────────────────────────────────────── */
function update(dt) {
  // Мир равномерно едет влево — игрок по X неподвижен
  Game.worldX += CONFIG.SCROLL_SPEED * dt;

  // Куб обновляется первым — уровню позже нужны его актуальные координаты
  if (Game.player) Game.player.update(dt);

  // Подключаем будущие модули, если они уже добавлены в index.html
  if (window.Input) Input.update?.(dt);
  if (window.Level) Level.update?.(dt);
  if (window.UI)    UI.update?.(dt);
}

/* ────────────────────────────────────────────────────────────
   6. RENDER — отрисовка кадра
   ──────────────────────────────────────────────────────────── */
function render() {
  const ctx = Game.ctx;

  // Фон: вертикальный градиент ночного неба
  const g = ctx.createLinearGradient(0, 0, 0, CONFIG.HEIGHT);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  if (CONFIG.DEBUG) drawDebugScene(ctx);

  // Порядок слоёв: фон/сетка → уровень → игрок → интерфейс
  // Позже сюда добавится Level.render(ctx) перед игроком.
  if (Game.player) Game.player.draw(ctx);
}

// Временная сцена: сетка, земля, статус ядра
function drawDebugScene(ctx) {
  const W = CONFIG.WIDTH;
  const H = CONFIG.HEIGHT;
  const GY = CONFIG.GROUND_Y;
  const offset = -(Game.worldX % CELL);

  // --- Сетка фона: вертикали бегут, горизонтали статичны ---
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offset; x <= W + CELL; x += CELL) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GY);
  }
  for (let y = GY - CELL; y > 0; y -= CELL) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // --- Земля ---
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, GY, W, H - GY);

  // Неоновая кромка земли
  ctx.save();
  ctx.strokeStyle = COLORS.groundLine;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.groundLine;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, GY);
  ctx.lineTo(W, GY);
  ctx.stroke();
  ctx.restore();

  // Клетки на земле, бегущие влево вместе с миром
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
  ctx.lineWidth = 2;
  for (let x = offset; x <= W + CELL; x += CELL) {
    ctx.strokeRect(x + 8, GY + 14, CELL - 16, CELL - 28);
  }

  // --- Статус ядра и телеметрия ---
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.text;
  ctx.font = '44px "Russo One", "Arial Black", sans-serif';
  ctx.fillText('CORE.JS', W / 2, H / 2 - 92);

  ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
  ctx.font = '18px "JetBrains Mono", monospace';
  ctx.fillText('player.js подключён · [ПРОБЕЛ] / клик — прыжок (временно)', W / 2, H / 2 - 52);

  ctx.fillStyle = COLORS.accent;
  ctx.font = '15px "JetBrains Mono", monospace';
  ctx.fillText(
    `Δt = ${(Game.lastDelta * 1000).toFixed(1)} мс · мир: ${Math.floor(Game.worldX)} px`,
    W / 2, H / 2 - 26
  );

  // Живые показатели физики куба — удобно проверять гравитацию
  if (Game.player) {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.fillText(
      `куб: y = ${Game.player.y.toFixed(0)} px · vY = ${Game.player.velocityY.toFixed(0)} px/с · ` +
      (Game.player.onGround ? 'на земле' : 'в воздухе'),
      W / 2, H / 2 - 4
    );
  }

  // Служебная строка: разрешение и DPR
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(234, 246, 255, 0.35)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText(
    `${CONFIG.WIDTH}×${CONFIG.HEIGHT} · DPR ×${(window.devicePixelRatio || 1).toFixed(1)} → буфер ${Game.canvas.width}×${Game.canvas.height}`,
    14, H - 14
  );
}

/* ────────────────────────────────────────────────────────────
   7. FPS-СЧЁТЧИК
   ──────────────────────────────────────────────────────────── */
function trackFPS(dt) {
  fpsFrames++;
  fpsTimer += dt;

  if (fpsTimer >= CONFIG.FPS_UPDATE) {
    const fps = fpsFrames / fpsTimer;
    fpsValueEl.textContent = Math.round(fps);
    fpsMsEl.textContent = `${(1000 / fps).toFixed(1)} мс/кадр`;
    fpsFrames = 0;
    fpsTimer = 0;
  }
}

/* ────────────────────────────────────────────────────────────
   8. СТАРТ
   ──────────────────────────────────────────────────────────── */
function init() {
  fpsValueEl = document.getElementById('fps-value');
  fpsMsEl    = document.getElementById('fps-ms');

  initCanvas();

  // Возврат на вкладку: обнуляем метку времени против «скачка» Δt
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastTime = 0;
  });

  // --- Создаём игрока, если модуль уже загружен ---
  // Защита: без раскомментированного <script src="player.js">
  // ядро продолжит работать в режиме заглушки.
  if (typeof Player !== 'undefined') {
    Game.player = new Player(); // x=220, size=40 по умолчанию
  }

  /* ── ВРЕМЕННОЕ УПРАВЛЕНИЕ ────────────────────────────────
     Только для проверки физики. Будет полностью заменено
     модулем input.js: там появятся правильный hold-to-jump,
     буфер прыжка и поддержка всех устройств.                */
  const tryJump = () => { if (Game.player) Game.player.jump(); };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault(); // чтобы страница не скроллилась
      tryJump();          // повторные срабатывания при удержании = черновик hold
    }
  });

  Game.canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // мышь и тач обрабатываются одинаково
    tryJump();
  });

  requestAnimationFrame(loop);
  console.log('[core.js] Ядро запущено:', `${CONFIG.WIDTH}×${CONFIG.HEIGHT}, 16:9`);
}

// Экспорт для остальных модулей
window.CONFIG = CONFIG;
window.COLORS = COLORS;
window.Game = Game;

// Запуск после построения DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
