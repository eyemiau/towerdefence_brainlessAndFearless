/**
 * SOUNDS.JS — звуковая система игры Smart TD
 * Подключается ПЕРЕД main.js, использует глобальный Howler
 */

function safeHowl(src, volume, loop = false) {
  return new Howl({
    src: [src],
    volume,
    loop,
    onloaderror: (id, err) => console.warn(`Звук не загружен: ${src}`, err),
  });
}

const SFX = {
  shootBasic: safeHowl("assets/sfx/shoot_basic.mp3", 0.4),
  shootRapid: safeHowl("assets/sfx/shoot_rapid.mp3", 0.2),
  shootSniper: safeHowl("assets/sfx/shoot_sniper.mp3", 0.5),
  enemyHit: safeHowl("assets/sfx/enemy_hit.mp3", 0.3),
  enemyDeath: safeHowl("assets/sfx/enemy_death.mp3", 0.5),
  towerPlace: safeHowl("assets/sfx/tower_place.mp3", 0.6),
  towerUpgrade: safeHowl("assets/sfx/tower_upgrade.mp3", 0.6),
  towerSell: safeHowl("assets/sfx/tower_sell.mp3", 0.5),
  waveStart: safeHowl("assets/sfx/wave_start.mp3", 0.7),
  lifeLost: safeHowl("assets/sfx/life_lost.mp3", 0.6),
  gameOver: safeHowl("assets/sfx/game_over.mp3", 0.8),
};

const MUSIC = safeHowl("assets/sfx/music_loop.mp3", 0.25, true);

let soundEnabled = true;
let audioUnlocked = false;

function playSfx(name) {
  if (soundEnabled && SFX[name]) SFX[name].play();
}

// ==========================================
// РАЗБЛОКИРОВКА АУДИО (Autoplay Policy браузеров)
// Браузеры блокируют звук до первого взаимодействия пользователя со страницей.
// Эта функция "прогревает" AudioContext и все звуки сразу при первом клике/тапе.
// ==========================================
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // Явно возобновляем AudioContext, если он приостановлен браузером
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume();
  }

  // "Прогреваем" каждый SFX нулевой громкостью — снимает блокировку
  // автовоспроизведения сразу для всех звуков, а не только для музыки
  Object.values(SFX).forEach((sound) => {
    const originalVolume = sound.volume();
    sound.volume(0.0001);
    const id = sound.play();
    sound.once("play", () => {
      sound.stop(id);
      sound.volume(originalVolume);
    });
  });

  MUSIC.play();
}

window.toggleSound = function () {
  soundEnabled = !soundEnabled;
  Howler.mute(!soundEnabled);
  const btn = document.getElementById("btn-mute");
  if (btn) btn.innerText = soundEnabled ? "🔊" : "🔇";
};

// Явно привязываем к window — main.js проверяет window.playSfx / window.MUSIC
window.playSfx = playSfx;
window.MUSIC = MUSIC;

// Слушаем несколько типов событий — гарантирует срабатывание разблокировки
// при первом же реальном взаимодействии, каким бы оно ни было (клик, тап, клавиша)
["click", "pointerdown", "touchstart", "keydown"].forEach((evt) => {
  window.addEventListener(evt, unlockAudio, { once: true });
});
