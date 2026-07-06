/**
 * SMART TD - MOBA & MULTI-CELL UPDATE
 * Features: Allies (Creeps), 1x1/2x2/3x3 Towers, Combat System, UI Overhaul
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d', { alpha: false });

const COLS = 40, ROWS = 40;
let tileSize = 0, offsetX = 0, offsetY = 0;
const mouse = { x: -1, y: -1, col: -1, row: -1 };

const MAX_TOWERS = 15;
const enemies = [], towers = [], allies = [];
let gold = 200, lives = 20, score = 0, isGameOver = false;
let goldPerSecond = 5, goldTimer = 0, allySpawnTimer = 0;
let currentBuildType = 'Basic', selectedTower = null;

// ==========================================
// CONFIG & STATS
// ==========================================
const ENEMY_STATS = {
    // Врагам добавлен урон в ближнем бою и кулдаун атак по союзникам
    Knight: { hp: 100, speed: 2.0, reward: 10, color: '#bdc3c7', radius: 0.4, role: 'basic', meleeDmg: 15, meleeCd: 1.0 },
    Mage:   { hp: 60,  speed: 2.8, reward: 15, color: '#9b59b6', radius: 0.3, role: 'basic', meleeDmg: 5, meleeCd: 0.5 },
    Siege:  { hp: 600, speed: 1.0, reward: 80, color: '#c0392b', radius: 0.6, role: 'siege', damage: 30, rangeTiles: 7, cooldown: 1.5, meleeDmg: 40, meleeCd: 2.0 },
    Digger: { hp: 500, speed: 1.5, reward: 50, color: '#f39c12', radius: 0.35, role: 'digger', meleeDmg: 20, meleeCd: 1.0 },
    Titan:  { hp: 4000, speed: 0.8, reward: 500, color: '#f1c40f', radius: 0.8, role: 'basic', meleeDmg: 100, meleeCd: 1.5 }
};

const ALLY_STATS = {
    // Союзники чуть слабее Рыцарей, чтобы не проходить игру за игрока
    Creep: { hp: 80, speed: 2.0, damage: 10, cooldown: 1.0, color: '#0984e3', radius: 0.35 }
};

const TOWER_STATS = {
    // Добавлен параметр size (размер в клетках)
    Basic:  { cost: 50,  hp: 200, damage: 25,  rangeTiles: 5,   cooldown: 0.5, color: '#3498db', name: 'Базовая', size: 1 },
    Rapid:  { cost: 100, hp: 350, damage: 10,  rangeTiles: 4,   cooldown: 0.1, color: '#f1c40f', name: 'Пулемет', size: 2 },
    Sniper: { cost: 200, hp: 250, damage: 150, rangeTiles: 14,  cooldown: 2.0, color: '#9b59b6', name: 'Снайпер', size: 3 }
};

// ==========================================
// UI FUNCTIONS
// ==========================================
window.selectTower = function(type) {
    currentBuildType = type;
    document.querySelectorAll('.build-option').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('btn-' + type);
    if (btn) btn.classList.add('active');
    selectedTower = null; updateUpgradeUI();
};

window.closeUpgradeMenu = function() {
    selectedTower = null; updateUpgradeUI();
};

function updateUI() {
    document.getElementById('ui-lives').innerText = lives;
    document.getElementById('ui-gold').innerText = `${Math.floor(gold)} (+${goldPerSecond}/с)`;
    document.getElementById('ui-score').innerText = score;
    const uiTowers = document.getElementById('ui-towers');
    if (uiTowers) {
        uiTowers.innerText = towers.length;
        uiTowers.style.color = towers.length >= MAX_TOWERS ? '#e74c3c' : 'white';
    }
    updateUpgradeUI();
}

function updateUpgradeUI() {
    const menu = document.getElementById('upgrade-menu');
    if (!selectedTower) { menu.classList.add('hidden'); return; }
    
    menu.classList.remove('hidden');
    document.getElementById('upg-title').innerText = TOWER_STATS[selectedTower.type].name;
    document.getElementById('upg-level').innerText = selectedTower.level;
    document.getElementById('upg-damage').innerText = selectedTower.damage;
    
    const upgBtn = document.getElementById('btn-upgrade');
    if (selectedTower.level >= 5) {
        upgBtn.innerText = "Макс. Уровень"; upgBtn.disabled = true;
    } else {
        upgBtn.innerText = `Улучшить (${selectedTower.upgradeCost}g)`;
        upgBtn.disabled = gold < selectedTower.upgradeCost;
    }
    document.getElementById('btn-sell').innerText = `Продать (+${Math.floor(selectedTower.totalSpent / 2)}g)`;
}

window.upgradeSelectedTower = function() {
    if (selectedTower && selectedTower.level < 5 && gold >= selectedTower.upgradeCost) {
        gold -= selectedTower.upgradeCost; selectedTower.upgrade(); updateUI();
    }
};

window.sellSelectedTower = function() {
    if (selectedTower) {
        gold += Math.floor(selectedTower.totalSpent / 2);
        const size = selectedTower.size;
        // Очищаем все клетки, которые занимала башня
        for(let c = 0; c < size; c++){
            for(let r = 0; r < size; r++){
                let cell = gameGrid.cells[selectedTower.col + c][selectedTower.row + r];
                cell.hasTower = false; cell.towerRef = null;
            }
        }
        towers.splice(towers.indexOf(selectedTower), 1);
        selectedTower = null; pathfinder.calculateFields(); updateUI();
    }
};

class MinHeap {
    constructor() { this.heap = []; }
    push(node) { this.heap.push(node); this.bubbleUp(this.heap.length - 1); }
    pop() {
        if (this.heap.length <= 1) return this.heap.pop();
        const top = this.heap[0]; this.heap[0] = this.heap.pop(); this.sinkDown(0); return top;
    }
    bubbleUp(idx) {
        const element = this.heap[idx];
        while (idx > 0) {
            let pIdx = Math.floor((idx - 1) / 2), parent = this.heap[pIdx];
            if (element.dist >= parent.dist) break;
            this.heap[pIdx] = element; this.heap[idx] = parent; idx = pIdx;
        }
    }
    sinkDown(idx) {
        const length = this.heap.length, element = this.heap[idx];
        while (true) {
            let leftIdx = 2 * idx + 1, rightIdx = 2 * idx + 2, swap = null;
            if (leftIdx < length && this.heap[leftIdx].dist < element.dist) swap = leftIdx;
            if (rightIdx < length && (swap === null ? this.heap[rightIdx].dist < element.dist : this.heap[rightIdx].dist < this.heap[leftIdx].dist)) swap = rightIdx;
            if (swap === null) break;
            this.heap[idx] = this.heap[swap]; this.heap[swap] = element; idx = swap;
        }
    }
    isEmpty() { return this.heap.length === 0; }
}

// ==========================================
// ENTITIES (Enemies & Allies)
// ==========================================
class Enemy {
    constructor(type, hpMultiplier = 1) {
        this.type = type; const stats = ENEMY_STATS[type];
        this.maxHp = Math.floor(stats.hp * hpMultiplier); this.hp = this.maxHp;
        this.speed = stats.speed; this.reward = stats.reward; this.color = stats.color; this.radius = stats.radius;
        this.role = stats.role; 
        
        this.meleeDmg = stats.meleeDmg; this.meleeCd = stats.meleeCd; this.meleeTimer = 0;
        this.damage = stats.damage || 0; this.rangeTiles = stats.rangeTiles || 0; this.range = this.rangeTiles * tileSize; 
        this.cooldown = stats.cooldown || 0; this.timeSinceAttack = 0;
        
        this.targetTower = null; this.isFiring = false; this.isDigging = false;

        const spawnTile = pathfinder.spawnTile;
        this.col = spawnTile.col; this.row = spawnTile.row;
        this.x = offsetX + this.col * tileSize + tileSize / 2;
        this.y = offsetY + this.row * tileSize + tileSize / 2;
        this.targetX = this.x; this.targetY = this.y;
        this.reachedBase = false;
    }

    update(dt) {
        this.isFiring = false;
        
        // --- СИСТЕМА БЛИЖНЕГО БОЯ С СОЮЗНИКАМИ ---
        let engagedAlly = null;
        for (let a of allies) {
            if (Math.hypot(this.x - a.x, this.y - a.y) < tileSize * 0.8) { engagedAlly = a; break; }
        }

        if (engagedAlly) {
            // Враг заблокирован союзником. Стоим и деремся!
            this.meleeTimer += dt;
            if (this.meleeTimer >= this.meleeCd) {
                engagedAlly.hp -= this.meleeDmg;
                this.meleeTimer = 0;
            }
            return; // Прерываем движение
        }
        
        // Логика Осадной Башни
        if (this.role === 'siege') {
            this.timeSinceAttack += dt;
            if (!this.targetTower || this.targetTower.hp <= 0) {
                this.targetTower = null;
                for (let t of towers) {
                    if (Math.hypot(this.x - t.x, this.y - t.y) <= this.range) { this.targetTower = t; break; }
                }
            }
            if (this.targetTower) {
                if (this.timeSinceAttack >= this.cooldown) {
                    this.targetTower.hp -= this.damage; this.timeSinceAttack = 0; this.isFiring = true;
                }
                return; 
            }
        }

        const speedPixels = this.speed * tileSize * dt;
        const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);

        if (dist <= speedPixels) {
            this.x = this.targetX; this.y = this.targetY;
            this.col = Math.floor((this.x - offsetX) / tileSize); this.row = Math.floor((this.y - offsetY) / tileSize);
            const currentTile = gameGrid.cells[this.col][this.row];

            if (currentTile.type === 'base') { this.hp = 0; this.reachedBase = true; return; }

            // Логика Землекопа
// Логика Землекопа
            if (this.role === 'digger') {
                this.isDigging = (currentTile.type === 'grass');
                
                if (this.isDigging) {
                    currentTile.type = 'road'; 
                    currentTile.baseCost = 1.0; 
                    currentTile.currentCost = 1.0; 
                    currentTile.isBuildable = false;
                    bgCtx.fillStyle = '#2d3436'; 
                    bgCtx.fillRect(offsetX + this.col * tileSize, offsetY + this.row * tileSize, tileSize, tileSize);
                    
                    // КРИТИЧЕСКИ ВАЖНОЕ ИСПРАВЛЕНИЕ:
                    // Пересчитываем пути ТОЛЬКО для остальных (союзников и обычных врагов).
                    // Землекоп свой стратегический вектор не обновляет, иначе он "испугается" 
                    // дороги (штраф 10.0), которую только что сам и создал!
                    pathfinder.calculateFlowField(false);
                    pathfinder.calculateAllyField(); 
                }
                
                let vector = currentTile.diggerVector;
                if (vector) {
                    this.targetX = offsetX + (this.col + vector.x) * tileSize + tileSize / 2;
                    this.targetY = offsetY + (this.row + vector.y) * tileSize + tileSize / 2;
                }
            } else {
                // Логика обычных врагов
                let vector = currentTile.vector;
                if (vector) {
                    this.targetX = offsetX + (this.col + vector.x) * tileSize + tileSize / 2;
                    this.targetY = offsetY + (this.row + vector.y) * tileSize + tileSize / 2;
                }
            }
        } else {
            this.x += ((this.targetX - this.x) / dist) * speedPixels; 
            this.y += ((this.targetY - this.y) / dist) * speedPixels;
        }
    }

    draw(ctx) {
        if (this.isDigging) {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * tileSize * 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(243, 156, 18, 0.4)'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(this.x, this.y, tileSize * this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
        
        const hpW = tileSize * 0.8;
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x - hpW/2, this.y - tileSize, hpW, 3);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - hpW/2, this.y - tileSize, hpW * Math.max(0, this.hp/this.maxHp), 3);

        if (this.isFiring && this.targetTower) {
            ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.targetTower.x, this.targetTower.y);
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
        }
    }
}

class Ally {
    constructor() {
        const stats = ALLY_STATS.Creep;
        this.maxHp = stats.hp; this.hp = this.maxHp;
        this.speed = stats.speed; this.damage = stats.damage; this.cooldown = stats.cooldown;
        this.color = stats.color; this.radius = stats.radius;
        this.attackTimer = 0;

        // Спавнятся на Базе Игрока
        const baseTile = pathfinder.baseTile;
        this.col = baseTile.col; this.row = baseTile.row;
        this.x = offsetX + this.col * tileSize + tileSize / 2;
        this.y = offsetY + this.row * tileSize + tileSize / 2;
        this.targetX = this.x; this.targetY = this.y;
    }

    update(dt) {
        let engagedEnemy = null;
        for (let e of enemies) {
            if (e.role !== 'siege' && e.type !== 'Titan' && Math.hypot(this.x - e.x, this.y - e.y) < tileSize * 0.8) { 
                engagedEnemy = e; break; // Боссов и осадки крипы не танкуют!
            }
        }

        if (engagedEnemy) {
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
            this.x = this.targetX; this.y = this.targetY;
            this.col = Math.floor((this.x - offsetX) / tileSize); this.row = Math.floor((this.y - offsetY) / tileSize);
            const currentTile = gameGrid.cells[this.col][this.row];

            if (currentTile.type === 'spawn') { this.hp = 0; return; } // Дошел до вражеской базы - умирает (можно давать бонус)

            // Движение по встречному вектору (к спавну врага)
            let vector = currentTile.allyVector;
            if (vector) {
                this.targetX = offsetX + (this.col + vector.x) * tileSize + tileSize / 2;
                this.targetY = offsetY + (this.row + vector.y) * tileSize + tileSize / 2;
            }
        } else {
            this.x += ((this.targetX - this.x) / dist) * speedPixels; 
            this.y += ((this.targetY - this.y) / dist) * speedPixels;
        }
    }

    draw(ctx) {
        ctx.beginPath(); ctx.arc(this.x, this.y, tileSize * this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x - tileSize*0.4, this.y - tileSize, tileSize*0.8, 3);
        ctx.fillStyle = '#3498db'; ctx.fillRect(this.x - tileSize*0.4, this.y - tileSize, tileSize*0.8 * Math.max(0, this.hp/this.maxHp), 3);
    }
}

// ==========================================
// TOWER (MULTI-CELL SUPPORT)
// ==========================================
class Tower {
    constructor(col, row, type) {
        this.col = col; this.row = row; this.type = type;
        const stats = TOWER_STATS[type];
        this.size = stats.size;
        
        // Центр башни теперь зависит от ее размера
        this.x = offsetX + col * tileSize + (this.size * tileSize) / 2; 
        this.y = offsetY + row * tileSize + (this.size * tileSize) / 2;
        
        this.level = 1; this.totalSpent = stats.cost; this.upgradeCost = Math.floor(stats.cost * 1.5);
        this.maxHp = stats.hp; this.hp = this.maxHp;
        this.rangeTiles = stats.rangeTiles; this.range = this.rangeTiles * tileSize;
        this.damage = stats.damage; this.cooldown = stats.cooldown; this.color = stats.color;
        this.timer = 0; this.target = null; this.isFiring = false; 
    }

    upgrade() {
        this.level++; this.totalSpent += this.upgradeCost;
        this.damage = Math.floor(this.damage * 1.8);
        this.rangeTiles += 0.5; this.range = this.rangeTiles * tileSize;
        this.maxHp += 100; this.hp += 100;
        this.upgradeCost = Math.floor(this.upgradeCost * 1.6);
    }

    update(dt) {
        this.timer += dt; this.isFiring = false;
        if (this.target && (this.target.hp <= 0 || Math.hypot(this.x - this.target.x, this.y - this.target.y) > this.range)) this.target = null;
        if (!this.target) {
            for (let e of enemies) if (Math.hypot(this.x - e.x, this.y - e.y) <= this.range) { this.target = e; break; }
        }
        if (this.target && this.timer >= this.cooldown) {
            this.target.hp -= this.damage; this.timer = 0; this.isFiring = true; 
        }
    }

    draw(ctx) {
        const tSize = tileSize * this.size;
        // Отрисовка тела башни с отступом 5% для красоты
        ctx.fillStyle = this.color; 
        ctx.fillRect(this.x - tSize/2 + 2, this.y - tSize/2 + 2, tSize - 4, tSize - 4);
        
        ctx.fillStyle = 'white';
        const pipSize = tileSize * 0.15, startX = this.x - (pipSize * this.level);
        for(let i=0; i<this.level; i++) ctx.fillRect(startX + (i * pipSize * 2), this.y - tSize/2 + 5, pipSize, pipSize);
        
        ctx.fillStyle = 'red'; ctx.fillRect(this.x - tSize/2 + 2, this.y + tSize/2 - 6, tSize - 4, 3);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - tSize/2 + 2, this.y + tSize/2 - 6, (tSize - 4) * Math.max(0, this.hp/this.maxHp), 3);

        if (this.isFiring && this.target) {
            ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.target.x, this.target.y);
            ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = this.size; ctx.stroke(); // У больших башен лазер толще!
        }

        if (selectedTower === this) {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3;
            ctx.strokeRect(this.x - tSize/2, this.y - tSize/2, tSize, tSize);
        }
    }
}

// ==========================================
// GRID & PATHFINDING
// ==========================================
// ==========================================
// GRID & PATHFINDING
// ==========================================
class Grid {
    constructor() { this.cells = []; this.createMap(); }

    createMap() {
        for (let c = 0; c < COLS; c++) {
            this.cells[c] = [];
            for (let r = 0; r < ROWS; r++) {
                // ДОБАВЛЕН ФЛАГ isMainRoad: false
                let tile = { col: c, row: r, type: 'grass', isBuildable: true, hasTower: false, towerRef: null, baseCost: Infinity, currentCost: Infinity, distance: Infinity, vector: null, diggerVector: null, allyVector: null, isMainRoad: false };
                
                // Для основных дорог ставим isMainRoad = true
                if ((c >= 3 && c <= 36 && r >= 3 && r <= 4) || (r >= 3 && r <= 36 && c >= 3 && c <= 4)) { tile.type = 'road'; tile.baseCost = 1; tile.isBuildable = false; tile.isMainRoad = true; }
                if ((c >= 3 && c <= 36 && r >= 35 && r <= 36) || (r >= 3 && r <= 36 && c >= 35 && c <= 36)) { tile.type = 'road'; tile.baseCost = 1; tile.isBuildable = false; tile.isMainRoad = true; }
                if (Math.abs(c + r - 39) <= 1 && c >= 3 && c <= 36) { tile.type = 'road'; tile.baseCost = 0.8; tile.isBuildable = false; tile.isMainRoad = true; }
                
                if (c >= 2 && c <= 5 && r >= 34 && r <= 37) { tile.type = 'base'; tile.isBuildable = false; tile.baseCost = 1; }
                if (c >= 34 && c <= 37 && r >= 2 && r <= 5) { tile.type = 'spawn'; tile.isBuildable = false; tile.baseCost = 1; }

                if (Math.hypot(c - 35, r - 4) <= 6) { tile.isBuildable = false; }

                this.cells[c][r] = tile;
            }
        }
    }

    cacheBackground(ctx) {
        ctx.fillStyle = '#1b4332'; ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let t = this.cells[c][r];
                const x = offsetX + c * tileSize, y = offsetY + r * tileSize;
                if (t.type === 'spawn') { ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y, tileSize, tileSize); }
                else if (t.type === 'base') { ctx.fillStyle = '#0984e3'; ctx.fillRect(x, y, tileSize, tileSize); }
                else if (t.type === 'road') { ctx.fillStyle = '#2d3436'; ctx.fillRect(x, y, tileSize, tileSize); }
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

    // УМНЫЙ ПОИСК ДЛЯ СОЮЗНИКОВ (Идут туда, где враги)
    calculateAllyField() {
        let distances = Array(COLS).fill().map(() => Array(ROWS).fill(Infinity));
        let heap = new MinHeap(); 
        
        let hasTargets = false;
        // Запускаем волну от координат текущих врагов (гравитация к угрозам)
        for (let e of enemies) {
            if (e.role !== 'digger') { // Землекопов не преследуем
                distances[e.col][e.row] = 0;
                heap.push({ tile: this.grid.cells[e.col][e.row], dist: 0 });
                hasTargets = true;
            }
        }

        // Если врагов нет, фоллбэк - идти к спавну
        if (!hasTargets) {
            distances[this.spawnTile.col][this.spawnTile.row] = 0;
            heap.push({ tile: this.spawnTile, dist: 0 });
        }

        while (!heap.isEmpty()) {
            let { tile: current, dist: currentDist } = heap.pop();
            if (currentDist > distances[current.col][current.row]) continue;

           for (let n of this.getNeighbors(current)) {
                if (n.hasTower || n.type === 'grass') continue; 
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
                if (tile.type === 'grass') continue; 
                let minNeighbor = null, minDist = Infinity;
                
                for (let n of this.getNeighbors(tile)) {
                    if (n.hasTower || n.type === 'grass') continue;
                    if (distances[n.col][n.row] < minDist) { minDist = distances[n.col][n.row]; minNeighbor = n; }
                }
                if (minNeighbor) tile.allyVector = { x: minNeighbor.col - tile.col, y: minNeighbor.row - tile.row };
            }
        }
    }

calculateFlowField(isForDigger) {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let tile = this.grid.cells[c][r];
                tile.penalty = 0;
                if (!isForDigger) { tile.distance = Infinity; tile.vector = null; }
                else { tile.diggerDistance = Infinity; tile.diggerVector = null; }
            }
        }

        // --- АУРА СТРАХА (ОБНОВЛЕННАЯ) ---
        for (let t of towers) {
            // Для Землекопа "радиус страха" на 1.5 клетки МЕНЬШЕ реального радиуса стрельбы!
            // Это заставит его идти по краю зоны обстрела, получая урон, но не подходя вплотную.
            let fearRadius = isForDigger ? Math.max(1, t.rangeTiles - 1.5) : t.rangeTiles;
            
            // Расширяем зону поиска с учетом размера многоклеточной башни
            let searchOffset = Math.ceil(fearRadius) + t.size;

            for (let dc = -searchOffset; dc <= searchOffset; dc++) {
                for (let dr = -searchOffset; dr <= searchOffset; dr++) {
                    let nc = t.col + dc, nr = t.row + dr;
                    if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
                        let centerCol = t.col + (t.size - 1) / 2;
                        let centerRow = t.row + (t.size - 1) / 2;
                        
                        if (Math.hypot(nc - centerCol, nr - centerRow) <= fearRadius) {
                            if (isForDigger) {
                                this.grid.cells[nc][nr].penalty += 20.0; 
                            } else if (this.grid.cells[nc][nr].type === 'road') {
                                this.grid.cells[nc][nr].penalty += 5.0; 
                            }
                        }
                    }
                }
            }
        }

        // 3. АЛГОРИТМ ДЕЙКСТРЫ (ПОИСК ПУТИ)
        let distances = Array(COLS).fill().map(() => Array(ROWS).fill(Infinity));
        distances[this.baseTile.col][this.baseTile.row] = 0;

        let heap = new MinHeap(); 
        heap.push({ tile: this.baseTile, dist: 0 });

        while (!heap.isEmpty()) {
            let { tile: current, dist: currentDist } = heap.pop();
            if (currentDist > distances[current.col][current.row]) continue;

           for (let n of this.getNeighbors(current)) {
                let cost = Infinity;
                
                if (isForDigger) {
                    if (n.type === 'grass') {
                        // БОЯЗНЬ ОСНОВНОЙ ОБОЧИНЫ
                        let isNearMainRoad = false;
                        for (let adj of this.getNeighbors(n)) {
                            if (adj.isMainRoad) { isNearMainRoad = true; break; }
                        }
                        cost = isNearMainRoad ? 50.0 : 1.0; 
                    } 
                    else if (n.type === 'road' || n.type === 'spawn' || n.type === 'base') {
                        cost = 10.0; // Ненавидит любые дороги
                    } else {
                        cost = 1.0;
                    }
                    
                    if (cost !== Infinity) cost += n.penalty;
                } else {
                    if (n.hasTower || n.type === 'grass') continue; 
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

        // 4. ВЕКТОРНОЕ ПОЛЕ (УКАЗАТЕЛИ ДВИЖЕНИЯ)
        // ... (оставь код векторов без изменений, как он у тебя и был)
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let tile = this.grid.cells[c][r];
                if (tile === this.baseTile || (!isForDigger && tile.type === 'grass')) continue; 
                let minNeighbor = null, minDist = Infinity;
                
                for (let n of this.getNeighbors(tile)) {
                    if (!isForDigger && (n.hasTower || n.type === 'grass')) continue;
                    let nDist = distances[n.col][n.row];
                    if (nDist < minDist) { minDist = nDist; minNeighbor = n; }
                }
                if (minNeighbor) {
                    let vec = { x: minNeighbor.col - tile.col, y: minNeighbor.row - tile.row };
                    if (isForDigger) tile.diggerVector = vec; else tile.vector = vec;
                }
            }
        }
    }

    getNeighbors(tile) {
        let neighbors = [], dirs = [ {x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0} ];
        for (let d of dirs) {
            let nc = tile.col + d.x, nr = tile.row + d.y;
            if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) neighbors.push(this.grid.cells[nc][nr]);
        }
        return neighbors;
    }
}

// ==========================================
// WAVE MANAGER
// ==========================================
class WaveManager {
    constructor() {
        this.waveNumber = 0; this.enemiesToSpawn = []; this.spawnTimer = 0; this.isSpawning = false;
        this.waveCooldown = 5; this.uiTimer = document.getElementById('ui-timer');
    }
    startNextWave() {
        this.waveNumber++; document.getElementById('ui-wave').innerText = this.waveNumber; this.isSpawning = true;
        
        let knightCount = this.waveNumber === 1 ? 3 : Math.floor(3 + this.waveNumber * 1.5);
        let mageCount = this.waveNumber < 3 ? 0 : Math.floor(this.waveNumber * 1.2);
        
        for(let i=0; i<knightCount; i++) this.enemiesToSpawn.push('Knight');
        for(let i=0; i<mageCount; i++) this.enemiesToSpawn.push('Mage');
        
        if (this.waveNumber >= 5) for(let i=0; i<Math.floor(this.waveNumber / 4); i++) this.enemiesToSpawn.push('Siege');
        if (this.waveNumber > 2 && this.waveNumber % 3 === 0) this.enemiesToSpawn.push('Digger', 'Digger');
        if (this.waveNumber > 0 && this.waveNumber % 10 === 0) this.enemiesToSpawn.push('Titan');
        
        this.enemiesToSpawn.sort(() => Math.random() - 0.5);
    }
    update(dt) {
        if (this.isSpawning) {
            if (this.uiTimer) this.uiTimer.innerText = "В бою!";
            this.spawnTimer += dt;
            const spawnInterval = Math.max(0.3, 1.2 - (this.waveNumber * 0.05));
            if (this.spawnTimer >= spawnInterval && this.enemiesToSpawn.length > 0) {
                const hpMult = 1 + 0.1 * (this.waveNumber - 1) + 0.04 * Math.pow(this.waveNumber - 1, 2);
                enemies.push(new Enemy(this.enemiesToSpawn.pop(), hpMult));
                this.spawnTimer = 0;
            }
            if (this.enemiesToSpawn.length === 0 && enemies.length === 0) { this.isSpawning = false; this.waveCooldown = 15; }
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
    const dpr = window.devicePixelRatio || 1;
    canvas.width = document.getElementById('game-container').clientWidth * dpr; 
    canvas.height = document.getElementById('game-container').clientHeight * dpr;
    bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    canvas.style.width = '100%'; canvas.style.height = '100%';
    ctx.scale(dpr, dpr); bgCtx.scale(dpr, dpr);
    
    // Перерасчет сетки под новый контейнер
    let logicalW = canvas.width / dpr, logicalH = canvas.height / dpr;
    tileSize = Math.floor(Math.min(logicalW / COLS, logicalH / ROWS));
    offsetX = Math.floor((logicalW - tileSize * COLS) / 2);
    offsetY = Math.floor((logicalH - tileSize * ROWS) / 2);

    gameGrid.cacheBackground(bgCtx);
    
    for (let t of towers) {
        t.x = offsetX + t.col * tileSize + (t.size * tileSize) / 2; 
        t.y = offsetY + t.row * tileSize + (t.size * tileSize) / 2;
        t.range = t.rangeTiles * tileSize; 
    }
    for (let e of enemies) {
        e.x = offsetX + e.col * tileSize + tileSize / 2; e.y = offsetY + e.row * tileSize + tileSize / 2;
        e.targetX = e.x; e.targetY = e.y; e.range = e.rangeTiles * tileSize;
    }
}

window.addEventListener('mousemove', (e) => {
    // Корректировка мыши относительно canvas
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    const col = Math.floor((mouse.x - offsetX) / tileSize);
    const row = Math.floor((mouse.y - offsetY) / tileSize);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) { mouse.col = col; mouse.row = row; } else { mouse.col = -1; mouse.row = -1; }
});

window.addEventListener('click', (e) => {
    if (e.target.closest('#build-menu') || e.target.closest('#upgrade-menu')) return;
    if (mouse.col !== -1 && mouse.row !== -1 && !isGameOver) {
        const tile = gameGrid.cells[mouse.col][mouse.row];
        
        // Клик по многоклеточной башне
        if (tile.towerRef) { selectedTower = tile.towerRef; updateUpgradeUI(); return; }

        const stats = TOWER_STATS[currentBuildType];
        const size = stats.size;
        
        // Проверка: можно ли построить башню size x size
        let canBuild = true;
        for(let c = 0; c < size; c++) {
            for(let r = 0; r < size; r++) {
                let nc = mouse.col + c, nr = mouse.row + r;
                if(nc >= COLS || nr >= ROWS) { canBuild = false; break; }
                let checkTile = gameGrid.cells[nc][nr];
                if(!checkTile.isBuildable || checkTile.hasTower) canBuild = false;
            }
        }

        if (canBuild && gold >= stats.cost) {
            if (towers.length >= MAX_TOWERS) {
                document.getElementById('ui-towers').style.color = 'red';
                setTimeout(() => document.getElementById('ui-towers').style.color = 'white', 500);
                return;
            }
            let newTower = new Tower(mouse.col, mouse.row, currentBuildType);
            towers.push(newTower); 
            
            // Помечаем все клетки занятыми
            for(let c = 0; c < size; c++) {
                for(let r = 0; r < size; r++) {
                    gameGrid.cells[mouse.col+c][mouse.row+r].hasTower = true;
                    gameGrid.cells[mouse.col+c][mouse.row+r].towerRef = newTower;
                }
            }
            pathfinder.calculateFields(); gold -= stats.cost; selectedTower = null; updateUI();
        } else { selectedTower = null; updateUpgradeUI(); }
    }
});

window.addEventListener('resize', setupCanvas);

// ==========================================
// GAME LOOP
// ==========================================
let lastTime = 0;
let allySpawnCooldown = 0; // Кулдаун между выходами союзников
let allyUpdateTimer = 0;   // Таймер обновления радара союзников

function gameLoop(timestamp) {
    if (isGameOver) return;
    let dt = (timestamp - (lastTime || timestamp)) / 1000;
    if (dt > 0.1) dt = 0.1; lastTime = timestamp;

    goldTimer += dt;
    if (goldTimer >= 1.0) { gold += goldPerSecond; goldTimer -= 1.0; updateUI(); }

// --- УМНЫЙ СПАВН СОЮЗНИКОВ (1 к 4) ---
    // Фильтруем реальные угрозы (игнорируем Землекопов, они не дерутся)
    let activeThreats = enemies.filter(e => e.role !== 'digger');
    allySpawnCooldown -= dt;
    
    // Рассчитываем нужное количество крипов: 1 на каждые 4 врага.
    // Math.ceil округляет вверх (1-4 врага = 1 крип, 5-8 врагов = 2 крипа)
    let desiredAllies = activeThreats.length > 0 ? Math.ceil(activeThreats.length / 4) : 0;

    // Спавним, пока количество живых союзников меньше нужного
    if (allies.length < desiredAllies && allySpawnCooldown <= 0) {
        allies.push(new Ally());
        allySpawnCooldown = 1.5; // Задержка, чтобы они выходили красивой цепочкой, а не в одной точке
    }

    // Динамическое обновление путей союзников
    allyUpdateTimer += dt;
    if (allyUpdateTimer >= 0.5) {
        pathfinder.calculateAllyField();
        allyUpdateTimer = 0;
    }

    ctx.drawImage(bgCanvas, 0, 0, canvas.width, canvas.height);

    // Отрисовка зоны постройки
    if (mouse.col !== -1 && mouse.row !== -1 && !selectedTower) {
        const size = TOWER_STATS[currentBuildType].size;
        let canBuild = true;
        for(let c = 0; c < size; c++) {
            for(let r = 0; r < size; r++) {
                let nc = mouse.col + c, nr = mouse.row + r;
                if(nc >= COLS || nr >= ROWS || !gameGrid.cells[nc][nr].isBuildable || gameGrid.cells[nc][nr].hasTower) canBuild = false;
            }
        }
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(offsetX + mouse.col*tileSize, offsetY + mouse.row*tileSize, tileSize * size, tileSize * size);
        ctx.strokeStyle = (canBuild && towers.length < MAX_TOWERS) ? '#2ecc71' : '#e74c3c'; 
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX + mouse.col*tileSize + 1, offsetY + mouse.row*tileSize + 1, (tileSize * size) - 2, (tileSize * size) - 2);
    }

    // Обновление башен
    for (let i = towers.length - 1; i >= 0; i--) {
        let t = towers[i];
        if (t.hp <= 0) {
            for(let c=0; c<t.size; c++) for(let r=0; r<t.size; r++) {
                gameGrid.cells[t.col+c][t.row+r].hasTower = false;
                gameGrid.cells[t.col+c][t.row+r].towerRef = null;
            }
            if (selectedTower === t) { selectedTower = null; updateUpgradeUI(); }
            towers.splice(i, 1); pathfinder.calculateFields(); updateUI();
        } else { t.update(dt); t.draw(ctx); }
    }

    // Обновление союзников
    for (let i = allies.length - 1; i >= 0; i--) {
        let a = allies[i];
        a.update(dt); a.draw(ctx);
        if (a.hp <= 0) allies.splice(i, 1);
    }

    // Обновление врагов
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        enemy.update(dt); enemy.draw(ctx);
        if (enemy.hp <= 0) {
            if (!enemy.reachedBase && enemy.role !== 'digger') {
                gold += enemy.reward; score += enemy.reward * 5;
            } else if (enemy.reachedBase) {
                let damageToBase = (enemy.type === 'Titan') ? 10 : (enemy.role === 'siege' || enemy.role === 'digger') ? 5 : 1;
                lives -= damageToBase;
                if (lives <= 0) {
                    isGameOver = true;
                    document.getElementById('game-over-screen').classList.remove('hidden');
                    document.getElementById('final-score').innerText = score;
                }
            }
            enemies.splice(i, 1); updateUI();
        }
    }

    waveManager.update(dt);
    requestAnimationFrame(gameLoop);
}

setupCanvas();
pathfinder.calculateFields();
updateUI();
requestAnimationFrame(gameLoop);