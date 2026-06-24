// ==========================================
// 1. НАСТРОЙКИ СЕТКИ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const COLS = 30;
const ROWS = 30;
let tileSize = 0;
let offsetX = 0;
let offsetY = 0;

const mouse = { x: -1, y: -1, col: -1, row: -1 };

// Игровое состояние
const enemies = [];
const towers = [];
let gold = 150;
let lives = 20;
let score = 0;
let isGameOver = false;
const TOWER_COST = 30;

// База данных врагов (добавлены Осадная башня и Землекоп)
const ENEMY_STATS = {
    Knight: { hp: 15, speed: 0.5, reward: 10, color: '#bdc3c7', radius: 0.3, role: 'basic' },
    Mage:   { hp: 10, speed: 1.0, reward: 20, color: '#9b59b6', radius: 0.25, role: 'basic' },
    Siege:  { hp: 80, speed: 0.3, reward: 100, color: '#c0392b', radius: 0.45, role: 'siege', damage: 10, range: 4, cooldown: 2.0 },
    Digger: { hp: 5,  speed: 0.8, reward: 50, color: '#f39c12', radius: 0.2, role: 'digger' } // Идет напролом
};

function updateUI() {
    document.getElementById('ui-lives').innerText = lives;
    document.getElementById('ui-gold').innerText = gold;
    document.getElementById('ui-score').innerText = score;
}

// ==========================================
// 2. КЛАССЫ СУЩНОСТЕЙ
// ==========================================
class Enemy {
    constructor(type) {
        this.type = type;
        const stats = ENEMY_STATS[type];
        
        this.maxHp = stats.hp;
        this.hp = this.maxHp;
        this.speed = stats.speed;
        this.reward = stats.reward;
        this.color = stats.color;
        this.radius = stats.radius;
        
        // Специфичные статы для осадной башни
        this.role = stats.role;
        this.damage = stats.damage || 0;
        this.range = (stats.range || 0) * tileSize;
        this.cooldown = stats.cooldown || 0;
        this.timeSinceAttack = 0;
        this.targetTower = null;
        this.isFiring = false;

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

        // Логика Осадной Башни (Siege)
        if (this.role === 'siege') {
            this.timeSinceAttack += dt;
            
            // Ищем живую башню
            if (!this.targetTower || this.targetTower.hp <= 0) {
                this.targetTower = null;
                for (let t of towers) {
                    const dx = this.x - t.x;
                    const dy = this.y - t.y;
                    if (Math.sqrt(dx*dx + dy*dy) <= this.range) {
                        this.targetTower = t;
                        break;
                    }
                }
            }

            // Если нашли башню - стоим и стреляем
            if (this.targetTower) {
                if (this.timeSinceAttack >= this.cooldown) {
                    this.targetTower.hp -= this.damage;
                    this.timeSinceAttack = 0;
                    this.isFiring = true;
                }
                return; // Прерываем движение!
            }
        }

        // Движение
        const speedPixels = this.speed * tileSize * dt;
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= speedPixels) {
            this.x = this.targetX;
            this.y = this.targetY;

            this.col = Math.floor((this.x - offsetX) / tileSize);
            this.row = Math.floor((this.y - offsetY) / tileSize);

            const currentTile = gameGrid.cells[this.col][this.row];

            if (currentTile.type === 'base') {
                this.hp = 0;
                this.reachedBase = true;
                return;
            }

            // Логика Землекопа (Digger) - подрыв башни
            if (this.role === 'digger' && currentTile.hasTower) {
                let towerObj = towers.find(t => t.col === this.col && t.row === this.row);
                if (towerObj) towerObj.hp -= 999; // Мгновенно ломает башню
                this.hp = 0; // И умирает сам
                return;
            }

            // Выбор вектора (Землекоп использует скрытое прямое поле)
            let vectorToUse = this.role === 'digger' ? currentTile.diggerVector : currentTile.vector;

            if (vectorToUse) {
                this.targetX = offsetX + (this.col + vectorToUse.x) * tileSize + tileSize / 2;
                this.targetY = offsetY + (this.row + vectorToUse.y) * tileSize + tileSize / 2;
            }
        } else {
            this.x += (dx / distance) * speedPixels;
            this.y += (dy / distance) * speedPixels;
        }
    }

    draw(context) {
        context.beginPath();
        context.arc(this.x, this.y, tileSize * this.radius, 0, Math.PI * 2);
        context.fillStyle = this.color;
        context.fill();
        context.strokeStyle = '#2c3e50';
        context.lineWidth = 2;
        context.stroke();

        // ХП Бар
        const hpBarWidth = tileSize * 0.6;
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        context.fillStyle = '#e74c3c';
        context.fillRect(this.x - hpBarWidth / 2, this.y - tileSize * 0.5, hpBarWidth, 4);
        context.fillStyle = '#2ecc71';
        context.fillRect(this.x - hpBarWidth / 2, this.y - tileSize * 0.5, hpBarWidth * hpPercent, 4);

        // Лазер Осадной башни
        if (this.isFiring && this.targetTower) {
            context.beginPath();
            context.moveTo(this.x, this.y);
            context.lineTo(this.targetTower.x, this.targetTower.y);
            context.strokeStyle = '#c0392b'; // Красный лазер
            context.lineWidth = 4;
            context.stroke();
        }
    }
}

