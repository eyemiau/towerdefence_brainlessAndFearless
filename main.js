// ==========================================
// 1. ГЛОБАЛЬНЫЕ НАСТРОЙКИ И КЭШИРОВАНИЕ
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d', { alpha: false });

const COLS = 40;
const ROWS = 40;
let tileSize = 0;
let offsetX = 0;
let offsetY = 0;

const mouse = { x: -1, y: -1, col: -1, row: -1 };

// ==========================================
// 2. СОСТОЯНИЕ ИГРЫ И БАЛАНС
// ==========================================
const enemies = [];
const towers = [];
let gold = 130; 
let lives = 20;
let score = 0;
let isGameOver = false;
let selectedTower = null; 

// Пассивный доход
let goldPerSecond = 5; // Сколько золота капает в секунду
let goldTimer = 0;

const ENEMY_STATS = {
    Knight: { hp: 120, speed: 2.0, reward: 10, color: '#bdc3c7', radius: 0.4, role: 'basic' },
    Mage:   { hp: 70,  speed: 2.8, reward: 15, color: '#9b59b6', radius: 0.3, role: 'basic' },
    Siege:  { hp: 800, speed: 1.0, reward: 80, color: '#c0392b', radius: 0.6, role: 'siege', damage: 30, rangeTiles: 5, cooldown: 1 },
    Digger: { hp: 500, speed: 4.0, reward: 50, color: '#f39c12', radius: 0.35, role: 'digger' }, 
    Titan:  { hp: 5000, speed: 0.8, reward: 500, color: '#f1c40f', radius: 0.8, role: 'basic' }    
};

const TOWER_STATS = {
    Basic:  { cost: 50,  hp: 200, damage: 20,  rangeTiles: 5,   cooldown: 0.5, color: '#3498db', name: 'Базовая' },
    Sniper: { cost: 120, hp: 150, damage: 120, rangeTiles: 12,  cooldown: 2.0, color: '#9b59b6', name: 'Снайпер' },
    Rapid:  { cost: 80,  hp: 250, damage: 8,   rangeTiles: 3.5, cooldown: 0.1, color: '#f1c40f', name: 'Пулемет' }
};

let currentBuildType = 'Basic';

window.selectTower = function(type) {
    currentBuildType = type;
    document.querySelectorAll('.build-option').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('btn-' + type);
    if (btn) btn.classList.add('active');
    
    selectedTower = null;
    updateUpgradeUI();
};

function updateUI() {
    document.getElementById('ui-lives').innerText = lives;
    // Обновляем текст золота, добавляя красивую приписку инкома
    document.getElementById('ui-gold').innerText = `${Math.floor(gold)} (+${goldPerSecond}/с)`;
    document.getElementById('ui-score').innerText = score;
    updateUpgradeUI();
}

function updateUpgradeUI() {
    const menu = document.getElementById('upgrade-menu');
    if (!selectedTower) {
        menu.classList.add('hidden');
        return;
    }
    menu.classList.remove('hidden');
    document.getElementById('upg-title').innerText = TOWER_STATS[selectedTower.type].name;
    document.getElementById('upg-level').innerText = selectedTower.level;
    document.getElementById('upg-damage').innerText = selectedTower.damage;
    
    const upgBtn = document.getElementById('btn-upgrade');
    if (selectedTower.level >= 3) {
        upgBtn.innerText = "Макс. Уровень";
        upgBtn.disabled = true;
    } else {
        upgBtn.innerText = `Улучшить (${selectedTower.upgradeCost}g)`;
        upgBtn.disabled = gold < selectedTower.upgradeCost;
    }
    document.getElementById('btn-sell').innerText = `Продать (+${Math.floor(selectedTower.totalSpent / 2)}g)`;
}

window.upgradeSelectedTower = function() {
    if (selectedTower && selectedTower.level < 3 && gold >= selectedTower.upgradeCost) {
        gold -= selectedTower.upgradeCost;
        selectedTower.upgrade();
        updateUI();
    }
};

