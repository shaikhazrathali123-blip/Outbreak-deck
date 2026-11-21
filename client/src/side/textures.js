// Small generated textures used for lighting and effects.

function canvas(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  draw(t.getContext(), w, h);
  t.refresh();
}

export function createTextures(scene) {
  // round soft glow (neon, screens, reflections)
  canvas(scene, 'glow', 256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
  // ceiling light wash: bright at the top centre, fading down and out
  canvas(scene, 'wash', 256, 256, (c) => {
    c.save();
    c.scale(1, 2);
    const g = c.createRadialGradient(128, 0, 0, 128, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.restore();
  });
  // DNA hologram
  canvas(scene, 'holo', 64, 84, (c) => {
    c.strokeStyle = 'rgba(127,255,255,0.9)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(32, 74, 28, 7, 0, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(127,255,255,0.45)';
    c.beginPath();
    c.ellipse(32, 74, 19, 4.5, 0, 0, Math.PI * 2);
    c.stroke();
    for (let y = 6; y <= 64; y++) {
      const s = Math.sin(y / 7) * 12;
      c.fillStyle = 'rgba(127,255,255,0.85)';
      c.fillRect(32 + s - 1, y, 2.5, 1.2);
      c.fillStyle = 'rgba(127,255,255,0.5)';
      c.fillRect(32 - s - 1, y, 2.5, 1.2);
      if (y % 6 === 0) {
        c.fillStyle = 'rgba(127,255,255,0.3)';
        c.fillRect(Math.min(32 - s, 32 + s), y, Math.abs(2 * s), 1);
      }
    }
  });
  canvas(scene, 'rain', 2, 18, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 18);
    g.addColorStop(0, 'rgba(190,215,255,0)');
    g.addColorStop(1, 'rgba(190,215,255,0.6)');
    c.fillStyle = g;
    c.fillRect(0, 0, 1.2, 18);
  });
  canvas(scene, 'grain', 128, 128, (c) => {
    const img = c.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}