class Tower {
    constructor(col, row) {
        this.col = col;
        this.row = row;
        this.x = offsetX + col * tileSize + tileSize / 2;
        this.y = offsetY + row * tileSize + tileSize / 2;

        // Новое: Здоровье башни
        this.maxHp = 50;
        this.hp = this.maxHp;

        this.range = 3.5 * tileSize; 
        this.damage = 3;
        this.cooldown = 0.8; 
        this.timeSinceLastFire = 0;
        
        this.target = null;
        this.isFiring = false; 
    }

    update(dt) {
        this.timeSinceLastFire += dt;
        this.isFiring = false;

        if (this.target && (this.target.hp <= 0 || this.getDistance(this.target) > this.range)) {
            this.target = null;
        }

        if (!this.target) {
            for (let enemy of enemies) {
                if (this.getDistance(enemy) <= this.range) {
                    this.target = enemy;
                    break;
                }
            }
        }

        if (this.target && this.timeSinceLastFire >= this.cooldown) {
            this.target.hp -= this.damage;
            this.timeSinceLastFire = 0;
            this.isFiring = true; 
        }
    }

    getDistance(enemy) {
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    draw(context) {
        context.fillStyle = '#3498db';
        context.fillRect(this.x - tileSize * 0.3, this.y - tileSize * 0.3, tileSize * 0.6, tileSize * 0.6);
        
        // Полоска здоровья башни
        if (this.hp < this.maxHp) {
            const hpPercent = Math.max(0, this.hp / this.maxHp);
            context.fillStyle = 'red';
            context.fillRect(this.x - tileSize * 0.3, this.y + tileSize * 0.35, tileSize * 0.6, 4);
            context.fillStyle = '#2ecc71';
            context.fillRect(this.x - tileSize * 0.3, this.y + tileSize * 0.35, tileSize * 0.6 * hpPercent, 4);
        }

        if (this.isFiring && this.target) {
            context.beginPath();
            context.moveTo(this.x, this.y);
            context.lineTo(this.target.x, this.target.y);
            context.strokeStyle = '#f1c40f';
            context.lineWidth = 3;
            context.stroke();
        }
    }
}

// ==========================================
// 3. СЕТКА, ЛАНДШАФТ И ПУТИ
// ==========================================
class Tile {
    constructor(col, row) {
        this.col = col;
        this.row = row;
        
        this.type = 'grass'; // 'grass', 'road', 'rock', 'spawn', 'base'
        this.isBuildable = true;
        this.hasTower = false;
        
        this.cost = 3; // По траве идти тяжело
        this.distance = Infinity;
        this.vector = null;
        this.diggerVector = null; // Скрытый путь для Землекопа
    }

    draw(context) {
        const x = offsetX + this.col * tileSize;
        const y = offsetY + this.row * tileSize;

        context.lineWidth = 1;
        context.strokeStyle = 'rgba(255, 255, 255, 0.05)';

        // Визуализация ландшафта
        if (this.type === 'spawn') context.fillStyle = '#ff4757';
        else if (this.type === 'base') context.fillStyle = '#2ed573';
        else if (this.type === 'road') context.fillStyle = '#34495e'; // Дорога
        else if (this.type === 'rock') context.fillStyle = '#2c3e50'; // Горы
        else context.fillStyle = '#1e272e'; // Трава (Grass)

        context.fillRect(x, y, tileSize, tileSize);
        context.strokeRect(x, y, tileSize, tileSize);

        if (this.hasTower) {
            context.fillStyle = '#747d8c'; // Серый фундамент под башней
            context.fillRect(x, y, tileSize, tileSize);
        }

        // Подсветка ховера
        if (mouse.col === this.col && mouse.row === this.row) {
            context.fillStyle = 'rgba(255, 255, 255, 0.15)';
            context.fillRect(x, y, tileSize, tileSize);
            
            if (this.isBuildable && !this.hasTower) {
                context.strokeStyle = '#70a1ff';
                context.lineWidth = 2;
                context.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
            }
        }
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
                const tile = new Tile(c, r);
                
                // --- ГЕНЕРАЦИЯ ЛАНДШАФТА ---
                // 1. Главная дорога
                if (r === 14 || r === 15) {
                    tile.type = 'road';
                    tile.cost = 1; // По дороге идти легко
                    tile.isBuildable = false;
                }
                // 2. Второстепенные пути
                if (c === 10 && r > 5 && r < 25) { tile.type = 'road'; tile.cost = 1; tile.isBuildable = false; }
                if (c === 20 && r > 5 && r < 25) { tile.type = 'road'; tile.cost = 1; tile.isBuildable = false; }

                // 3. Непроходимые препятствия (Горы)
                if ((c > 3 && c < 7 && r < 10) || (c > 23 && c < 27 && r > 20)) {
                    tile.type = 'rock';
                    tile.cost = Infinity;
                    tile.isBuildable = false;
                }

                if (c === 0 && r === 15) tile.type = 'spawn';
                if (c === COLS - 1 && r === 15) tile.type = 'base';

                this.cells[c][r] = tile;
            }
        }
    }

    draw(context) {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                this.cells[c][r].draw(context);
            }
        }
    }
}