window.sellSelectedTower = function() {
    if (selectedTower) {
        gold += Math.floor(selectedTower.totalSpent / 2);
        gameGrid.cells[selectedTower.col][selectedTower.row].hasTower = false;
        
        const idx = towers.indexOf(selectedTower);
        if (idx > -1) towers.splice(idx, 1);
        
        selectedTower = null;
        pathfinder.calculateFields(); 
        updateUI();
    }
};

// ==========================================
// 3. МИНИ-КУЧА
// ==========================================
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
            let parentIdx = Math.floor((idx - 1) / 2), parent = this.heap[parentIdx];
            if (element.dist >= parent.dist) break;
            this.heap[parentIdx] = element; this.heap[idx] = parent; idx = parentIdx;
        }
    }
    sinkDown(idx) {
        const length = this.heap.length, element = this.heap[idx];
        while (true) {
            let leftIdx = 2 * idx + 1, rightIdx = 2 * idx + 2;
            let left, right, swap = null;
            if (leftIdx < length) { left = this.heap[leftIdx]; if (left.dist < element.dist) swap = leftIdx; }
            if (rightIdx < length) { right = this.heap[rightIdx]; if ((swap === null && right.dist < element.dist) || (swap !== null && right.dist < left.dist)) swap = rightIdx; }
            if (swap === null) break;
            this.heap[idx] = this.heap[swap]; this.heap[swap] = element; idx = swap;
        }
    }
    isEmpty() { return this.heap.length === 0; }
}

// ==========================================
// 4. СУЩНОСТИ
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
        this.damage = stats.damage || 0;
        this.rangeTiles = stats.rangeTiles || 0;
        this.range = this.rangeTiles * tileSize; 
        
        this.cooldown = stats.cooldown || 0;
        this.timeSinceAttack = 0;
        this.targetTower = null;
        this.isFiring = false;
        this.isDigging = false;
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

        if (this.role === 'siege') {
            this.timeSinceAttack += dt;
            if (!this.targetTower || this.targetTower.hp <= 0) {
                this.targetTower = null;
                for (let t of towers) {
                    const dx = this.x - t.x, dy = this.y - t.y;
                    if (Math.sqrt(dx*dx + dy*dy) <= this.range) { this.targetTower = t; break; }
                }
            }
            if (this.targetTower) {
                if (this.timeSinceAttack >= this.cooldown) {
                    this.targetTower.hp -= this.damage;
                    this.timeSinceAttack = 0; this.isFiring = true;
                }
                return; 
            }
        }

        const speedPixels = this.speed * tileSize * dt;
        const dx = this.targetX - this.x, dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= speedPixels) {
            this.x = this.targetX; this.y = this.targetY;
            this.col = Math.floor((this.x - offsetX) / tileSize);
            this.row = Math.floor((this.y - offsetY) / tileSize);

            const currentTile = gameGrid.cells[this.col][this.row];

            if (currentTile.type === 'base') { this.hp = 0; this.reachedBase = true; return; }

            if (this.role === 'digger') {
                this.isDigging = true;
                for (let t of towers) {
                    if (Math.abs(t.col - this.col) <= 1 && Math.abs(t.row - this.row) <= 1) {
                        t.hp -= 9999; this.hp = 0; return;
                    }
                }
                if (currentTile.type === 'grass') {
                    currentTile.type = 'road'; currentTile.baseCost = 1.0; currentTile.currentCost = 1.0; currentTile.isBuildable = false;
                    bgCtx.fillStyle = '#2d3436'; bgCtx.fillRect(offsetX + this.col * tileSize, offsetY + this.row * tileSize, tileSize, tileSize);
                    pathfinder.calculateFields();
                }
            }

            let vectorToUse = this.role === 'digger' ? currentTile.diggerVector : currentTile.vector;
            if (vectorToUse) {
                this.targetX = offsetX + (this.col + vectorToUse.x) * tileSize + tileSize / 2;
                this.targetY = offsetY + (this.row + vectorToUse.y) * tileSize + tileSize / 2;
            }
        } else {
            this.x += (dx / distance) * speedPixels; this.y += (dy / distance) * speedPixels;
        }
    }

    draw(context) {
        context.beginPath();
        context.arc(this.x, this.y, tileSize * this.radius, 0, Math.PI * 2);
        context.fillStyle = this.color; context.fill();

        const hpBarWidth = tileSize * 0.8;
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        context.fillStyle = '#e74c3c'; context.fillRect(this.x - hpBarWidth / 2, this.y - tileSize, hpBarWidth, 3);
        context.fillStyle = '#2ecc71'; context.fillRect(this.x - hpBarWidth / 2, this.y - tileSize, hpBarWidth * hpPercent, 3);

        if (this.isFiring && this.targetTower) {
            context.beginPath(); context.moveTo(this.x, this.y); context.lineTo(this.targetTower.x, this.targetTower.y);
            context.strokeStyle = '#c0392b'; context.lineWidth = 2; context.stroke();
        }
    }
}

