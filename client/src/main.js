import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import SideScene from './scenes/SideScene.js';
import SideUIScene from './scenes/SideUIScene.js';

const params = new URLSearchParams(window.location.search);

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#05070a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: params.has('debug') }, // open with ?debug to see hitboxes
  },
  input: { activePointers: 3 }, // multi-touch for the joystick + future buttons
  fps: { target: 60 },
  // Game scenes must come before their UI scenes so the HUD draws on top.
  // Side view is the default; ?view=top opens the older top-down map.
  scene: [BootScene, MenuScene, SideScene, SideUIScene, GameScene, UIScene],
};

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
boot();