class Pathfinder {
    constructor(grid) {
        this.grid = grid;
        this.spawnTile = grid.cells[0][15];
        this.baseTile = grid.cells[COLS - 1][15];
    }

    calculateFields() {
        this.calculateFlowField(false); // Для обычных врагов
        this.calculateFlowField(true);  // Для Землекопа (игнорирует башни)
    }

    calculateFlowField(isForDigger) {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                if (isForDigger) {
                    // Землекоп не записывает дистанцию, только вектор
                } else {
                    this.grid.cells[c][r].distance = Infinity;
                    this.grid.cells[c][r].vector = null;
                }
            }
        }

        // Временное хранилище дистанций для Землекопа
        let diggerDistances = Array(COLS).fill().map(() => Array(ROWS).fill(Infinity));
        
        if (isForDigger) diggerDistances[this.baseTile.col][this.baseTile.row] = 0;
        else this.baseTile.distance = 0;

        let openSet = [this.baseTile];

        while (openSet.length > 0) {
            openSet.sort((a, b) => {
                let distA = isForDigger ? diggerDistances[a.col][a.row] : a.distance;
                let distB = isForDigger ? diggerDistances[b.col][b.row] : b.distance;
                return distA - distB;
            });
            let current = openSet.shift();
            let currentDist = isForDigger ? diggerDistances[current.col][current.row] : current.distance;

            let neighbors = this.getNeighbors(current);
            for (let n of neighbors) {
                // Землекоп игнорирует башни, остальные - нет.
                if (!isForDigger && n.hasTower) continue;
                if (n.type === 'rock') continue; // Горы не пробить даже землекопом

                let newDist = currentDist + n.cost;
                let nDist = isForDigger ? diggerDistances[n.col][n.row] : n.distance;

                if (newDist < nDist) {
                    if (isForDigger) diggerDistances[n.col][n.row] = newDist;
                    else n.distance = newDist;
                    
                    if (!openSet.includes(n)) openSet.push(n);
                }
            }
        }

        // Генерация векторов
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                let tile = this.grid.cells[c][r];
                if (tile === this.baseTile || tile.type === 'rock') continue;
                if (!isForDigger && tile.hasTower) continue;

                let minNeighbor = null;
                let minDist = Infinity;

                let neighbors = this.getNeighbors(tile);
                for (let n of neighbors) {
                    if (!isForDigger && n.hasTower) continue;
                    if (n.type === 'rock') continue;

                    let nDist = isForDigger ? diggerDistances[n.col][n.row] : n.distance;
                    if (nDist < minDist) {
                        minDist = nDist;
                        minNeighbor = n;
                    }
                }

                if (minNeighbor) {
                    let vec = { x: minNeighbor.col - tile.col, y: minNeighbor.row - tile.row };
                    if (isForDigger) tile.diggerVector = vec;
                    else tile.vector = vec;
                }
            }
        }
    }

    getNeighbors(tile) {
        let neighbors = [];
        const dirs = [ {x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0} ];
        for (let d of dirs) {
            let nc = tile.col + d.x;
            let nr = tile.row + d.y;
            if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
                neighbors.push(this.grid.cells[nc][nr]);
            }
        }
        return neighbors;
    }
}

// ==========================================
// 4. МЕНЕДЖЕР АВТО-ВОЛН
// ==========================================
class WaveManager {
    constructor() {
        this.waveNumber = 0;
        this.enemiesToSpawn = [];
        this.spawnTimer = 0;
        this.isSpawning = false;
        
        this.waveCooldown = 5; // Первая волна через 5 секунд
        this.uiTimer = document.getElementById('ui-timer');
    }

