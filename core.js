/* ============================================================
   core.js — ядро игры
   • Канвас 16:9 с фиксированным логическим разрешением
   • Адаптивность через CSS + учёт devicePixelRatio
   • Игровой цикл на requestAnimationFrame с delta time
   • FPS-счётчик для проверки
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
  SCROLL_SPEED: 360, // px/сек. Базовая скорость мира (в игре — скорость движения уровня влево)
  DEBUG: true,       // рисовать временную сцену, пока нет модуля level.js
};

// Общая палитра — пригодится в player.js и level.js
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
  state: 'boot',     // позже: 'menu' | 'playing' | 'dead' (см. ui.js)
  time: 0,           // суммарное время с запуска (сек)
  lastDelta: 0,      // Δt последнего кадра (сек) — для вывода на экран
  worldX: 0,         // сколько мир «прокрутился» влево (для параллакса)
};

// Константы временной сцены
const CELL = 72;                          // размер клетки сетки
const GROUND_Y = CONFIG.HEIGHT - 120;     // уровень земли

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
  // Слушаем ресайз на случай смены devicePixelRatio (зум браузера, перенос на другой монитор)
  window.addEventListener('resize', fitCanvas);
}

function fitCanvas() {
  // Внутренний буфер канваса = логика × devicePixelRatio → чёткая картинка на Retina.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  Game.canvas.width  = CONFIG.WIDTH  * dpr;
  Game.canvas.height = CONFIG.HEIGHT * dpr;
  // Дальше рисуем в привычных координатах 1280×720 — про DPR забываем.
  Game.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ────────────────────────────────────────────────────────────
   4. ИГРОВОЙ ЦИКЛ: requestAnimationFrame + delta time
   ──────────────────────────────────────────────────────────── */
let lastTime = 0;   // timestamp предыдущего кадра
let fpsTimer = 0;   // аккумулятор времени для FPS
let fpsFrames = 0;  // аккумулятор кадров для FPS

function loop(now) {
  // Регистрируем следующий кадр сразу, даже если текущий упадёт с ошибкой
  requestAnimationFrame(loop);

  // --- Считаем время кадра (Δt в секундах) ---
  if (lastTime === 0) lastTime = now;          // первый кадр после старта/фокуса
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > CONFIG.MAX_DELTA) dt = CONFIG.MAX_DELTA; // кламп против скачков

  Game.time += dt;
  Game.lastDelta = dt;

  update(dt);   // логика
  render();     // отрисовка
  trackFPS(dt); // статистика в HUD
}

/* ────────────────────────────────────────────────────────────
   5. UPDATE — логика кадра
   ──────────────────────────────────────────────────────────── */
function update(dt) {
  // Временная сцена: мир равномерно едет влево.
  // Именно так потом будет двигаться уровень относительно игрока.
  Game.worldX += CONFIG.SCROLL_SPEED * dt;

  // Подключаем будущие модули, если файл уже добавлен в index.html.
  // Пока файлов нет — условия просто не срабатывают.
  if (window.Input)  Input.update?.(dt);
  if (window.Player) Player.update?.(dt);
  if (window.Level)  Level.update?.(dt);
  if (window.UI)     UI.update?.(dt);
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

  // Позже порядок будет таким:
  // Level.render(ctx);  → блоки и шипы
  // Player.render(ctx); → куб
  // UI.render(ctx);     → прогресс-бар и меню
}

// Временная сцена: сетка, земля, статус ядра
function drawDebugScene(ctx) {
  const W = CONFIG.WIDTH;
  const H = CONFIG.HEIGHT;
  const offset = -(Game.worldX % CELL); // сдвиг сетки влево

  // --- Сетка фона: вертикали бегут, горизонтали статичны ---
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offset; x <= W + CELL; x += CELL) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GROUND_Y);
  }
  for (let y = GROUND_Y - CELL; y > 0; y -= CELL) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // --- Земля ---
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Неоновая кромка земли
  ctx.save();
  ctx.strokeStyle = COLORS.groundLine;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.groundLine;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
  ctx.restore();

  // Клетки на земле, бегущие влево вместе с миром
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
  ctx.lineWidth = 2;
  for (let x = offset; x <= W + CELL; x += CELL) {
    ctx.strokeRect(x + 8, GROUND_Y + 14, CELL - 16, CELL - 28);
  }

  // --- «Призрак» будущего куба (сюда придёт player.js) ---
  const ghostSize = 40;
  const ghostX = 220;
  const ghostY = GROUND_Y - ghostSize;
  ctx.save();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(ghostX, ghostY, ghostSize, ghostSize);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 179, 0, 0.65)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('player.js', ghostX + ghostSize / 2, ghostY - 10);
  ctx.restore();

  // --- Статус ядра ---
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.text;
  ctx.font = '44px "Russo One", "Arial Black", sans-serif';
  ctx.fillText('CORE.JS', W / 2, H / 2 - 74);

  ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
  ctx.font = '18px "JetBrains Mono", monospace';
  ctx.fillText('Игровой цикл активен · requestAnimationFrame', W / 2, H / 2 - 34);

  // Живые показатели кадра — доказательство, что Δt считается
  ctx.fillStyle = COLORS.accent;
  ctx.font = '16px "JetBrains Mono", monospace';
  ctx.fillText(
    `Δt = ${(Game.lastDelta * 1000).toFixed(1)} мс · мир прокручен: ${Math.floor(Game.worldX)} px`,
    W / 2, H / 2 - 2
  );

  // Служебная строка: текущее разрешение и DPR
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(234, 246, 255, 0.35)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText(
    `${CONFIG.WIDTH}×${CONFIG.HEIGHT} · DPR ×${(window.devicePixelRatio || 1).toFixed(1)} → буфер ${Game.canvas.width}×${Game.canvas.height}`,
    14, H - 14
  );
}

/* ────────────────────────────────────────────────────────────
   7. FPS-СЧЁТЧИК (обновляем HUD раз в CONFIG.FPS_UPDATE сек,
      чтобы не дёргать DOM каждый кадр)
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

  // Возврат на вкладку: обнуляем метку времени, чтобы первый кадр
  // после паузы получил Δt ≈ 0, а не «прыжок» в несколько секунд.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastTime = 0;
  });

  requestAnimationFrame(loop);
  console.log('[core.js] Ядро запущено:', `${CONFIG.WIDTH}×${CONFIG.HEIGHT}, 16:9`);
}

// Экспортируем в глобальную область — модули будут читать CONFIG, COLORS и Game
window.CONFIG = CONFIG;
window.COLORS = COLORS;
window.Game = Game;

// Запуск после построения DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}