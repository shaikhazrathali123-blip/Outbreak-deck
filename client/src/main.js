import Phaser from 'phaser';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import SideScene from './scenes/SideScene.js';
import SideUIScene from './scenes/SideUIScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#04050a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 3 }, // multi-touch for the joystick + future buttons
  fps: { target: 60 },
  // The game scene must come before its UI scene so the HUD draws on top.
  scene: [BootScene, MenuScene, SideScene, SideUIScene],
};

// The building art is painted once at startup, so wait for the font first.
const fontsReady = Promise.all(
  ['500 16px Rajdhani', '600 16px Rajdhani', '700 16px Rajdhani'].map((f) => document.fonts.load(f)),
).catch(() => {});

// WebGL crashes on a 0x0 canvas, which happens if the page starts hidden or
// mid-rotation on a phone. Wait until the window has a real size.
function boot() {
  if (window.innerWidth < 1 || window.innerHeight < 1) {
    requestAnimationFrame(boot);
    return;
  }
  config.scale.width = window.innerWidth;
  config.scale.height = window.innerHeight;
  const game = new Phaser.Game(config);
  if (import.meta.env.DEV) window.__game = game; // handy for debugging in the console
}
fontsReady.finally(boot);