class Tower {
    constructor(col, row, type) {
        this.col = col; this.row = row;
        this.type = type;
        this.x = offsetX + col * tileSize + tileSize / 2;
        this.y = offsetY + row * tileSize + tileSize / 2;

        const stats = TOWER_STATS[type];
        this.level = 1;
        this.totalSpent = stats.cost;
        this.upgradeCost = Math.floor(stats.cost * 1.5);
        
        this.maxHp = stats.hp; this.hp = this.maxHp;
        this.rangeTiles = stats.rangeTiles;
        this.range = this.rangeTiles * tileSize;
        
        this.damage = stats.damage;
        this.cooldown = stats.cooldown;
        this.color = stats.color;
        
        this.timeSinceLastFire = 0;
        this.target = null;
        this.isFiring = false; 
    }

    upgrade() {
        this.level++;
        this.totalSpent += this.upgradeCost;
        this.damage = Math.floor(this.damage * 1.5);
        this.rangeTiles += 0.5;
        this.range = this.rangeTiles * tileSize;
        this.maxHp += 100;
        this.hp += 100;
        this.upgradeCost = Math.floor(this.upgradeCost * 1.5);
    }

    update(dt) {
        this.timeSinceLastFire += dt; this.isFiring = false;
        if (this.target && (this.target.hp <= 0 || this.getDistance(this.target) > this.range)) this.target = null;
        if (!this.target) {
            for (let enemy of enemies) {
                if (this.getDistance(enemy) <= this.range) { this.target = enemy; break; }
            }
        }
        if (this.target && this.timeSinceLastFire >= this.cooldown) {
            this.target.hp -= this.damage; this.timeSinceLastFire = 0; this.isFiring = true; 
        }
    }

    getDistance(enemy) { return Math.sqrt(Math.pow(this.x - enemy.x, 2) + Math.pow(this.y - enemy.y, 2)); }

    draw(context) {
        context.fillStyle = this.color;
        context.fillRect(this.x - tileSize * 0.4, this.y - tileSize * 0.4, tileSize * 0.8, tileSize * 0.8);
        
        context.fillStyle = 'white';
        for(let i=0; i<this.level; i++) {
            context.fillRect(this.x - tileSize*0.3 + (i * tileSize*0.25), this.y - tileSize*0.3, tileSize*0.15, tileSize*0.15);
        }
        
        if (this.hp < this.maxHp) {
            const hpPercent = Math.max(0, this.hp / this.maxHp);
            context.fillStyle = 'red'; context.fillRect(this.x - tileSize * 0.4, this.y + tileSize * 0.5, tileSize * 0.8, 2);
            context.fillStyle = '#2ecc71'; context.fillRect(this.x - tileSize * 0.4, this.y + tileSize * 0.5, tileSize * 0.8 * hpPercent, 2);
        }

        if (this.isFiring && this.target) {
            context.beginPath(); context.moveTo(this.x, this.y); context.lineTo(this.target.x, this.target.y);
            context.strokeStyle = '#f1c40f'; context.lineWidth = 2; context.stroke();
        }

        if (selectedTower === this) {
            context.beginPath();
            context.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            context.lineWidth = 1;
            context.stroke();
            
            context.strokeStyle = '#2ecc71'; context.lineWidth = 2;
            context.strokeRect(this.x - tileSize*0.45, this.y - tileSize*0.45, tileSize*0.9, tileSize*0.9);
        }
    }
}

