/**
 * SOUNDS.JS — звуковая система игры Smart TD (Исправленная версия)
 */

class AudioPool {
  constructor(src, poolSize = 5, volume = 0.5) {
    this.pool = [];
    this.volumeLevel = volume;
    for (let i = 0; i < poolSize; i++) {
      let audio = new Audio(src);
      audio.volume = this.volumeLevel;
      this.pool.push(audio);
    }
  }

  play() {
    // Ищем свободный канал
    let sound = this.pool.find(a => a.paused || a.ended);
    
    // Динамически расширяем пул, если всё занято
    if (!sound) {
      sound = this.pool[0].cloneNode(true);
      sound.volume = this.volumeLevel;
      this.pool.push(sound);
    }
    
    // Защита от ошибки InvalidStateError, если файл еще не скачался
    try {
      sound.currentTime = 0;
    } catch (e) {}

    // Воспроизводим и тихо обрабатываем промис, чтобы избежать спама в консоли
    const promise = sound.play();
    if (promise !== undefined) {
      promise.catch(err => {
        // Ошибка блокировки автовоспроизведения (если клика еще не было) - это норма
      });
    }
  }

  setMute(isMuted) {
    this.pool.forEach(audio => audio.muted = isMuted);
  }
}

// Пул звуковых эффектов
const SFX = {
  shootBasic: new AudioPool("assets/sfx/shoot_basic.mp3", 10, 0.4),
  shootRapid: new AudioPool("assets/sfx/shoot_rapid.mp3", 15, 0.2),
  shootSniper: new AudioPool("assets/sfx/shoot_sniper.mp3", 5, 0.5),
  enemyHit: new AudioPool("assets/sfx/enemy_hit.mp3", 10, 0.3),
  enemyDeath: new AudioPool("assets/sfx/enemy_death.mp3", 5, 0.5),
  towerPlace: new AudioPool("assets/sfx/tower_place.mp3", 3, 0.6),
  towerUpgrade: new AudioPool("assets/sfx/tower_upgrade.mp3", 3, 0.6),
  towerSell: new AudioPool("assets/sfx/tower_sell.mp3", 3, 0.5),
  waveStart: new AudioPool("assets/sfx/wave_start.mp3", 2, 0.7),
  lifeLost: new AudioPool("assets/sfx/life_lost.mp3", 3, 0.6),
  gameOver: new AudioPool("assets/sfx/game_over.mp3", 2, 0.8),
};

// Музыкальный эмбиент (Howler) - сюда можно вставить трек в стиле Dota 2
const MUSIC = new Howl({
  src: ['assets/sfx/ambient_pregame.mp3'], // Убедись, что файл существует по этому пути
  volume: 0.15,
  loop: true,
  onloaderror: (id, err) => console.warn(`Музыка не загружена`, err),
});

let soundEnabled = true;
let audioUnlocked = false;

function playSfx(name) {
  if (soundEnabled && SFX[name]) {
    SFX[name].play();
  }
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // Безопасно возобновляем только контекст Web Audio API
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume();
  }

  if (soundEnabled) {
    MUSIC.play();
  }
}

// Глобальная функция мута (привязывается к кнопке в index.html)
window.toggleSound = function () {
  soundEnabled = !soundEnabled;
  
  // Мьютим Howler (музыку)
  Howler.mute(!soundEnabled);
  
  // Мьютим наш кастомный пул эффектов
  Object.values(SFX).forEach(pool => pool.setMute(!soundEnabled));

  const btn = document.getElementById("btn-mute");
  if (btn) btn.innerText = soundEnabled ? "🔊" : "🔇";
};

// Пробрасываем функции в глобальную область видимости для main.js
window.playSfx = playSfx;
window.MUSIC = MUSIC;

// Ожидаем первого взаимодействия для разблокировки музыки
["click", "pointerdown", "touchstart", "keydown"].forEach((evt) => {
  window.addEventListener(evt, unlockAudio, { once: true });
});