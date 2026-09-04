/* Типы тайлов — как договорились: 0 пусто, 1 блок, 2 шип */
const TILE = { EMPTY: 0, BLOCK: 1, SPIKE: 2 };

// Проверка пересечения двух прямоугольников {x, y, w, h}
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ────────────────────────────────────────────────────────────
   2. КЛАСС УРОВНЯ
   ──────────────────────────────────────────────────────────── */
class Level {
  constructor() {
    this.tiles = [];
    this.parse(LEVEL_MAP);

    const C = CONFIG.CELL;
    // Стартовый сдвиг: уровень появляется за правой границей экрана,
    // кратно размеру клетки — чтобы блоки совпадали с сеткой пола.
    this.startOffset = Math.ceil((CONFIG.WIDTH + C * 2) / C) * C;
    this.offset = this.startOffset;

    this.widthPx = LEVEL_MAP[0].length * C; // полная длина уровня в px

    // Низ куба в прошлом кадре — для различения «приземлился сверху»
    // и «врезался в торец». До первого кадра коллизий не случится.
    this.prevBottom = 0;
  }

  /* ── Разбор карты в список тайлов с мировыми координатами ── */
  parse(map) {
    const rows = map.length;
    const C = CONFIG.CELL;

    for (let r = 0; r < rows; r++) {
      const line = map[r];
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === '.') continue; // 0 — пусто

        this.tiles.push({
          type: ch === '#' ? TILE.BLOCK : TILE.SPIKE,
          x: c * C,                                   // мировая X
          y: CONFIG.GROUND_Y - (rows - r) * C,        // Y отсчитываем от земли вверх
        });
      }
    }
  }

  /* ── Полный сброс уровня (смерть или новый круг) ── */
  reset() {
    this.offset = this.startOffset;
  }

  /* ── ЛОГИКА КАДРА ──────────────────────────────────────── */
  update(dt) {
    // Уровень едет влево с фиксированной скоростью — игрок по X неподвижен
    this.offset -= CONFIG.SCROLL_SPEED * dt;

    // Уровень полностью ушёл за левый край → заводим его по второму кругу
    if (this.offset + this.widthPx < -CONFIG.CELL) {
      this.reset();
    }

    const player = Game.player;
    if (player) this.handleCollisions(player);

    // Запоминаем низ куба ПОСЛЕ всех разрешений этого кадра
    if (player) this.prevBottom = player.y + player.size;
  }

  /* ── КОЛЛИЗИИ ──────────────────────────────────────────── */
  handleCollisions(player) {
    const hb = player.getHitbox(); // хитбокс чуть меньше спрайта
    const C = CONFIG.CELL;

    for (const t of this.tiles) {
      const sx = t.x + this.offset; // экранная X тайла

      // Быстрый отсев тайлов вне зоны игрока
      if (sx + C < hb.x - 8 || sx > hb.x + hb.w + 8) continue;

      if (t.type === TILE.SPIKE) {
        // У шипа свой, «честный» хитбокс — меньше треугольника
        const sh = {
          x: sx + C * 0.30,
          y: t.y + C * 0.28,
          w: C * 0.40,
          h: C * 0.72,
        };
        if (overlaps(hb, sh)) { this.kill(player); return; }

      } else if (t.type === TILE.BLOCK) {
        const block = { x: sx, y: t.y, w: C, h: C };
        if (!overlaps(hb, block)) continue;

        // Если куб падает и в прошлом кадре был выше верха блока —
        // это посадка: ставим куб на верх и даём скользить по нему.
        const landing = player.velocityY >= 0 && this.prevBottom <= t.y + 10;

        if (landing) {
          player.y = t.y - player.size;
          player.velocityY = 0;
          if (!player.onGround) player.onLand(); // сплющивание при посадке
          player.onGround = true;
        } else {
          // Врезались в торец или снизу — мгновенная смерть
          this.kill(player);
          return;
        }
      }
    }
  }

  /* ── СМЕРТЬ: сброс уровня + игрока, счётчик попыток ────── */
  kill(player) {
    Game.attempts++;       // счётчик попыток (позже его заберёт ui.js)
    Game.flash = 0.22;     // белая вспышка на экране (рисует core.js)
    player.reset();
    this.reset();
    console.log(`[level.js] Столкновение. Попытка №${Game.attempts}`);
  }

  /* ── ОТРИСОВКА ─────────────────────────────────────────── */
  draw(ctx) {
    const C = CONFIG.CELL;

    for (const t of this.tiles) {
      const sx = t.x + this.offset;
      if (sx + C < 0 || sx > CONFIG.WIDTH) continue; // за экраном не рисуем

      if (t.type === TILE.BLOCK) this.drawBlock(ctx, sx, t.y);
      else this.drawSpike(ctx, sx, t.y);
    }
  }

  drawBlock(ctx, x, y) {
    const C = CONFIG.CELL;

    // Тело блока
    ctx.fillStyle = '#0f1b36';
    ctx.fillRect(x, y, C, C);

    // Светящаяся неоновая рамка
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
    ctx.shadowBlur = 10;
    ctx.strokeRect(x + 1.5, y + 1.5, C - 3, C - 3);
    ctx.restore();

    // Внутренний узор и блик сверху
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 12, y + 12, C - 24, C - 24);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.22)';
    ctx.fillRect(x + 4, y + 4, C - 8, 5);
  }

  drawSpike(ctx, x, y) {
    const C = CONFIG.CELL;

    // Треугольник остриём вверх
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + C / 2, y + 3);
    ctx.lineTo(x + C - 3, y + C);
    ctx.lineTo(x + 3, y + C);
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 179, 0, 0.85)';
    ctx.shadowColor = 'rgba(255, 179, 0, 0.55)';
    ctx.shadowBlur = 12;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(40, 24, 0, 0.9)';
    ctx.stroke();
    ctx.restore();

    // В отладке показываем честный хитбокс шипа
    if (CONFIG.DEBUG) {
      const sh = {
        x: x + C * 0.30, y: y + C * 0.28,
        w: C * 0.40, h: C * 0.72,
      };
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sh.x, sh.y, sh.w, sh.h);
      ctx.restore();
    }
  }
}

// Класс доступен глобально — ядро создаст экземпляр в init()
window.Level = Level;