/**
 * SOUNDS.JS — звуковая система игры Smart TD
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
    let sound = this.pool.find(a => a.paused || a.ended);
    
    if (!sound) {
      sound = this.pool[0].cloneNode(true);
      sound.volume = this.volumeLevel;
      this.pool.push(sound);
    }
    
    try {
      sound.currentTime = 0;
    } catch (e) {}

    const promise = sound.play();
    if (promise !== undefined) {
      promise.catch(err => {
        // Ошибка блокировки автовоспроизведения игнорируется
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

// Музыкальный эмбиент (Howler)
const MUSIC = new Howl({
  src: ['assets/sfx/ambient_pregame.mp3'], 
  volume: 0.25,
  loop: true,
  onloaderror: (id, err) => console.warn(`Музыка не загружена`, err),
});

let soundEnabled = true;
let bgmStarted = false;

function playSfx(name) {
  if (soundEnabled && SFX[name]) {
    SFX[name].play();
  }
}

function initAudioEngine() {
    if (bgmStarted || !soundEnabled) return;
    bgmStarted = true;

    if (Howler.ctx && Howler.ctx.state === "suspended") {
        Howler.ctx.resume();
    }

    MUSIC.play();

    ['click', 'touchstart', 'keydown'].forEach(evt => {
        window.removeEventListener(evt, initAudioEngine);
    });
}

// Глобальная функция мута
window.toggleSound = function () {
  soundEnabled = !soundEnabled;
  Howler.mute(!soundEnabled);
  Object.values(SFX).forEach(pool => pool.setMute(!soundEnabled));

  const btn = document.getElementById("btn-mute");
  if (btn) btn.innerText = soundEnabled ? "🔊" : "🔇";
};

window.playSfx = playSfx;
window.MUSIC = MUSIC;

['click', 'touchstart', 'keydown'].forEach(evt => {
    window.addEventListener(evt, initAudioEngine, { once: true });
});