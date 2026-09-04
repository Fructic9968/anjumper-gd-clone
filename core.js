/* ============================================================
   core.js — ядро игры
   • Канвас 16:9, адаптивность, devicePixelRatio
   • Игровой цикл на requestAnimationFrame с delta time
   • FPS-счётчик, счётчик попыток, вспышка смерти
   • Интеграция: input.js + player.js + level.js
   ============================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────
   1. КОНФИГУРАЦИЯ (её читают все модули)
   ──────────────────────────────────────────────────────────── */
const CONFIG = {
  // Логическое разрешение ВСЕГДА 1280×720 (16:9).
  // Экран может быть любым — картинку масштабирует CSS,
  // поэтому физика и координаты от размера окна не зависят.
  WIDTH: 1280,
  HEIGHT: 720,
  CELL: 72,          // размер одной клетки мира (блоки, шипы, сетка)

  MAX_DELTA: 0.1,    // сек. Потолок Δt против «телепорта» после сворачивания
  FPS_UPDATE: 0.5,   // сек. Период обновления HUD со счётчиком FPS
  SCROLL_SPEED: 360, // px/сек. Скорость движения уровня влево
  DEBUG: true,       // отладочная информация и хитбоксы на экране
};

// Уровень земли: верхний край пола
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
  player: null,      // экземпляр куба (player.js)
  level: null,       // экземпляр уровня (level.js)
  state: 'playing',  // позже: 'menu' | 'playing' | 'dead' (см. ui.js)
  attempts: 1,       // счётчик попыток — позже переедет в ui.js
  flash: 0,          // таймер белой вспышки при смерти
  time: 0,           // суммарное время с запуска (сек)
  lastDelta: 0,      // Δt последнего кадра (сек)
  worldX: 0,         // прокрутка фоновой сетки
};

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
   5. UPDATE — логика кадра (порядок модулей важен!)
   ──────────────────────────────────────────────────────────── */
function update(dt) {
  // Фоновая сетка едет с той же скоростью, что и уровень
  Game.worldX += CONFIG.SCROLL_SPEED * dt;

  // 1) Ввод: читаем зажатие и буфер, пробуем прыгнуть
  if (window.Input) Input.update?.(dt);

  // 2) Игрок: гравитация, прыжок, земля
  if (Game.player) Game.player.update(dt);

  // 3) Уровень: движение влево, коллизии, смерть/сброс
  if (Game.level) Game.level.update(dt);

  // 4) Интерфейс (подключится вместе с ui.js)
  if (window.UI) UI.update?.(dt);

  // Затухание вспышки смерти
  if (Game.flash > 0) Game.flash = Math.max(0, Game.flash - dt);
}

/* ────────────────────────────────────────────────────────────
   6. RENDER — отрисовка кадра (порядок слоёв важен!)
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

  // Слои: фон → уровень → игрок → эффекты
  if (Game.level)  Game.level.draw(ctx);
  if (Game.player) Game.player.draw(ctx);

  // Белая вспышка в момент смерти
  if (Game.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(Game.flash / 0.22) * 0.7})`;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  }
}

// Фоновая сетка, земля и служебная информация
function drawDebugScene(ctx) {
  const W = CONFIG.WIDTH;
  const H = CONFIG.HEIGHT;
  const GY = CONFIG.GROUND_Y;
  const C = CONFIG.CELL;
  const offset = -(Game.worldX % C);

  // --- Сетка фона ---
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offset; x <= W + C; x += C) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GY);
  }
  for (let y = GY - C; y > 0; y -= C) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // --- Земля ---
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, GY, W, H - GY);

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

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
  ctx.lineWidth = 2;
  for (let x = offset; x <= W + C; x += C) {
    ctx.strokeRect(x + 8, GY + 14, C - 16, C - 28);
  }

  // --- Счётчик попыток (позже переедет в ui.js) ---
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  ctx.font = '22px "Russo One", "Arial Black", sans-serif';
  ctx.fillText(`ПОПЫТКА № ${Game.attempts}`, 16, 36);
  ctx.fillStyle = 'rgba(234, 246, 255, 0.4)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText('attempts · сброс при столкновении', 16, 54);

  // --- Статус ядра и телеметрия ---
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.text;
  ctx.font = '44px "Russo One", "Arial Black", sans-serif';
  ctx.fillText('CORE.JS', W / 2, H / 2 - 118);

  ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
  ctx.font = '17px "JetBrains Mono", monospace';
  ctx.fillText('input.js + level.js подключены · зажми [ПРОБЕЛ] для серии прыжков', W / 2, H / 2 - 80);

  ctx.fillStyle = COLORS.accent;
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText(
    `Δt = ${(Game.lastDelta * 1000).toFixed(1)} мс · скорость мира: ${CONFIG.SCROLL_SPEED} px/с`,
    W / 2, H / 2 - 56
  );

  if (Game.player) {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.fillText(
      `куб: y = ${Game.player.y.toFixed(0)} px · vY = ${Game.player.velocityY.toFixed(0)} px/с · ` +
      (Game.player.onGround ? 'на земле' : 'в воздухе'),
      W / 2, H / 2 - 36
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

  // --- Подключение модулей с защитой от отсутствия файла ---
  if (typeof Player !== 'undefined') Game.player = new Player(); // куб
  if (typeof Level  !== 'undefined') Game.level  = new Level();  // уровень
  if (window.Input) Input.init();                                 // управление

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