// ==========================================
// 5. КАРТА (40x40 - ТОНКИЕ ДОРОГИ)
// ==========================================
class Tile {
    constructor(col, row) {
        this.col = col; this.row = row;
        this.type = 'grass'; this.isBuildable = true; this.hasTower = false;
        this.baseCost = Infinity; this.currentCost = Infinity; 
        this.distance = Infinity; this.vector = null; this.diggerVector = null; 
    }
}

class Grid {
    constructor() { this.cells = []; this.createMap(); }

    createMap() {
        for (let c = 0; c < COLS; c++) {
            this.cells[c] = [];
            for (let r = 0; r < ROWS; r++) {
                const tile = new Tile(c, r);

                if ((c >= 3 && c <= 4 && r >= 3 && r <= 36) || (r >= 3 && r <= 4 && c >= 3 && c <= 36)) { 
                    tile.type = 'road'; tile.baseCost = 1.0; tile.isBuildable = false; 
                }
                if ((r >= 35 && r <= 36 && c >= 3 && c <= 36) || (c >= 35 && c <= 36 && r >= 3 && r <= 36)) { 
                    tile.type = 'road'; tile.baseCost = 1.0; tile.isBuildable = false; 
                }
                if (Math.abs(c + r - 39) <= 1 && c >= 3 && c <= 36) { 
                    tile.type = 'road'; tile.baseCost = 0.8; tile.isBuildable = false; 
                }
                const distToSpawn = Math.hypot(c - 44, r - 5);
                if (distToSpawn < 6) {
                    tile.isBuildable = false;
                }       
                if (c >= 2 && c <= 5 && r >= 34 && r <= 37) { tile.type = 'base'; tile.isBuildable = false; tile.baseCost = 1; }
                if (c >= 34 && c <= 37 && r >= 2 && r <= 5) { tile.type = 'spawn'; tile.isBuildable = false; tile.baseCost = 1; }

                this.cells[c][r] = tile;
            }
        }
    }

    cacheBackground(ctx) {
        ctx.fillStyle = '#1b4332'; ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let tile = this.cells[c][r];
                const x = offsetX + c * tileSize, y = offsetY + r * tileSize;
                if (tile.type === 'spawn') { ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y, tileSize, tileSize); }
                else if (tile.type === 'base') { ctx.fillStyle = '#0984e3'; ctx.fillRect(x, y, tileSize, tileSize); }
                else if (tile.type === 'road') { ctx.fillStyle = '#2d3436'; ctx.fillRect(x, y, tileSize, tileSize); }
            }
        }
    }
}

class Pathfinder {
    constructor(grid) {
        this.grid = grid;
        this.spawnTile = grid.cells[36][3]; 
        this.baseTile = grid.cells[3][36];  
    }
    calculateFields() { this.calculateFlowField(false); this.calculateFlowField(true); }
    
    calculateFlowField(isForDigger) {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let tile = this.grid.cells[c][r];
                tile.currentCost = tile.baseCost;
                if (!isForDigger) { tile.distance = Infinity; tile.vector = null; }
            }
        }

        if (!isForDigger) {
            for (let t of towers) {
                const rangeInTiles = Math.ceil(t.rangeTiles);
                for (let dc = -rangeInTiles; dc <= rangeInTiles; dc++) {
                    for (let dr = -rangeInTiles; dr <= rangeInTiles; dr++) {
                        let nc = t.col + dc, nr = t.row + dr;
                        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && Math.sqrt(dc*dc + dr*dr) <= rangeInTiles) {
                            if (this.grid.cells[nc][nr].type === 'road') this.grid.cells[nc][nr].currentCost += 20; 
                        }
                    }
                }
            }
        }

        let diggerDistances = Array(COLS).fill().map(() => Array(ROWS).fill(Infinity));
        if (isForDigger) diggerDistances[this.baseTile.col][this.baseTile.row] = 0;
        else this.baseTile.distance = 0;

        let heap = new MinHeap(); heap.push({ tile: this.baseTile, dist: 0 });

