/* ============================================================
   player.js — куб игрока
   • Физика: гравитация, прыжок, предел скорости падения
   • Приземление на «землю» (позже — на блоки из level.js)
   • Хитбокс чуть меньше спрайта (готово для коллизий AABB)
   • Отрисовка: цветной куб с вращением, тенью и шлейфом
   ============================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────
   1. НАСТРОЙКИ ФИЗИКИ (подобраны под логические 1280×720)
   ──────────────────────────────────────────────────────────── */
const PHYSICS = {
  gravity: 5000,        // px/сек² — ускорение свободного падения
  jumpVelocity: -1300,  // px/сек — импульс прыжка (минус = вверх)
  maxFallSpeed: 2400,   // px/сек — предел скорости падения
  rotationSpeed: 6.05,  // рад/сек — ≈180° за время прыжка, как в GD
};

// Отступ хитбокса от краёв спрайта: хитбокс ЧУТЬ МЕНЬШЕ картинки
const HITBOX_INSET = 3;

/* ────────────────────────────────────────────────────────────
   2. КЛАСС ИГРОКА
   ──────────────────────────────────────────────────────────── */
class Player {
  /**
   * @param {number} x    — позиция по X (игрок по X НЕ двигается)
   * @param {number} size — размер куба в px
   */
  constructor(x = 220, size = 40) {
    this.size = size;

    // Стартовые координаты: куб в левой части экрана.
    // Спавним его чуть выше земли — при загрузке красиво упадёт вниз.
    this.startX = x;
    this.floorY = CONFIG.GROUND_Y - size; // Y, при котором куб стоит на земле
    this.x = x;
    this.y = this.floorY - 140;

    // Динамика
    this.velocityY = 0;     // скорость по Y, px/сек
    this.onGround = false;  // стоит ли куб на поверхности
    this.rotation = 0;      // текущий угол, рад (для отрисовки)
    this.squash = 1;        // деформация: 1 = норма, <1 сплющен, >1 растянут

    // Шлейф из искр при скольжении по земле
    this.trail = [];

    this.color = '#00e5ff'; // основной цвет куба
  }

  /* ── ПРЫЖОК ───────────────────────────────────────────────
     Прыжок разрешён только с земли. Позже input.js добавит
     буфер прыжка и hold-to-jump поверх этого метода.         */
  jump() {
    if (!this.onGround) return false;
    this.velocityY = PHYSICS.jumpVelocity;
    this.onGround = false;
    this.squash = 1.28; // лёгкое растяжение вверх в момент отрыва
    return true;
  }

  /* ── ЛОГИКА КАДРА ──────────────────────────────────────── */
  update(dt) {
    // 1. Гравитация: полу-неявный Эйлер — сначала скорость, потом позиция
    this.velocityY += PHYSICS.gravity * dt;
    if (this.velocityY > PHYSICS.maxFallSpeed) {
      this.velocityY = PHYSICS.maxFallSpeed; // терминальная скорость
    }
    this.y += this.velocityY * dt;

    // 2. Пол: не даём кубу провалиться ниже уровня земли.
    //    Позже этот блок расширится коллизиями с блоками из level.js.
    if (this.y >= this.floorY) {
      if (!this.onGround) this.onLand();
      this.y = this.floorY;
      this.velocityY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // 3. Вращение: в воздухе куб крутится, на земле — плавно
    //    доворачивается до ближайших 90°, как в оригинале.
    if (!this.onGround) {
      this.rotation += PHYSICS.rotationSpeed * dt;
    } else {
      const quarter = Math.PI / 2;
      const target = Math.round(this.rotation / quarter) * quarter;
      this.rotation += (target - this.rotation) * Math.min(1, dt * 20);
    }

    // 4. Squash/stretch плавно возвращается к норме
    this.squash += (1 - this.squash) * Math.min(1, dt * 10);

    // 5. Шлейф из искр
    this.updateTrail(dt);
  }

  // Момент приземления: сплющиваем куб для «сочности»
  onLand() {
    this.squash = 0.65;
  }

  // Полный сброс к старту (понадобится при смерти в связке с ui.js)
  reset() {
    this.x = this.startX;
    this.y = this.floorY - 140;
    this.velocityY = 0;
    this.onGround = false;
    this.rotation = 0;
    this.squash = 1;
    this.trail.length = 0;
  }

  /* ── ХИТБОКС ─────────────────────────────────────────────
     Чуть меньше спрайта — честные коллизии для level.js     */
  getHitbox() {
    const i = HITBOX_INSET;
    return {
      x: this.x + i,
      y: this.y + i,
      w: this.size - i * 2,
      h: this.size - i * 2,
    };
  }

  /* ── ШЛЕЙФ ─────────────────────────────────────────────── */
  updateTrail(dt) {
    // Искры появляются, пока куб скользит по земле
    if (this.onGround) {
      this.trail.push({
        x: this.x + 2,
        y: this.y + this.size - 4 - Math.random() * 6,
        s: 3 + Math.random() * 4,
        life: 0.35,
        maxLife: 0.35,
      });
    }
    if (this.trail.length > 48) this.trail.shift();

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];
      p.x -= CONFIG.SCROLL_SPEED * dt; // искры уезжают влево вместе с миром
      p.life -= dt;
      if (p.life <= 0) this.trail.splice(i, 1);
    }
  }

  drawTrail(ctx) {
    for (const p of this.trail) {
      const a = p.life / p.maxLife;
      const s = p.s * a;
      ctx.fillStyle = `rgba(0, 229, 255, ${a * 0.45})`;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  // Мягкая тень на земле: тем меньше и бледнее, чем выше куб
  drawShadow(ctx) {
    const height = CONFIG.GROUND_Y - (this.y + this.size);
    const t = Math.max(0, Math.min(1, 1 - height / 320));
    if (t <= 0) return;

    ctx.fillStyle = `rgba(0, 0, 0, ${0.28 * t})`;
    ctx.beginPath();
    ctx.ellipse(
      this.x + this.size / 2,
      CONFIG.GROUND_Y + 7,
      (this.size / 2) * (0.55 + 0.45 * t),
      2 + 5 * t,
      0, 0, Math.PI * 2
    );
    ctx.fill();
  }

  /* ── ОТРИСОВКА ─────────────────────────────────────────── */
  draw(ctx) {
    this.drawTrail(ctx);
    this.drawShadow(ctx);

    const half = this.size / 2;

    ctx.save();
    // Центр куба → поворот вокруг центра → деформация
    ctx.translate(this.x + half, this.y + half);
    ctx.rotate(this.rotation);
    ctx.scale(1 + (1 - this.squash) * 0.6, this.squash);

    // Тело
    ctx.fillStyle = this.color;
    ctx.fillRect(-half, -half, this.size, this.size);

    // Тёмная обводка
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4, 24, 32, 0.9)';
    ctx.strokeRect(-half + 1.5, -half + 1.5, this.size - 3, this.size - 3);

    // Внутренняя рамка
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.strokeRect(-half + 7, -half + 7, this.size - 14, this.size - 14);

    // «Глаза»
    ctx.fillStyle = 'rgba(4, 24, 32, 0.9)';
    ctx.fillRect(-9, -8, 6, 10);
    ctx.fillRect(3, -8, 6, 10);

    ctx.restore();

    // В режиме отладки показываем реальный хитбокс
    if (CONFIG.DEBUG) this.drawHitbox(ctx);
  }

  drawHitbox(ctx) {
    const hb = this.getHitbox();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 179, 0, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    ctx.restore();
  }
}

// Класс доступен глобально — модули без сборщиков общаются через window
window.Player = Player;