/**
 * SMART TD - MOBA & MULTI-CELL UPDATE (VISUAL ENHANCED)
 * Features: Allies (Creeps), 1x1/2x2/3x3 Towers, Combat System, UI Overhaul
 * + Улучшенная графика: градиенты, тени, вращение стволов, частицы, трассеры, текстуры
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const bgCanvas = document.createElement("canvas");
const bgCtx = bgCanvas.getContext("2d", { alpha: false });

const COLS = 40,
  ROWS = 40;
let tileSize = 0,
  offsetX = 0,
  offsetY = 0;
let logicalW = 0,
  logicalH = 0;
const mouse = { x: -1, y: -1, col: -1, row: -1 };

const MAX_TOWERS = 15;
const enemies = [],
  towers = [],
  allies = [],
  particles = [];
let gold = 200,
  lives = 20,
  score = 0,
  isGameOver = false;
let goldPerSecond = 5,
  goldTimer = 0,
  allySpawnTimer = 0;
let currentBuildType = "Basic",
  selectedTower = null;
let globalTime = 0;

// ==========================================
// ВИЗУАЛЬНЫЕ УТИЛИТЫ
// ==========================================
function hexToRgb(hex) {
  const c = parseInt(hex.slice(1), 16);
  return { r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff };
}

function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`;
}

function darken(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amt)},${Math.max(0, g - amt)},${Math.max(0, b - amt)})`;
}

function drawRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class Particle {
  constructor(x, y, color, speedMult = 1) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = (40 + Math.random() * 110) * speedMult;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 0.35 + Math.random() * 0.25;
    this.maxLife = this.life;
    this.color = color;
    this.size = 2 + Math.random() * 2.5;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
    this.life -= dt;
  }
  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function spawnBurst(x, y, color, count = 10, speedMult = 1) {
  for (let i = 0; i < count; i++)
    particles.push(new Particle(x, y, color, speedMult));
}

function spawnGoldText(x, y, amount) {
  particles.push({
    x,
    y,
    life: 0.8,
    maxLife: 0.8,
    isText: true,
    amount,
    update(dt) {
      this.y -= 25 * dt;
      this.life -= dt;
    },
    draw(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f1c40f";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+" + this.amount, this.x, this.y);
      ctx.globalAlpha = 1;
    },
  });
}

// ==========================================
// БЕЗОПАСНЫЙ ЗВУКОВОЙ СЛОЙ
// ==========================================
if (typeof window.playSfx !== "function") {
  window.playSfx = function () {};
}
if (typeof window.MUSIC === "undefined") {
  window.MUSIC = { stop: function () {}, play: function () {} };
}
function safePlaySfx(name) {
  try {
    playSfx(name);
  } catch (err) {
    console.warn("Ошибка звука:", name, err);
  }
}
function safeStopMusic() {
  try {
    MUSIC.stop();
  } catch (err) {
    console.warn("Ошибка остановки музыки:", err);
  }
}

// ==========================================
// CONFIG & STATS
// ==========================================
const ENEMY_STATS = {
  Knight: {
    hp: 100,
    speed: 2.0,
    reward: 10,
    color: "#bdc3c7",
    radius: 0.4,
    role: "basic",
    meleeDmg: 15,
    meleeCd: 1.0,
  },
  Mage: {
    hp: 60,
    speed: 2.8,
    reward: 15,
    color: "#9b59b6",
    radius: 0.3,
    role: "basic",
    meleeDmg: 5,
    meleeCd: 0.5,
  },
  Siege: {
    hp: 600,
    speed: 1.0,
    reward: 80,
    color: "#c0392b",
    radius: 0.6,
    role: "siege",
    damage: 30,
    rangeTiles: 7,
    cooldown: 1.5,
    meleeDmg: 40,
    meleeCd: 2.0,
  },
  Digger: {
    hp: 500,
    speed: 1.5,
    reward: 50,
    color: "#f39c12",
    radius: 0.35,
    role: "digger",
    meleeDmg: 20,
    meleeCd: 1.0,
  },
  Titan: {
    hp: 4000,
    speed: 0.8,
    reward: 500,
    color: "#f1c40f",
    radius: 0.8,
    role: "basic",
    meleeDmg: 100,
    meleeCd: 1.5,
  },
};

const ALLY_STATS = {
  Creep: {
    hp: 80,
    speed: 2.0,
    damage: 10,
    cooldown: 1.0,
    color: "#0984e3",
    radius: 0.35,
  },
};

const TOWER_STATS = {
  Basic: {
    cost: 50,
    hp: 200,
    damage: 25,
    rangeTiles: 5,
    cooldown: 0.5,
    color: "#3498db",
    name: "Базовая",
    size: 1,
  },
  Rapid: {
    cost: 100,
    hp: 350,
    damage: 10,
    rangeTiles: 4,
    cooldown: 0.1,
    color: "#f1c40f",
    name: "Пулемет",
    size: 2,
  },
  Sniper: {
    cost: 200,
    hp: 250,
    damage: 150,
    rangeTiles: 14,
    cooldown: 2.0,
    color: "#9b59b6",
    name: "Снайпер",
    size: 3,
  },
};

// ==========================================
// UI FUNCTIONS
// ==========================================
window.selectTower = function (type) {
  currentBuildType = type;
  document
    .querySelectorAll(".build-option")
    .forEach((el) => el.classList.remove("active"));
  const btn = document.getElementById("btn-" + type);
  if (btn) btn.classList.add("active");
  selectedTower = null;
  updateUpgradeUI();
};

window.closeUpgradeMenu = function () {
  selectedTower = null;
  updateUpgradeUI();
};

function updateUI() {
  document.getElementById("ui-lives").innerText = lives;
  document.getElementById("ui-gold").innerText =
    `${Math.floor(gold)} (+${goldPerSecond}/с)`;
  document.getElementById("ui-score").innerText = score;
  const uiTowers = document.getElementById("ui-towers");
  if (uiTowers) {
    uiTowers.innerText = towers.length;
    uiTowers.style.color = towers.length >= MAX_TOWERS ? "#e74c3c" : "white";
  }
  updateUpgradeUI();
}

function updateUpgradeUI() {
  const menu = document.getElementById("upgrade-menu");
  if (!selectedTower) {
    menu.classList.add("hidden");
    return;
  }
  menu.classList.remove("hidden");
  document.getElementById("upg-title").innerText =
    TOWER_STATS[selectedTower.type].name;
  document.getElementById("upg-level").innerText = selectedTower.level;
  document.getElementById("upg-damage").innerText = selectedTower.damage;

  const upgBtn = document.getElementById("btn-upgrade");
  if (selectedTower.level >= 5) {
    upgBtn.innerText = "Макс. Уровень";
    upgBtn.disabled = true;
  } else {
    upgBtn.innerText = `Улучшить (${selectedTower.upgradeCost}g)`;
    upgBtn.disabled = gold < selectedTower.upgradeCost;
  }
  document.getElementById("btn-sell").innerText =
    `Продать (+${Math.floor(selectedTower.totalSpent / 2)}g)`;
}

window.upgradeSelectedTower = function () {
  if (
    selectedTower &&
    selectedTower.level < 5 &&
    gold >= selectedTower.upgradeCost
  ) {
    gold -= selectedTower.upgradeCost;
    selectedTower.upgrade();
    spawnBurst(selectedTower.x, selectedTower.y, "#2ecc71", 16, 1.4);
    updateUI();
    safePlaySfx("towerUpgrade");
  }
};

window.sellSelectedTower = function () {
  if (selectedTower) {
    safePlaySfx("towerSell");
    gold += Math.floor(selectedTower.totalSpent / 2);
    const size = selectedTower.size;
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) {
        let cell = gameGrid.cells[selectedTower.col + c][selectedTower.row + r];
        cell.hasTower = false;
        cell.towerRef = null;
      }
    }
    towers.splice(towers.indexOf(selectedTower), 1);
    selectedTower = null;
    pathfinder.calculateFields();
    updateUI();
  }
};

class MinHeap {
  constructor() {
    this.heap = [];
  }
  push(node) {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length <= 1) return this.heap.pop();
    const top = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.sinkDown(0);
    return top;
  }
  bubbleUp(idx) {
    const element = this.heap[idx];
    while (idx > 0) {
      let pIdx = Math.floor((idx - 1) / 2),
        parent = this.heap[pIdx];
      if (element.dist >= parent.dist) break;
      this.heap[pIdx] = element;
      this.heap[idx] = parent;
      idx = pIdx;
    }
  }
  sinkDown(idx) {
    const length = this.heap.length,
      element = this.heap[idx];
    while (true) {
      let leftIdx = 2 * idx + 1,
        rightIdx = 2 * idx + 2,
        swap = null;
      if (leftIdx < length && this.heap[leftIdx].dist < element.dist)
        swap = leftIdx;
      if (
        rightIdx < length &&
        (swap === null
          ? this.heap[rightIdx].dist < element.dist
          : this.heap[rightIdx].dist < this.heap[leftIdx].dist)
      )
        swap = rightIdx;
      if (swap === null) break;
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }
  isEmpty() {
    return this.heap.length === 0;
  }
}

// ==========================================
// ENTITIES (Enemies & Allies)
// ==========================================
class Enemy {
  constructor(type, hpMultiplier = 1) {
    this.type = type;
    const stats = ENEMY_STATS[type];
    this.maxHp = Math.floor(stats.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.speed = stats.speed;
    this.reward = stats.reward;
    this.color = stats.color;
    this.radius = stats.radius;
    this.role = stats.role;

    this.meleeDmg = stats.meleeDmg;
    this.meleeCd = stats.meleeCd;
    this.meleeTimer = 0;
    this.damage = stats.damage || 0;
    this.rangeTiles = stats.rangeTiles || 0;
    this.range = this.rangeTiles * tileSize;
    this.cooldown = stats.cooldown || 0;
    this.timeSinceAttack = 0;

    this.targetTower = null;
    this.isFiring = false;
    this.isDigging = false;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.facingAngle = 0;
    this.trail = null;
    this.hitFlash = 0;
    this._lastHp = this.hp;

    const spawnTile = pathfinder.spawnTile;
    this.col = spawnTile.col;
    this.row = spawnTile.row;
    this.x = offsetX + this.col * tileSize + tileSize / 2;
    this.y = offsetY + this.row * tileSize + tileSize / 2;
    this.targetX = this.x;
    this.targetY = this.y;
    this.reachedBase = false;
  }

  update(dt) {
    this.isFiring = false;
    this.bobPhase += dt * 6;
    if (this.hp < this._lastHp) {
      this.hitFlash = 0.15;
      spawnBurst(this.x, this.y, "#ffffff", 3, 0.5);
    }
    this._lastHp = this.hp;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.trail) {
      this.trail.life -= dt;
      if (this.trail.life <= 0) this.trail = null;
    }

    let engagedAlly = null;
    for (let a of allies) {
      if (Math.hypot(this.x - a.x, this.y - a.y) < tileSize * 0.8) {
        engagedAlly = a;
        break;
      }
    }

    if (engagedAlly) {
      this.facingAngle = Math.atan2(
        engagedAlly.y - this.y,
        engagedAlly.x - this.x,
      );
      this.meleeTimer += dt;
      if (this.meleeTimer >= this.meleeCd) {
        engagedAlly.hp -= this.meleeDmg;
        this.meleeTimer = 0;
      }
      return;
    }

    if (this.role === "siege") {
      this.timeSinceAttack += dt;
      if (!this.targetTower || this.targetTower.hp <= 0) {
        this.targetTower = null;
        for (let t of towers) {
          if (Math.hypot(this.x - t.x, this.y - t.y) <= this.range) {
            this.targetTower = t;
            break;
          }
        }
      }
      if (this.targetTower) {
        this.facingAngle = Math.atan2(
          this.targetTower.y - this.y,
          this.targetTower.x - this.x,
        );
        if (this.timeSinceAttack >= this.cooldown) {
          this.targetTower.hp -= this.damage;
          this.timeSinceAttack = 0;
          this.isFiring = true;
          this.trail = {
            x2: this.targetTower.x,
            y2: this.targetTower.y,
            life: 0.2,
            maxLife: 0.2,
          };
        }
        return;
      }
    }

    const speedPixels = this.speed * tileSize * dt;
    const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);

    if (dist <= speedPixels) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.col = Math.floor((this.x - offsetX) / tileSize);
      this.row = Math.floor((this.y - offsetY) / tileSize);
      const currentTile = gameGrid.cells[this.col][this.row];

      if (currentTile.type === "base") {
        this.hp = 0;
        this.reachedBase = true;
        return;
      }

      if (this.role === "digger") {
        this.isDigging = currentTile.type === "grass";
        if (this.isDigging) {
          currentTile.type = "road";
          currentTile.baseCost = 1.0;
          currentTile.currentCost = 1.0;
          currentTile.isBuildable = false;
          bgCtx.fillStyle = "#2d3436";
          bgCtx.fillRect(
            offsetX + this.col * tileSize,
            offsetY + this.row * tileSize,
            tileSize,
            tileSize,
          );
          pathfinder.calculateFlowField(false);
          pathfinder.calculateAllyField();
        }
        let vector = currentTile.diggerVector;
        if (vector) {
          this.targetX =
            offsetX + (this.col + vector.x) * tileSize + tileSize / 2;
          this.targetY =
            offsetY + (this.row + vector.y) * tileSize + tileSize / 2;
        }
      } else {
        let vector = currentTile.vector;
        if (vector) {
          this.targetX =
            offsetX + (this.col + vector.x) * tileSize + tileSize / 2;
          this.targetY =
            offsetY + (this.row + vector.y) * tileSize + tileSize / 2;
        }
      }
    } else {
      const dx = this.targetX - this.x,
        dy = this.targetY - this.y;
      this.facingAngle = Math.atan2(dy, dx);
      this.x += (dx / dist) * speedPixels;
      this.y += (dy / dist) * speedPixels;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.bobPhase) * 0.06;
    const r = tileSize * this.radius * (1 + bob);

    if (this.isDigging) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(243, 156, 18, 0.35)";
      ctx.fill();
    }

    // Тень
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.7, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    // Тело с градиентом
    const grad = ctx.createRadialGradient(
      this.x - r * 0.3,
      this.y - r * 0.3,
      r * 0.1,
      this.x,
      this.y,
      r,
    );
    grad.addColorStop(
      0,
      this.hitFlash > 0 ? "#ffffff" : lighten(this.color, 55),
    );
    grad.addColorStop(1, this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = darken(this.color, 60);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Индикатор направления (глаз)
    const fx = this.x + Math.cos(this.facingAngle) * r * 0.55;
    const fy = this.y + Math.sin(this.facingAngle) * r * 0.55;
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "#2c2c2c";
    ctx.fill();

    // Titan - корона рогов
    if (this.type === "Titan") {
      ctx.strokeStyle = "#7f5300";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x - r * 0.5, this.y - r * 0.8);
      ctx.lineTo(this.x - r * 0.8, this.y - r * 1.3);
      ctx.moveTo(this.x + r * 0.5, this.y - r * 0.8);
      ctx.lineTo(this.x + r * 0.8, this.y - r * 1.3);
      ctx.stroke();
    }

    // HP бар
    const hpW = tileSize * 0.8;
    drawRoundRect(
      ctx,
      this.x - hpW / 2,
      this.y - tileSize - r * 0.5,
      hpW,
      4,
      2,
    );
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    const hpPct = Math.max(0, this.hp / this.maxHp);
    const hpColor =
      hpPct > 0.5 ? "#2ecc71" : hpPct > 0.2 ? "#f39c12" : "#e74c3c";
    drawRoundRect(
      ctx,
      this.x - hpW / 2 + 1,
      this.y - tileSize - r * 0.5 + 1,
      (hpW - 2) * hpPct,
      2,
      1,
    );
    ctx.fillStyle = hpColor;
    ctx.fill();

    if (this.isFiring && this.targetTower) {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.targetTower.x, this.targetTower.y);
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (this.trail) {
      const alpha = Math.max(0, this.trail.life / this.trail.maxLife);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#e74c3c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.trail.x2, this.trail.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

class Ally {
  constructor() {
    const stats = ALLY_STATS.Creep;
    this.maxHp = stats.hp;
    this.hp = this.maxHp;
    this.speed = stats.speed;
    this.damage = stats.damage;
    this.cooldown = stats.cooldown;
    this.color = stats.color;
    this.radius = stats.radius;
    this.attackTimer = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.facingAngle = -Math.PI / 2;
    this.hitFlash = 0;
    this._lastHp = this.hp;

    const baseTile = pathfinder.baseTile;
    this.col = baseTile.col;
    this.row = baseTile.row;
    this.x = offsetX + this.col * tileSize + tileSize / 2;
    this.y = offsetY + this.row * tileSize + tileSize / 2;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  update(dt) {
    this.bobPhase += dt * 6;
    if (this.hp < this._lastHp) this.hitFlash = 0.15;
    this._lastHp = this.hp;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    let engagedEnemy = null;
    for (let e of enemies) {
      if (
        e.role !== "siege" &&
        e.type !== "Titan" &&
        Math.hypot(this.x - e.x, this.y - e.y) < tileSize * 0.8
      ) {
        engagedEnemy = e;
        break;
      }
    }

    if (engagedEnemy) {
      this.facingAngle = Math.atan2(
        engagedEnemy.y - this.y,
        engagedEnemy.x - this.x,
      );
      this.attackTimer += dt;
      if (this.attackTimer >= this.cooldown) {
        engagedEnemy.hp -= this.damage;
        this.attackTimer = 0;
      }
      return;
    }

    const speedPixels = this.speed * tileSize * dt;
    const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);

    if (dist <= speedPixels) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.col = Math.floor((this.x - offsetX) / tileSize);
      this.row = Math.floor((this.y - offsetY) / tileSize);
      const currentTile = gameGrid.cells[this.col][this.row];
      if (currentTile.type === "spawn") {
        this.hp = 0;
        return;
      }
      let vector = currentTile.allyVector;
      if (vector) {
        this.targetX =
          offsetX + (this.col + vector.x) * tileSize + tileSize / 2;
        this.targetY =
          offsetY + (this.row + vector.y) * tileSize + tileSize / 2;
      }
    } else {
      const dx = this.targetX - this.x,
        dy = this.targetY - this.y;
      this.facingAngle = Math.atan2(dy, dx);
      this.x += (dx / dist) * speedPixels;
      this.y += (dy / dist) * speedPixels;
    }
  }

  draw(ctx) {
    const bob = Math.sin(this.bobPhase) * 0.06;
    const r = tileSize * this.radius * (1 + bob);

    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.7, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    const grad = ctx.createRadialGradient(
      this.x - r * 0.3,
      this.y - r * 0.3,
      r * 0.1,
      this.x,
      this.y,
      r,
    );
    grad.addColorStop(
      0,
      this.hitFlash > 0 ? "#ffffff" : lighten(this.color, 55),
    );
    grad.addColorStop(1, this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = darken(this.color, 60);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Копье-индикатор
    const spearLen = r * 1.4;
    ctx.strokeStyle = "#dfe6e9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(
      this.x + Math.cos(this.facingAngle) * spearLen,
      this.y + Math.sin(this.facingAngle) * spearLen,
    );
    ctx.stroke();

    const hpW = tileSize * 0.7;
    drawRoundRect(
      ctx,
      this.x - hpW / 2,
      this.y - tileSize - r * 0.5,
      hpW,
      4,
      2,
    );
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    drawRoundRect(
      ctx,
      this.x - hpW / 2 + 1,
      this.y - tileSize - r * 0.5 + 1,
      (hpW - 2) * Math.max(0, this.hp / this.maxHp),
      2,
      1,
    );
    ctx.fillStyle = "#3498db";
    ctx.fill();
  }
}

// ==========================================
// TOWER (MULTI-CELL SUPPORT)
// ==========================================
class Tower {
  constructor(col, row, type) {
    this.col = col;
    this.row = row;
    this.type = type;
    const stats = TOWER_STATS[type];
    this.size = stats.size;

    this.x = offsetX + col * tileSize + (this.size * tileSize) / 2;
    this.y = offsetY + row * tileSize + (this.size * tileSize) / 2;

    this.level = 1;
    this.totalSpent = stats.cost;
    this.upgradeCost = Math.floor(stats.cost * 1.5);
    this.maxHp = stats.hp;
    this.hp = this.maxHp;
    this.rangeTiles = stats.rangeTiles;
    this.range = this.rangeTiles * tileSize;
    this.damage = stats.damage;
    this.cooldown = stats.cooldown;
    this.color = stats.color;
    this.timer = 0;
    this.target = null;
    this.isFiring = false;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.trail = null;
    this.buildAnim = 0; // 0..1 анимация появления
  }

  upgrade() {
    this.level++;
    this.totalSpent += this.upgradeCost;
    this.damage = Math.floor(this.damage * 1.8);
    this.rangeTiles += 0.5;
    this.range = this.rangeTiles * tileSize;
    this.maxHp += 100;
    this.hp += 100;
    this.upgradeCost = Math.floor(this.upgradeCost * 1.6);
  }

  update(dt) {
    if (this.buildAnim < 1)
      this.buildAnim = Math.min(1, this.buildAnim + dt * 4);
    this.timer += dt;
    this.isFiring = false;
    if (this.recoil > 0) this.recoil -= dt * 4;
    if (this.trail) {
      this.trail.life -= dt;
      if (this.trail.life <= 0) this.trail = null;
    }

    if (
      this.target &&
      (this.target.hp <= 0 ||
        Math.hypot(this.x - this.target.x, this.y - this.target.y) > this.range)
    ) {
      this.target = null;
    }
    if (!this.target) {
      for (let e of enemies) {
        if (Math.hypot(this.x - e.x, this.y - e.y) <= this.range) {
          this.target = e;
          break;
        }
      }
    }
    if (this.target) {
      this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    }
    if (this.target && this.timer >= this.cooldown) {
      this.target.hp -= this.damage;
      this.timer = 0;
      this.isFiring = true;
      this.recoil = 1;
      const tSize = tileSize * this.size;
      const muzzleX = this.x + Math.cos(this.angle) * tSize * 0.4;
      const muzzleY = this.y + Math.sin(this.angle) * tSize * 0.4;
      this.trail = {
        x1: muzzleX,
        y1: muzzleY,
        x2: this.target.x,
        y2: this.target.y,
        life: 0.12,
        maxLife: 0.12,
      };
      spawnBurst(muzzleX, muzzleY, "#ffd54f", 4, 0.6);
      safePlaySfx(
        this.type === "Rapid"
          ? "shootRapid"
          : this.type === "Sniper"
            ? "shootSniper"
            : "shootBasic",
      );
    }
  }

  draw(ctx) {
    const tSize = tileSize * this.size * (0.3 + 0.7 * this.buildAnim);
    const alpha = this.buildAnim;
    ctx.globalAlpha = alpha;

    // Тень основания
    ctx.beginPath();
    ctx.ellipse(
      this.x,
      this.y + tSize * 0.42,
      tSize * 0.45,
      tSize * 0.18,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    // Основание с градиентом
    const grad = ctx.createRadialGradient(
      this.x - tSize * 0.15,
      this.y - tSize * 0.15,
      tSize * 0.05,
      this.x,
      this.y,
      tSize * 0.7,
    );
    grad.addColorStop(0, lighten(this.color, 45));
    grad.addColorStop(1, darken(this.color, 15));
    drawRoundRect(
      ctx,
      this.x - tSize / 2 + 2,
      this.y - tSize / 2 + 2,
      tSize - 4,
      tSize - 4,
      6,
    );
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = darken(this.color, 70);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Вращающийся ствол (с отдачей)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const barrelLen = tSize * 0.5 * (1 - this.recoil * 0.15);
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(0, -tSize * 0.09, barrelLen, tSize * 0.18);
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(0, 0, tSize * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Пипсы уровня
    ctx.fillStyle = "white";
    const pipSize = tileSize * 0.13,
      startX = this.x - pipSize * this.level;
    for (let i = 0; i < this.level; i++) {
      ctx.fillRect(
        startX + i * pipSize * 2,
        this.y - tSize / 2 + 4,
        pipSize,
        pipSize,
      );
    }

    // HP бар
    drawRoundRect(
      ctx,
      this.x - tSize / 2 + 2,
      this.y + tSize / 2 - 7,
      tSize - 4,
      4,
      2,
    );
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    drawRoundRect(
      ctx,
      this.x - tSize / 2 + 3,
      this.y + tSize / 2 - 6,
      (tSize - 6) * Math.max(0, this.hp / this.maxHp),
      2,
      1,
    );
    ctx.fillStyle = "#2ecc71";
    ctx.fill();

    // Трассер выстрела
    if (this.trail) {
      const a = Math.max(0, this.trail.life / this.trail.maxLife);
      ctx.globalAlpha = alpha * a;
      ctx.strokeStyle = "#ffd54f";
      ctx.lineWidth = this.size * (1 + a);
      ctx.beginPath();
      ctx.moveTo(this.trail.x1, this.trail.y1);
      ctx.lineTo(this.trail.x2, this.trail.y2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    if (selectedTower === this) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "#2ecc71";
      ctx.lineWidth = 3;
      ctx.strokeRect(this.x - tSize / 2, this.y - tSize / 2, tSize, tSize);
    }
  }
}

// ==========================================
// GRID & PATHFINDING
// ==========================================

function drawFortressStructure(ctx, x, y, size) {
  const cx = x + size / 2;

  ctx.beginPath();
  ctx.ellipse(cx, y + size * 0.92, size * 0.42, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  const wallGrad = ctx.createLinearGradient(x, y, x, y + size);
  wallGrad.addColorStop(0, "#5d7a94");
  wallGrad.addColorStop(1, "#34495e");
  drawRoundRect(
    ctx,
    x + size * 0.08,
    y + size * 0.12,
    size * 0.84,
    size * 0.8,
    size * 0.05,
  );
  ctx.fillStyle = wallGrad;
  ctx.fill();
  ctx.strokeStyle = "#1c2833";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  const brickRows = 5;
  for (let i = 1; i < brickRows; i++) {
    const by = y + size * 0.12 + (size * 0.8 * i) / brickRows;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.08, by);
    ctx.lineTo(x + size * 0.92, by);
    ctx.stroke();
  }

  ctx.fillStyle = "#4a6378";
  const merlonCount = 6,
    merlonW = (size * 0.84) / merlonCount;
  for (let i = 0; i < merlonCount; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(
        x + size * 0.08 + i * merlonW,
        y + size * 0.06,
        merlonW * 0.85,
        size * 0.08,
      );
    }
  }

  const towerR = size * 0.11;
  const towerPositions = [
    [x + size * 0.12, y + size * 0.16],
    [x + size * 0.88, y + size * 0.16],
    [x + size * 0.12, y + size * 0.84],
    [x + size * 0.88, y + size * 0.84],
  ];
  for (const [tx, ty] of towerPositions) {
    const tGrad = ctx.createLinearGradient(tx - towerR, ty, tx + towerR, ty);
    tGrad.addColorStop(0, "#6b8299");
    tGrad.addColorStop(1, "#3d5266");
    ctx.beginPath();
    ctx.arc(tx, ty, towerR, 0, Math.PI * 2);
    ctx.fillStyle = tGrad;
    ctx.fill();
    ctx.strokeStyle = "#1c2833";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - towerR * 1.15, ty - towerR * 0.3);
    ctx.lineTo(tx, ty - towerR * 1.8);
    ctx.lineTo(tx + towerR * 1.15, ty - towerR * 0.3);
    ctx.closePath();
    ctx.fillStyle = "#c0392b";
    ctx.fill();
    ctx.strokeStyle = "#7b241c";
    ctx.stroke();
  }

  const gateW = size * 0.22,
    gateH = size * 0.3;
  const gateGrad = ctx.createLinearGradient(
    cx - gateW / 2,
    y + size * 0.92 - gateH,
    cx + gateW / 2,
    y + size * 0.92,
  );
  gateGrad.addColorStop(0, "#2c1810");
  gateGrad.addColorStop(1, "#1a0f0a");
  ctx.beginPath();
  ctx.moveTo(cx - gateW / 2, y + size * 0.92);
  ctx.lineTo(cx - gateW / 2, y + size * 0.92 - gateH * 0.6);
  ctx.arc(cx, y + size * 0.92 - gateH * 0.6, gateW / 2, Math.PI, 0);
  ctx.lineTo(cx + gateW / 2, y + size * 0.92);
  ctx.closePath();
  ctx.fillStyle = gateGrad;
  ctx.fill();
  ctx.strokeStyle = "#0d0705";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "#7f8c8d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y + size * 0.12);
  ctx.lineTo(cx, y - size * 0.08);
  ctx.stroke();
}

function drawPortalStructure(ctx, x, y, size) {
  const cx = x + size / 2,
    cy = y + size / 2;
  const outer = size * 0.42;
  const inner = size * 0.32;
  const core = size * 0.24;

  // Тень квадратной платформы
  ctx.beginPath();
  ctx.ellipse(cx, y + size * 0.92, size * 0.4, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();

  // Обсидиановая квадратная плита-основание
  const baseGrad = ctx.createLinearGradient(
    cx - outer,
    cy - outer,
    cx + outer,
    cy + outer,
  );
  baseGrad.addColorStop(0, "#1a0a1f");
  baseGrad.addColorStop(1, "#0d0510");
  drawRoundRect(ctx, cx - outer, cy - outer, outer * 2, outer * 2, size * 0.03);
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // Внешняя квадратная рама портала
  drawRoundRect(ctx, cx - outer, cy - outer, outer * 2, outer * 2, size * 0.03);
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = "#3d2b4a";
  ctx.stroke();
  drawRoundRect(ctx, cx - outer, cy - outer, outer * 2, outer * 2, size * 0.03);
  ctx.lineWidth = size * 0.02;
  ctx.strokeStyle = "#1c1024";
  ctx.stroke();

  // Клыки-обелиски по 4 углам квадрата (вместо радиальных шипов)
  const cornerOffsets = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (const [ox, oy] of cornerOffsets) {
    const bx = cx + ox * outer;
    const by = cy + oy * outer;
    const tipX = cx + ox * (outer + size * 0.1);
    const tipY = cy + oy * (outer + size * 0.1);
    ctx.beginPath();
    ctx.moveTo(bx - ox * size * 0.02, by);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx, by - oy * size * 0.02);
    ctx.closePath();
    ctx.fillStyle = "#4a2f5c";
    ctx.fill();
    ctx.strokeStyle = "#1c1024";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Малые зубцы по периметру квадрата (вместо круглых рун-точек)
  ctx.fillStyle = "#a855f7";
  const notches = 4;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < notches; i++) {
      const t = (i + 0.5) / notches;
      let px, py;
      if (side === 0) {
        px = cx - outer + t * outer * 2;
        py = cy - outer;
      } else if (side === 1) {
        px = cx - outer + t * outer * 2;
        py = cy + outer;
      } else if (side === 2) {
        px = cx - outer;
        py = cy - outer + t * outer * 2;
      } else {
        px = cx + outer;
        py = cy - outer + t * outer * 2;
      }
      ctx.beginPath();
      ctx.arc(px, py, size * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Средний квадрат (повёрнутый на 45° - ромб) с рунической рамкой
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = "#6b3fa0";
  ctx.lineWidth = size * 0.025;
  ctx.strokeRect(-inner * 0.75, -inner * 0.75, inner * 1.5, inner * 1.5);
  ctx.restore();

  // Внутреннее квадратное ядро портала (тёмная воронка)
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
  innerGrad.addColorStop(0, "#3d1a4a");
  innerGrad.addColorStop(0.6, "#1a0a24");
  innerGrad.addColorStop(1, "#050208");
  drawRoundRect(ctx, cx - core, cy - core, core * 2, core * 2, size * 0.02);
  ctx.fillStyle = innerGrad;
  ctx.fill();
}

function drawAnimatedStructureFX(ctx, time) {
  const fortSize = tileSize * 4;
  const fortX = offsetX + 2 * tileSize;
  const fortY = offsetY + 34 * tileSize;
  const fcx = fortX + fortSize / 2,
    fcy = fortY + fortSize / 2;

  const fPulse = 0.5 + Math.sin(time * 2) * 0.2;
  const fGlow = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, fortSize * 0.9);
  fGlow.addColorStop(0, `rgba(52,152,219,${0.18 * fPulse})`);
  fGlow.addColorStop(1, "rgba(52,152,219,0)");
  ctx.fillStyle = fGlow;
  ctx.fillRect(fcx - fortSize, fcy - fortSize, fortSize * 2, fortSize * 2);

  ctx.save();
  ctx.translate(fcx, fortY - fortSize * 0.08);
  const wave = Math.sin(time * 4) * 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(
    fortSize * 0.15,
    -3 + wave * 0.3,
    fortSize * 0.28,
    2 + wave,
  );
  ctx.lineTo(fortSize * 0.28, fortSize * 0.14 + wave);
  ctx.quadraticCurveTo(
    fortSize * 0.15,
    fortSize * 0.11 + wave * 0.3,
    0,
    fortSize * 0.16,
  );
  ctx.closePath();
  ctx.fillStyle = "#3498db";
  ctx.fill();
  ctx.strokeStyle = "#1c5a80";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  const spawnSize = tileSize * 4;
  const spawnX = offsetX + 34 * tileSize;
  const spawnY = offsetY + 2 * tileSize;
  const scx = spawnX + spawnSize / 2,
    scy = spawnY + spawnSize / 2;

  const pPulse = 0.5 + Math.sin(time * 3) * 0.25;
  const glowSize = spawnSize * 0.42;
  const pGlow = ctx.createRadialGradient(
    scx,
    scy,
    0,
    scx,
    scy,
    spawnSize * 0.5,
  );
  pGlow.addColorStop(0, `rgba(168,85,247,${0.35 * pPulse})`);
  pGlow.addColorStop(0.7, `rgba(168,85,247,${0.1 * pPulse})`);
  pGlow.addColorStop(1, "rgba(168,85,247,0)");
  drawRoundRect(
    ctx,
    scx - glowSize,
    scy - glowSize,
    glowSize * 2,
    glowSize * 2,
    spawnSize * 0.03,
  );
  ctx.fillStyle = pGlow;
  ctx.fill();

  // Вращающийся квадратный ромб-индикатор вместо круговых искр
  ctx.save();
  ctx.translate(scx, scy);
  ctx.rotate(time * 1.2);
  const spinSize = spawnSize * 0.22;
  ctx.strokeStyle = "#d8b4fe";
  ctx.lineWidth = 2;
  ctx.strokeRect(-spinSize / 2, -spinSize / 2, spinSize, spinSize);
  ctx.restore();

  // Мерцающие зубцы-руны по квадратному периметру
  const rPulse = 0.6 + Math.sin(time * 5) * 0.4;
  ctx.globalAlpha = rPulse;
  ctx.fillStyle = "#e9d5ff";
  const perim = spawnSize * 0.4;
  const notchCount = 4;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < notchCount; i++) {
      const t = (i + 0.5) / notchCount + Math.sin(time * 0.5) * 0.02;
      let rx, ry;
      if (side === 0) {
        rx = scx - perim + t * perim * 2;
        ry = scy - perim;
      } else if (side === 1) {
        rx = scx - perim + t * perim * 2;
        ry = scy + perim;
      } else if (side === 2) {
        rx = scx - perim;
        ry = scy - perim + t * perim * 2;
      } else {
        rx = scx + perim;
        ry = scy - perim + t * perim * 2;
      }
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  if (Math.random() < 0.3) {
    particles.push(
      new Particle(
        scx + (Math.random() - 0.5) * spawnSize * 0.5,
        scy + (Math.random() - 0.5) * spawnSize * 0.5,
        "#c084fc",
        0.3,
      ),
    );
  }
}

class Grid {
  constructor() {
    this.cells = [];
    this.createMap();
  }

  createMap() {
    for (let c = 0; c < COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < ROWS; r++) {
        let tile = {
          col: c,
          row: r,
          type: "grass",
          isBuildable: true,
          hasTower: false,
          towerRef: null,
          baseCost: Infinity,
          currentCost: Infinity,
          distance: Infinity,
          vector: null,
          diggerVector: null,
          allyVector: null,
          isMainRoad: false,
        };

        if (
          (c >= 3 && c <= 36 && r >= 3 && r <= 4) ||
          (r >= 3 && r <= 36 && c >= 3 && c <= 4)
        ) {
          tile.type = "road";
          tile.baseCost = 1;
          tile.isBuildable = false;
          tile.isMainRoad = true;
        }
        if (
          (c >= 3 && c <= 36 && r >= 35 && r <= 36) ||
          (r >= 3 && r <= 36 && c >= 35 && c <= 36)
        ) {
          tile.type = "road";
          tile.baseCost = 1;
          tile.isBuildable = false;
          tile.isMainRoad = true;
        }
        if (Math.abs(c + r - 39) <= 1 && c >= 3 && c <= 36) {
          tile.type = "road";
          tile.baseCost = 0.8;
          tile.isBuildable = false;
          tile.isMainRoad = true;
        }
        if (c >= 2 && c <= 5 && r >= 34 && r <= 37) {
          tile.type = "base";
          tile.isBuildable = false;
          tile.baseCost = 1;
        }
        if (c >= 34 && c <= 37 && r >= 2 && r <= 5) {
          tile.type = "spawn";
          tile.isBuildable = false;
          tile.baseCost = 1;
        }
        if (Math.hypot(c - 35, r - 4) <= 6) {
          tile.isBuildable = false;
        }

        this.cells[c][r] = tile;
      }
    }
  }

  cacheBackground(ctx) {
    // Базовый фон с лёгким градиентом
    const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
    bgGrad.addColorStop(0, "#245239");
    bgGrad.addColorStop(1, "#1b4332");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, logicalW, logicalH);

    // Шумовая текстура травы (детерминированная по seed)
    let seed = 42;
    function rnd() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    for (let i = 0; i < 900; i++) {
      const x = rnd() * logicalW,
        y = rnd() * logicalH;
      const c =
        gameGrid.cells[Math.floor((x - offsetX) / tileSize)]?.[
          Math.floor((y - offsetY) / tileSize)
        ];
      if (c && c.type !== "grass") continue;
      ctx.beginPath();
      ctx.arc(x, y, 1 + rnd() * 2.5, 0, Math.PI * 2);
      ctx.fillStyle =
        rnd() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
      ctx.fill();
    }

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        let t = this.cells[c][r];
        const x = offsetX + c * tileSize,
          y = offsetY + r * tileSize;
        if (t.type === "spawn") {
          if (c === 34 && r === 2) drawPortalStructure(ctx, x, y, tileSize * 4);
        } else if (t.type === "base") {
          if (c === 2 && r === 34)
            drawFortressStructure(ctx, x, y, tileSize * 4);
        } else if (t.type === "road") {
          ctx.fillStyle = "#31393b";
          ctx.fillRect(x, y, tileSize, tileSize);
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, tileSize, tileSize);
        }
      }
    }
  }
}

class Pathfinder {
  constructor(grid) {
    this.grid = grid;
    this.spawnTile = grid.cells[35][4];
    this.baseTile = grid.cells[4][35];
  }

  calculateFields() {
    this.calculateFlowField(false);
    this.calculateFlowField(true);
    this.calculateAllyField();
  }

  calculateAllyField() {
    let distances = Array(COLS)
      .fill()
      .map(() => Array(ROWS).fill(Infinity));
    let heap = new MinHeap();
    let hasTargets = false;
    for (let e of enemies) {
      if (e.role !== "digger") {
        distances[e.col][e.row] = 0;
        heap.push({ tile: this.grid.cells[e.col][e.row], dist: 0 });
        hasTargets = true;
      }
    }
    if (!hasTargets) {
      distances[this.spawnTile.col][this.spawnTile.row] = 0;
      heap.push({ tile: this.spawnTile, dist: 0 });
    }
    while (!heap.isEmpty()) {
      let { tile: current, dist: currentDist } = heap.pop();
      if (currentDist > distances[current.col][current.row]) continue;
      for (let n of this.getNeighbors(current)) {
        if (n.hasTower || n.type === "grass") continue;
        let newDist = currentDist + n.baseCost;
        if (newDist < distances[n.col][n.row]) {
          distances[n.col][n.row] = newDist;
          heap.push({ tile: n, dist: newDist });
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        let tile = this.grid.cells[c][r];
        if (tile.type === "grass") continue;
        let minNeighbor = null,
          minDist = Infinity;
        for (let n of this.getNeighbors(tile)) {
          if (n.hasTower || n.type === "grass") continue;
          if (distances[n.col][n.row] < minDist) {
            minDist = distances[n.col][n.row];
            minNeighbor = n;
          }
        }
        if (minNeighbor)
          tile.allyVector = {
            x: minNeighbor.col - tile.col,
            y: minNeighbor.row - tile.row,
          };
      }
    }
  }

  calculateFlowField(isForDigger) {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        let tile = this.grid.cells[c][r];
        tile.penalty = 0;
        if (!isForDigger) {
          tile.distance = Infinity;
          tile.vector = null;
        } else {
          tile.diggerDistance = Infinity;
          tile.diggerVector = null;
        }
      }
    }

    for (let t of towers) {
      let fearRadius = isForDigger
        ? Math.max(1, t.rangeTiles - 1.5)
        : t.rangeTiles;
      let searchOffset = Math.ceil(fearRadius) + t.size;
      for (let dc = -searchOffset; dc <= searchOffset; dc++) {
        for (let dr = -searchOffset; dr <= searchOffset; dr++) {
          let nc = t.col + dc,
            nr = t.row + dr;
          if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
            let centerCol = t.col + (t.size - 1) / 2,
              centerRow = t.row + (t.size - 1) / 2;
            if (Math.hypot(nc - centerCol, nr - centerRow) <= fearRadius) {
              if (isForDigger) {
                this.grid.cells[nc][nr].penalty += 20.0;
              } else if (this.grid.cells[nc][nr].type === "road") {
                this.grid.cells[nc][nr].penalty += 5.0;
              }
            }
          }
        }
      }
    }

    let distances = Array(COLS)
      .fill()
      .map(() => Array(ROWS).fill(Infinity));
    distances[this.baseTile.col][this.baseTile.row] = 0;
    let heap = new MinHeap();
    heap.push({ tile: this.baseTile, dist: 0 });

    while (!heap.isEmpty()) {
      let { tile: current, dist: currentDist } = heap.pop();
      if (currentDist > distances[current.col][current.row]) continue;
      for (let n of this.getNeighbors(current)) {
        let cost = Infinity;
        if (isForDigger) {
          if (n.type === "grass") {
            let isNearMainRoad = false;
            for (let adj of this.getNeighbors(n)) {
              if (adj.isMainRoad) {
                isNearMainRoad = true;
                break;
              }
            }
            cost = isNearMainRoad ? 50.0 : 1.0;
          } else if (
            n.type === "road" ||
            n.type === "spawn" ||
            n.type === "base"
          ) {
            cost = 10.0;
          } else {
            cost = 1.0;
          }
          if (cost !== Infinity) cost += n.penalty;
        } else {
          if (n.hasTower || n.type === "grass") continue;
          cost = n.baseCost + n.penalty;
        }
        let newDist = currentDist + cost;
        if (newDist < distances[n.col][n.row]) {
          distances[n.col][n.row] = newDist;
          if (!isForDigger) n.distance = newDist;
          else n.diggerDistance = newDist;
          heap.push({ tile: n, dist: newDist });
        }
      }
    }

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        let tile = this.grid.cells[c][r];
        if (tile === this.baseTile || (!isForDigger && tile.type === "grass"))
          continue;
        let minNeighbor = null,
          minDist = Infinity;
        for (let n of this.getNeighbors(tile)) {
          if (!isForDigger && (n.hasTower || n.type === "grass")) continue;
          let nDist = distances[n.col][n.row];
          if (nDist < minDist) {
            minDist = nDist;
            minNeighbor = n;
          }
        }
        if (minNeighbor) {
          let vec = {
            x: minNeighbor.col - tile.col,
            y: minNeighbor.row - tile.row,
          };
          if (isForDigger) tile.diggerVector = vec;
          else tile.vector = vec;
        }
      }
    }
  }

  getNeighbors(tile) {
    let neighbors = [],
      dirs = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
      ];
    for (let d of dirs) {
      let nc = tile.col + d.x,
        nr = tile.row + d.y;
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS)
        neighbors.push(this.grid.cells[nc][nr]);
    }
    return neighbors;
  }
}

// ==========================================
// WAVE MANAGER
// ==========================================
class WaveManager {
  constructor() {
    this.waveNumber = 0;
    this.enemiesToSpawn = [];
    this.spawnTimer = 0;
    this.isSpawning = false;
    this.waveCooldown = 5;
    this.uiTimer = document.getElementById("ui-timer");
  }
  startNextWave() {
    this.waveNumber++;
    document.getElementById("ui-wave").innerText = this.waveNumber;
    this.isSpawning = true;
    safePlaySfx("waveStart");
    let knightCount =
      this.waveNumber === 1 ? 3 : Math.floor(3 + this.waveNumber * 1.5);
    let mageCount = this.waveNumber < 3 ? 0 : Math.floor(this.waveNumber * 1.2);
    for (let i = 0; i < knightCount; i++) this.enemiesToSpawn.push("Knight");
    for (let i = 0; i < mageCount; i++) this.enemiesToSpawn.push("Mage");
    if (this.waveNumber >= 5)
      for (let i = 0; i < Math.floor(this.waveNumber / 4); i++)
        this.enemiesToSpawn.push("Siege");
    if (this.waveNumber > 2 && this.waveNumber % 3 === 0)
      this.enemiesToSpawn.push("Digger", "Digger");
    if (this.waveNumber > 0 && this.waveNumber % 10 === 0)
      this.enemiesToSpawn.push("Titan");
    this.enemiesToSpawn.sort(() => Math.random() - 0.5);
  }
  update(dt) {
    if (this.isSpawning) {
      if (this.uiTimer) this.uiTimer.innerText = "В бою!";
      this.spawnTimer += dt;
      const spawnInterval = Math.max(0.3, 1.2 - this.waveNumber * 0.05);
      if (this.spawnTimer >= spawnInterval && this.enemiesToSpawn.length > 0) {
        const hpMult =
          1 +
          0.1 * (this.waveNumber - 1) +
          0.04 * Math.pow(this.waveNumber - 1, 2);
        enemies.push(new Enemy(this.enemiesToSpawn.pop(), hpMult));
        this.spawnTimer = 0;
      }
      if (this.enemiesToSpawn.length === 0 && enemies.length === 0) {
        this.isSpawning = false;
        this.waveCooldown = 15;
      }
    } else {
      this.waveCooldown -= dt;
      if (this.uiTimer) this.uiTimer.innerText = Math.ceil(this.waveCooldown);
      if (this.waveCooldown <= 0) this.startNextWave();
    }
  }
}

const gameGrid = new Grid();
const pathfinder = new Pathfinder(gameGrid);
const waveManager = new WaveManager();

// ==========================================
// SETUP & EVENTS
// ==========================================
function setupCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const container = document.getElementById("game-container");
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;

  canvas.width = containerW * dpr;
  canvas.height = containerH * dpr;
  bgCanvas.width = canvas.width;
  bgCanvas.height = canvas.height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bgCtx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  bgCtx.scale(dpr, dpr);

  logicalW = canvas.width / dpr;
  logicalH = canvas.height / dpr;

  tileSize = Math.max(
    8,
    Math.floor(Math.min(logicalW / COLS, logicalH / ROWS)),
  );
  offsetX = Math.floor((logicalW - tileSize * COLS) / 2);
  offsetY = Math.floor((logicalH - tileSize * ROWS) / 2);

  gameGrid.cacheBackground(bgCtx);

  for (let t of towers) {
    t.x = offsetX + t.col * tileSize + (t.size * tileSize) / 2;
    t.y = offsetY + t.row * tileSize + (t.size * tileSize) / 2;
    t.range = t.rangeTiles * tileSize;
  }
  for (let e of enemies) {
    e.x = offsetX + e.col * tileSize + tileSize / 2;
    e.y = offsetY + e.row * tileSize + tileSize / 2;
    e.targetX = e.x;
    e.targetY = e.y;
    e.range = e.rangeTiles * tileSize;
  }
  for (let a of allies) {
    a.x = offsetX + a.col * tileSize + tileSize / 2;
    a.y = offsetY + a.row * tileSize + tileSize / 2;
    a.targetX = a.x;
    a.targetY = a.y;
  }
}

window.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  const col = Math.floor((mouse.x - offsetX) / tileSize);
  const row = Math.floor((mouse.y - offsetY) / tileSize);
  if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
    mouse.col = col;
    mouse.row = row;
  } else {
    mouse.col = -1;
    mouse.row = -1;
  }
});

window.addEventListener("click", (e) => {
  if (e.target.closest("#build-menu") || e.target.closest("#upgrade-menu"))
    return;
  if (mouse.col !== -1 && mouse.row !== -1 && !isGameOver) {
    const tile = gameGrid.cells[mouse.col][mouse.row];
    if (tile.towerRef) {
      selectedTower = tile.towerRef;
      updateUpgradeUI();
      return;
    }

    const stats = TOWER_STATS[currentBuildType];
    const size = stats.size;
    let canBuild = true;
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) {
        let nc = mouse.col + c,
          nr = mouse.row + r;
        if (nc >= COLS || nr >= ROWS) {
          canBuild = false;
          break;
        }
        let checkTile = gameGrid.cells[nc][nr];
        if (!checkTile.isBuildable || checkTile.hasTower) canBuild = false;
      }
    }

    if (canBuild && gold >= stats.cost) {
      if (towers.length >= MAX_TOWERS) {
        document.getElementById("ui-towers").style.color = "red";
        setTimeout(
          () => (document.getElementById("ui-towers").style.color = "white"),
          500,
        );
        return;
      }
      let newTower = new Tower(mouse.col, mouse.row, currentBuildType);
      towers.push(newTower);
      for (let c = 0; c < size; c++) {
        for (let r = 0; r < size; r++) {
          gameGrid.cells[mouse.col + c][mouse.row + r].hasTower = true;
          gameGrid.cells[mouse.col + c][mouse.row + r].towerRef = newTower;
        }
      }
      pathfinder.calculateFields();
      gold -= stats.cost;
      selectedTower = null;
      updateUI();
      safePlaySfx("towerPlace");
      spawnBurst(newTower.x, newTower.y, "#ffffff", 14, 1.5);
    } else {
      selectedTower = null;
      updateUpgradeUI();
    }
  }
});

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(setupCanvas, 100);
});

// ==========================================
// GAME LOOP
// ==========================================
let lastTime = 0;
let allySpawnCooldown = 0;
let allyUpdateTimer = 0;

function gameLoop(timestamp) {
  if (isGameOver) return;

  try {
    let dt = (timestamp - (lastTime || timestamp)) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = timestamp;
    globalTime += dt;

    goldTimer += dt;
    if (goldTimer >= 1.0) {
      gold += goldPerSecond;
      goldTimer -= 1.0;
      updateUI();
    }

    let activeThreats = enemies.filter((e) => e.role !== "digger");
    allySpawnCooldown -= dt;
    let desiredAllies =
      activeThreats.length > 0 ? Math.ceil(activeThreats.length / 4) : 0;
    if (allies.length < desiredAllies && allySpawnCooldown <= 0) {
      allies.push(new Ally());
      allySpawnCooldown = 1.5;
    }

    allyUpdateTimer += dt;
    if (allyUpdateTimer >= 0.5) {
      pathfinder.calculateAllyField();
      allyUpdateTimer = 0;
    }

    ctx.drawImage(bgCanvas, 0, 0, logicalW, logicalH);

    // Анимированные эффекты крепости и портала
    drawAnimatedStructureFX(ctx, globalTime);

    if (mouse.col !== -1 && mouse.row !== -1 && !selectedTower) {
      const size = TOWER_STATS[currentBuildType].size;
      let canBuild = true;
      for (let c = 0; c < size; c++) {
        for (let r = 0; r < size; r++) {
          let nc = mouse.col + c,
            nr = mouse.row + r;
          if (
            nc >= COLS ||
            nr >= ROWS ||
            !gameGrid.cells[nc][nr].isBuildable ||
            gameGrid.cells[nc][nr].hasTower
          )
            canBuild = false;
        }
      }
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(
        offsetX + mouse.col * tileSize,
        offsetY + mouse.row * tileSize,
        tileSize * size,
        tileSize * size,
      );
      ctx.strokeStyle =
        canBuild && towers.length < MAX_TOWERS ? "#2ecc71" : "#e74c3c";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        offsetX + mouse.col * tileSize + 1,
        offsetY + mouse.row * tileSize + 1,
        tileSize * size - 2,
        tileSize * size - 2,
      );
    }

    for (let i = towers.length - 1; i >= 0; i--) {
      let t = towers[i];
      if (t.hp <= 0) {
        spawnBurst(t.x, t.y, "#e74c3c", 20, 1.6);
        for (let c = 0; c < t.size; c++) {
          for (let r = 0; r < t.size; r++) {
            gameGrid.cells[t.col + c][t.row + r].hasTower = false;
            gameGrid.cells[t.col + c][t.row + r].towerRef = null;
          }
        }
        if (selectedTower === t) {
          selectedTower = null;
          updateUpgradeUI();
        }
        towers.splice(i, 1);
        pathfinder.calculateFields();
        updateUI();
      } else {
        t.update(dt);
        t.draw(ctx);
      }
    }

    for (let i = allies.length - 1; i >= 0; i--) {
      let a = allies[i];
      a.update(dt);
      a.draw(ctx);
      if (a.hp <= 0) {
        spawnBurst(a.x, a.y, a.color, 8, 1);
        allies.splice(i, 1);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      let enemy = enemies[i];
      enemy.update(dt);
      enemy.draw(ctx);
      if (enemy.hp <= 0) {
        if (!enemy.reachedBase && enemy.role !== "digger") {
          gold += enemy.reward;
          score += enemy.reward * 5;
          spawnBurst(enemy.x, enemy.y, enemy.color, 16, 1.3);
          spawnGoldText(enemy.x, enemy.y, enemy.reward);
          safePlaySfx("enemyDeath");
        } else if (enemy.reachedBase) {
          safePlaySfx("lifeLost");
          let damageToBase =
            enemy.type === "Titan"
              ? 10
              : enemy.role === "siege" || enemy.role === "digger"
                ? 5
                : 1;
          lives -= damageToBase;
          if (lives <= 0) {
            isGameOver = true;
            safePlaySfx("gameOver");
            safeStopMusic();
            document
              .getElementById("game-over-screen")
              .classList.remove("hidden");
            document.getElementById("final-score").innerText = score;
          }
        }
        enemies.splice(i, 1);
        updateUI();
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update(dt);
      particles[i].draw(ctx);
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    waveManager.update(dt);
  } catch (err) {
    console.error("Ошибка игрового цикла (продолжаем выполнение):", err);
  }

  if (!isGameOver) requestAnimationFrame(gameLoop);
}

setupCanvas();
pathfinder.calculateFields();
updateUI();
requestAnimationFrame(gameLoop);