while (!heap.isEmpty()) {
            let currentData = heap.pop(), current = currentData.tile;
            let currentDist = isForDigger ? diggerDistances[current.col][current.row] : current.distance;
            if (currentData.dist > currentDist) continue;

            for (let n of this.getNeighbors(current)) {
                if (n.hasTower) continue;
                if (!isForDigger && n.type === 'grass') continue; 
                
                // === ИСПРАВЛЕНИЕ ЗДЕСЬ ===
                // Для Землекопа стоимость любого шага = 1. Он пойдет напролом!
                // Для обычных врагов берем текущую стоимость со всеми штрафами от башен.
               let cost = isForDigger ? (n.type === 'grass' ? 1.5 : n.baseCost) : n.currentCost;
                // ==========================
                
                let newDist = currentDist + cost;
                let nDist = isForDigger ? diggerDistances[n.col][n.row] : n.distance;
                if (newDist < nDist) {
                    if (isForDigger) diggerDistances[n.col][n.row] = newDist; else n.distance = newDist;
                    heap.push({ tile: n, dist: newDist });
                }
            }
        }

        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let tile = this.grid.cells[c][r];
                if (tile === this.baseTile || (!isForDigger && tile.type === 'grass')) continue; 
                let minNeighbor = null, minDist = Infinity;
                for (let n of this.getNeighbors(tile)) {
                    if (n.hasTower || (!isForDigger && n.type === 'grass')) continue;
                    let nDist = isForDigger ? diggerDistances[n.col][n.row] : n.distance;
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
// 6. ВОЛНЫ
// ==========================================
class WaveManager {
    constructor() {
        this.waveNumber = 0; this.enemiesToSpawn = []; this.spawnTimer = 0; this.isSpawning = false;
        this.waveCooldown = 5; this.uiTimer = document.getElementById('ui-timer');
    }
    startNextWave() {
        this.waveNumber++; 
        document.getElementById('ui-wave').innerText = this.waveNumber; 
        this.isSpawning = true;
        let knightCount = 5 + this.waveNumber * 3, mageCount = this.waveNumber > 2 ? Math.floor(this.waveNumber * 2) : 0;
        for(let i=0; i<knightCount; i++) this.enemiesToSpawn.push('Knight');
        for(let i=0; i<mageCount; i++) this.enemiesToSpawn.push('Mage');
        if (this.waveNumber >= 4) for(let i=0; i<Math.floor(this.waveNumber / 3); i++) this.enemiesToSpawn.push('Siege');
        if (this.waveNumber % 10 === 0) {
            this.enemiesToSpawn.push('Titan'); 
        }
        if (this.waveNumber > 1 && this.waveNumber % 3 === 0) this.enemiesToSpawn.push('Digger', 'Digger');
        this.enemiesToSpawn.sort(() => Math.random() - 0.5);
    }
    update(dt) {
        if (this.isSpawning) {
            if (this.uiTimer) this.uiTimer.innerText = "В бою!";
            this.spawnTimer += dt;
            const spawnInterval = Math.max(0.3, 1.2 - (this.waveNumber * 0.05));
            if (this.spawnTimer >= spawnInterval && this.enemiesToSpawn.length > 0) {
                const hpMult = 1 + (this.waveNumber - 1) * 0.25;
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
// 7. ИНИЦИАЛИЗАЦИЯ И СОБЫТИЯ
// ==========================================
function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
    bgCanvas.width = window.innerWidth * dpr; bgCanvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`; canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr); bgCtx.scale(dpr, dpr);
    
    tileSize = Math.floor(Math.min(window.innerWidth / COLS, window.innerHeight / ROWS));
    offsetX = Math.floor((window.innerWidth - tileSize * COLS) / 2);
    offsetY = Math.floor((window.innerHeight - tileSize * ROWS) / 2);

    gameGrid.cacheBackground(bgCtx);
    
    for (let t of towers) {
        t.x = offsetX + t.col * tileSize + tileSize / 2;
        t.y = offsetY + t.row * tileSize + tileSize / 2;
        t.range = t.rangeTiles * tileSize; 
    }
    
    for (let e of enemies) {
        e.x = offsetX + e.col * tileSize + tileSize / 2;
        e.y = offsetY + e.row * tileSize + tileSize / 2;
        e.targetX = e.x; 
        e.targetY = e.y;
        e.range = e.rangeTiles * tileSize;
    }
}

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    const col = Math.floor((mouse.x - offsetX) / tileSize);
    const row = Math.floor((mouse.y - offsetY) / tileSize);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) { mouse.col = col; mouse.row = row; } 
    else { mouse.col = -1; mouse.row = -1; }
});

window.addEventListener('click', (e) => {
    if (e.target.closest('#build-menu') || e.target.closest('.top-bar') || e.target.closest('#upgrade-menu')) return;

    if (mouse.col !== -1 && mouse.row !== -1 && !isGameOver) {
        const tile = gameGrid.cells[mouse.col][mouse.row];
        let clickedTower = towers.find(t => t.col === mouse.col && t.row === mouse.row);
        
        if (clickedTower) {
            selectedTower = clickedTower;
            updateUpgradeUI();
            return;
        }

        const stats = TOWER_STATS[currentBuildType];
        if (tile.isBuildable && !tile.hasTower && gold >= stats.cost) {
            tile.hasTower = true; 
            pathfinder.calculateFields();
            gold -= stats.cost; 
            towers.push(new Tower(mouse.col, mouse.row, currentBuildType)); 
            
            selectedTower = null; 
            updateUI();
        } else {
            selectedTower = null; 
            updateUpgradeUI();
        }
    }
});

window.addEventListener('resize', setupCanvas);

// ==========================================
// 8. ИГРОВОЙ ЦИКЛ (С ПАССИВНЫМ ИНКОМОМ)
// ==========================================
let lastTime = 0;
function gameLoop(timestamp) {
    if (isGameOver) return;
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = timestamp;

    // --- ПАССИВНЫЙ ИНКОМ ---
    goldTimer += dt;
    if (goldTimer >= 1.0) {
        gold += goldPerSecond;
        goldTimer -= 1.0;
        updateUI(); 
    }
    // ------------------------

    ctx.drawImage(bgCanvas, 0, 0, canvas.width, canvas.height);

    if (mouse.col !== -1 && mouse.row !== -1) {
        const hTile = gameGrid.cells[mouse.col][mouse.row];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(offsetX + mouse.col*tileSize, offsetY + mouse.row*tileSize, tileSize, tileSize);
        if (hTile.isBuildable && !hTile.hasTower) {
            ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; // Зеленая рамка (можно строить)
            ctx.strokeRect(offsetX + mouse.col*tileSize + 1, offsetY + mouse.row*tileSize + 1, tileSize - 2, tileSize - 2);
        } else {
        // Рисуем красную рамку, если строить нельзя
            ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2;
            ctx.strokeRect(offsetX + mouse.col*tileSize + 1, offsetY + mouse.row*tileSize + 1, tileSize - 2, tileSize - 2);
    }
    }

    for (let i = towers.length - 1; i >= 0; i--) {
        let t = towers[i];
        if (t.hp <= 0) {
            gameGrid.cells[t.col][t.row].hasTower = false; 
            if (selectedTower === t) { selectedTower = null; updateUpgradeUI(); }
            towers.splice(i, 1); 
            pathfinder.calculateFields();
        } else { t.update(dt); t.draw(ctx); }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        enemy.update(dt); enemy.draw(ctx);
        if (enemy.hp <= 0) {
            if (!enemy.reachedBase && enemy.role !== 'digger') {
                gold += enemy.reward; score += enemy.reward * 5;
            } else if (enemy.reachedBase) {
                let damageToBase = (enemy.role === 'siege' || enemy.role === 'digger') ? 5 : 1;
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