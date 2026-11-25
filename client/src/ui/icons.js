// Small HUD icons, drawn in code once (white, so they can be tinted). Key: `ico-<name>`.
const S = 48; // canvas size (drawn at 2x; shown at about 22–28 px)

const DRAW = {
  walk(c) {
    chevron(c, 12, 24, -1);
    chevron(c, 36, 24, 1);
    c.beginPath();
    c.moveTo(16, 24);
    c.lineTo(32, 24);
    c.stroke();
  },
  climb(c) {
    c.beginPath();
    c.moveTo(12, 6);
    c.lineTo(12, 42);
    c.moveTo(26, 6);
    c.lineTo(26, 42);
    for (const y of [13, 24, 35]) {
      c.moveTo(12, y);
      c.lineTo(26, y);
    }
    c.stroke();
    c.beginPath();
    c.moveTo(38, 10);
    c.lineTo(38, 38);
    c.stroke();
    tri(c, 38, 6, 6, -1);
    tri(c, 38, 42, 6, 1);
  },
  map(c) {
    c.beginPath();
    c.moveTo(6, 12);
    c.lineTo(18, 7);
    c.lineTo(30, 12);
    c.lineTo(42, 7);
    c.lineTo(42, 36);
    c.lineTo(30, 41);
    c.lineTo(18, 36);
    c.lineTo(6, 41);
    c.closePath();
    c.moveTo(18, 7);
    c.lineTo(18, 36);
    c.moveTo(30, 12);
    c.lineTo(30, 41);
    c.stroke();
  },
  bolt(c) {
    c.beginPath();
    c.moveTo(28, 4);
    c.lineTo(10, 27);
    c.lineTo(22, 27);
    c.lineTo(18, 44);
    c.lineTo(38, 19);
    c.lineTo(25, 19);
    c.closePath();
    c.fill();
  },
  exit(c) {
    c.beginPath();
    c.moveTo(26, 8);
    c.lineTo(10, 8);
    c.lineTo(10, 40);
    c.lineTo(26, 40);
    c.stroke();
    c.beginPath();
    c.moveTo(18, 24);
    c.lineTo(38, 24);
    c.stroke();
    chevron(c, 38, 24, 1);
  },
  dark(c) {
    c.beginPath();
    c.arc(24, 19, 11, Math.PI * 0.8, Math.PI * 2.2);
    c.lineTo(29, 34);
    c.lineTo(19, 34);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(19, 40);
    c.lineTo(29, 40);
    c.moveTo(8, 6);
    c.lineTo(40, 42);
    c.stroke();
  },
  lock(c) {
    c.beginPath();
    c.roundRect(11, 21, 26, 20, 4);
    c.fill();
    c.beginPath();
    c.arc(24, 20, 8, Math.PI, 0);
    c.lineTo(32, 22);
    c.moveTo(16, 22);
    c.lineTo(16, 20);
    c.stroke();
  },
  hello(c) {
    c.beginPath();
    c.roundRect(14, 22, 20, 20, 8);
    c.fill();
    for (const [x, top] of [[16, 10], [21, 6], [26, 7], [31, 11]]) {
      c.beginPath();
      c.moveTo(x, 26);
      c.lineTo(x, top);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(14, 32);
    c.lineTo(8, 24);
    c.stroke();
  },
  follow(c) {
    chevron(c, 20, 24, 1);
    chevron(c, 32, 24, 1);
  },
  sus(c) {
    c.beginPath();
    c.moveTo(4, 24);
    c.quadraticCurveTo(24, 6, 44, 24);
    c.quadraticCurveTo(24, 42, 4, 24);
    c.stroke();
    c.beginPath();
    c.arc(24, 24, 6, 0, Math.PI * 2);
    c.fill();
  },
  help(c) {
    c.beginPath();
    c.moveTo(24, 6);
    c.lineTo(43, 40);
    c.lineTo(5, 40);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(24, 17);
    c.lineTo(24, 29);
    c.stroke();
    c.beginPath();
    c.arc(24, 35, 2.4, 0, Math.PI * 2);
    c.fill();
  },
  part(c) {
    c.beginPath();
    c.roundRect(12, 10, 24, 32, 4);
    c.stroke();
    c.fillRect(18, 5, 12, 5);
    c.beginPath();
    c.moveTo(26, 16);
    c.lineTo(19, 27);
    c.lineTo(25, 27);
    c.lineTo(22, 36);
    c.lineTo(30, 24);
    c.lineTo(24, 24);
    c.closePath();
    c.fill();
  },
};

function chevron(c, x, y, dir) {
  c.beginPath();
  c.moveTo(x - dir * 8, y - 9);
  c.lineTo(x, y);
  c.lineTo(x - dir * 8, y + 9);
  c.stroke();
}

function tri(c, x, y, r, dir) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - r, y - dir * r); // apex at (x, y), pointing up (dir -1) or down (dir 1)
  c.lineTo(x + r, y - dir * r);
  c.closePath();
  c.fill();
}

export const ICONS = Object.keys(DRAW);

/** Build every icon texture (once). */
export function createIcons(scene) {
  for (const name of ICONS) {
    const key = `ico-${name}`;
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, S, S);
    const c = tex.getContext();
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    c.lineWidth = 4.5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    DRAW[name](c);
    tex.refresh();
  }
}

/** An icon image `size` px tall. */
export function icon(scene, x, y, name, size = 24, tint = 0xffffff) {
  createIcons(scene);
  return scene.add.image(x, y, `ico-${name}`).setDisplaySize(size, size).setTint(tint);
}