    startNextWave() {
        this.waveNumber++;
        document.getElementById('ui-wave').innerText = this.waveNumber;
        this.isSpawning = true;

        let knightCount = 3 + this.waveNumber * 2;
        let mageCount = this.waveNumber > 2 ? Math.floor(this.waveNumber * 1.5) : 0;
        
        for(let i=0; i<knightCount; i++) this.enemiesToSpawn.push('Knight');
        for(let i=0; i<mageCount; i++) this.enemiesToSpawn.push('Mage');
        
        // Спавн Осадной Башни (Начиная с 4 волны)
        if (this.waveNumber >= 4) {
            for(let i=0; i<Math.floor(this.waveNumber / 3); i++) this.enemiesToSpawn.push('Siege');
        }
        
        // Спавн Землекопа (Каждую 3 волну)
        if (this.waveNumber > 1 && this.waveNumber % 3 === 0) {
            this.enemiesToSpawn.push('Digger');
            this.enemiesToSpawn.push('Digger');
        }

        this.enemiesToSpawn.sort(() => Math.random() - 0.5);
    }

    update(dt) {
        if (this.isSpawning) {
            this.uiTimer.innerText = "В бою!";
            this.spawnTimer += dt;
            const spawnInterval = Math.max(0.4, 1.5 - (this.waveNumber * 0.05));

            if (this.spawnTimer >= spawnInterval && this.enemiesToSpawn.length > 0) {
                enemies.push(new Enemy(this.enemiesToSpawn.pop()));
                this.spawnTimer = 0;
            }

            if (this.enemiesToSpawn.length === 0 && enemies.length === 0) {
                this.isSpawning = false;
                this.waveCooldown = 15; // 15 секунд передышки
            }
        } else {
            this.waveCooldown -= dt;
            this.uiTimer.innerText = Math.ceil(this.waveCooldown);
            if (this.waveCooldown <= 0) {
                this.startNextWave();
            }
        }
    }
}

const gameGrid = new Grid();
const pathfinder = new Pathfinder(gameGrid);
const waveManager = new WaveManager();

// ==========================================
// 5. ИНИЦИАЛИЗАЦИЯ И СОБЫТИЯ
// ==========================================
function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);
    const padding = 40;
    tileSize = Math.floor(Math.min((window.innerWidth - padding * 2) / COLS, (window.innerHeight - padding * 2) / ROWS));
    offsetX = Math.floor((window.innerWidth - tileSize * COLS) / 2);
    offsetY = Math.floor((window.innerHeight - tileSize * ROWS) / 2);
}

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const col = Math.floor((mouse.x - offsetX) / tileSize);
    const row = Math.floor((mouse.y - offsetY) / tileSize);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
        mouse.col = col; mouse.row = row;
    } else {
        mouse.col = -1; mouse.row = -1;
    }
});

window.addEventListener('click', () => {
    if (mouse.col !== -1 && mouse.row !== -1 && !isGameOver) {
        const tile = gameGrid.cells[mouse.col][mouse.row];
        
        if (tile.isBuildable && !tile.hasTower) {
            if (gold >= TOWER_COST) {
                tile.hasTower = true; 
                pathfinder.calculateFields();
                
                if (pathfinder.spawnTile.distance === Infinity) {
                    tile.hasTower = false; 
                    pathfinder.calculateFields();
                } else {
                    gold -= TOWER_COST; 
                    towers.push(new Tower(mouse.col, mouse.row));
                    updateUI();
                }
            }
        }
    }
});

window.addEventListener('resize', setupCanvas);

// ==========================================
// 6. ИГРОВОЙ ЦИКЛ
// ==========================================
let lastTime = 0;
function gameLoop(timestamp) {
    if (isGameOver) return;
    
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    gameGrid.draw(ctx);

    // Обновление башен (с проверкой на уничтожение)
    for (let i = towers.length - 1; i >= 0; i--) {
        let t = towers[i];
        if (t.hp <= 0) {
            // Башня уничтожена Землекопом или Осадной Башней!
            gameGrid.cells[t.col][t.row].hasTower = false;
            towers.splice(i, 1);
            pathfinder.calculateFields(); // Пересчитываем пути!
        } else {
            t.update(dt);
            t.draw(ctx);
        }
    }

    // Обновление врагов
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        enemy.update(dt);
        enemy.draw(ctx);

        if (enemy.hp <= 0) {
            if (!enemy.reachedBase && enemy.role !== 'digger') {
                gold += enemy.reward;
                const pathLength = pathfinder.spawnTile.distance;
                score += Math.floor(enemy.reward * (pathLength * 0.1));
            } else if (enemy.reachedBase) {
                lives--;
                if (lives <= 0) {
                    isGameOver = true;
                    document.getElementById('game-over-screen').classList.remove('hidden');
                    document.getElementById('final-score').innerText = score;
                }
            }
            enemies.splice(i, 1);
            updateUI();
        }
    }

    waveManager.update(dt);
    requestAnimationFrame(gameLoop);
}

setupCanvas();
pathfinder.calculateFields();
updateUI();
requestAnimationFrame(gameLoop);