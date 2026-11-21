// Furniture ("props", solid) and floor decorations ("decor", walk-over).
// Each entry: { w, h } in tiles and draw(r, pw, ph, rng) on a transparent canvas.
import {
  hex, shade, alpha, mix, disc, ellipse, ring, line, vgrad, roundRect, shadow, box3d, hazard,
  WHITE, BLACK,
} from './raster.mjs';

const STRIPES = (a = 255) => (ang) =>
  Math.floor((ang + Math.PI) / (Math.PI / 10)) % 2 ? hex('#d9b526', a) : hex('#141414', a);

function screenLines(r, x, y, w, h, color, rng) {
  r.rect(x, y, w, h, mix(hex('#05070a'), hex(color), 0.22));
  for (let yy = y + 2; yy < y + h - 1; yy += 2) r.rect(x + 1, yy, 2 + Math.floor(rng() * (w - 3)), 1, alpha(hex(color), 210));
}

function leds(r, x, y, w, rng) {
  const cols = ['#3ee67a', '#3e8bff', '#e6b23e', '#3ee67a', '#2fd2e0'];
  for (let xx = 0; xx < w; xx += 3) if (rng() < 0.7) r.rect(x + xx, y, 1, 1, hex(cols[Math.floor(rng() * cols.length)]));
}

export const PROPS = {
  crate: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 4, 5, 24, 24);
      box3d(r, 4, 4, 24, 24, 8, { top: '#80592f', front: '#5c3d1d', outline: '#24160a' });
      r.rect(4, 9, 24, 1, hex('#9c7240'));
      r.rect(4, 14, 24, 1, hex('#6a4823'));
      line(r, 5, 5, 26, 18, hex('#5c3d1d'));
      r.rect(13, 22, 6, 3, hex('#e8d9b0', 160)); // stencil label
    },
  },
  crates: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 3, 12, 15, 16);
      box3d(r, 3, 12, 15, 16, 6, { top: '#8a6a3a', front: '#5c4422', outline: '#24160a' });
      shadow(r, 16, 4, 13, 13);
      box3d(r, 16, 4, 13, 13, 5, { top: '#6f7d5a', front: '#4a5638', outline: '#141a0c' });
      box3d(r, 18, 18, 11, 10, 4, { top: '#7a5530', front: '#553a1c', outline: '#24160a' });
    },
  },
  barrel: {
    w: 1, h: 1,
    draw(r) {
      ellipse(r, 17, 28, 11, 3.5, BLACK(90));
      r.rect(7, 10, 18, 17, hex('#1a200a'));
      vgrad(r, 8, 10, 16, 17, hex('#5f7820'), hex('#3a4a12'));
      r.rect(10, 10, 3, 17, hex('#7d9a2e'));
      r.rect(8, 15, 16, 1, hex('#2b330d'));
      r.rect(8, 21, 16, 1, hex('#2b330d'));
      ellipse(r, 16, 10, 8.5, 4, hex('#1a200a'));
      ellipse(r, 16, 10, 7.5, 3.2, hex('#7d9628'));
      disc(r, 16, 10, 2.2, hex('#c6f03a'));
    },
  },
  shelf: {
    w: 2, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 3, 60, 27);
      box3d(r, 2, 3, 60, 27, 7, { top: '#3d4556', front: '#272d39' });
      const colors = ['#8a6a3a', '#6f7d5a', '#7a5530', '#4a6a8a', '#9a4a3a', '#c9b37a'];
      for (let x = 4; x < 58;) {
        const w = 6 + Math.floor(rng() * 7);
        const h = 6 + Math.floor(rng() * 6);
        const y = 5 + Math.floor(rng() * (16 - h));
        if (x + w > 60) break;
        const c = hex(colors[Math.floor(rng() * colors.length)]);
        r.rect(x - 1, y - 1, w + 2, h + 2, hex('#0b0e13'));
        r.rect(x, y, w, h, c);
        r.rect(x, y, w, 1, shade(c, 30));
        x += w + 2;
      }
      for (let x = 6; x < 60; x += 9) r.rect(x, 24, 5, 3, hex('#3a2a18'));
    },
  },
  serverRack: {
    w: 1, h: 2,
    draw(r, pw, ph, rng) {
      shadow(r, 3, 3, 26, 58);
      box3d(r, 3, 3, 26, 58, 42, { top: '#2c3446', front: '#141a24' });
      for (let y = 22; y < 56; y += 5) {
        r.rect(5, y, 22, 4, hex('#0b0f15'));
        r.rect(5, y, 22, 1, hex('#232b3a'));
        leds(r, 7, y + 2, 12, rng);
        r.rect(21, y + 1, 4, 2, hex('#1d2430'));
      }
      r.rect(6, 6, 20, 10, hex('#1d2430'));
      for (let x = 8; x < 25; x += 3) r.rect(x, 7, 1, 8, hex('#0b0f15'));
    },
  },
  terminalDesk: {
    w: 3, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 10, 92, 20);
      box3d(r, 2, 10, 92, 20, 7, { top: '#3d4658', front: '#262d3b' });
      for (const x of [8, 37, 66]) {
        r.rect(x, 1, 22, 14, hex('#0b0e13'));
        screenLines(r, x + 2, 3, 18, 10, '#2fd2e0', rng);
        r.rect(x + 9, 15, 4, 2, hex('#0b0e13'));
        r.rect(x + 3, 18, 16, 3, hex('#6a7586'));
        for (let k = x + 4; k < x + 18; k += 2) r.px(k, 19, hex('#2b313c'));
      }
    },
  },
  tank: {
    w: 1, h: 2,
    draw(r, pw, ph, rng) {
      shadow(r, 3, 46, 26, 16);
      box3d(r, 3, 46, 26, 16, 7, { top: '#4a5468', front: '#2a3140' });
      r.rect(5, 6, 22, 44, hex('#0b1712'));
      vgrad(r, 6, 8, 20, 41, hex('#2fbf6a', 235), hex('#0d4a2a', 235));
      ellipse(r, 16, 28, 5, 9, hex('#0a2416', 210)); // something floating inside...
      disc(r, 16, 19, 3.5, hex('#0a2416', 210));
      for (let i = 0; i < 7; i++) disc(r, 8 + rng() * 16, 10 + rng() * 36, 0.6 + rng() * 1.2, hex('#b8ffd4', 180));
      r.rect(8, 9, 2, 39, WHITE(70));
      r.rect(11, 9, 1, 39, WHITE(30));
      box3d(r, 4, 1, 24, 8, 4, { top: '#5e6a7e', front: '#3a4458' });
    },
  },
  labBench: {
    w: 3, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 6, 92, 24);
      box3d(r, 2, 6, 92, 24, 7, { top: '#c4ced4', front: '#7f8c94', outline: '#2a3036' });
      const glass = ['#3ee67a', '#2fd2e0', '#ff5ad1', '#ffb347', '#3ee67a'];
      for (let i = 0; i < 7; i++) {
        const x = 8 + i * 12 + rng() * 4;
        const c = hex(glass[i % glass.length]);
        r.rect(x, 7, 6, 10, hex('#e8f4f8', 120));
        r.rect(x, 11, 6, 6, alpha(c, 220));
        r.rect(x + 1, 8, 1, 8, WHITE(160));
      }
      r.rect(70, 9, 14, 10, hex('#f4f4f0'));
      for (let y = 11; y < 18; y += 2) r.rect(72, y, 9, 1, hex('#9aa4aa'));
    },
  },
  cureMachine: {
    w: 3, h: 3,
    draw(r) {
      disc(r, 50, 52, 46, BLACK(90));
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        r.rect(48 + dx * 38 - 5, 48 + dy * 38 - 5, 10, 10, hex('#5e6a78'));
      }
      ring(r, 48, 48, 42, 46, STRIPES());
      disc(r, 48, 48, 41, hex('#0b0e13'));
      disc(r, 48, 48, 39, hex('#3a4458'));
      ring(r, 48, 48, 33, 39, (a) => (Math.floor((a + Math.PI) / (Math.PI / 8)) % 2 ? hex('#4a5672') : hex('#2c3446')));
      disc(r, 48, 48, 30, hex('#0b1712'));
      disc(r, 48, 48, 27, hex('#1f9a55'));
      disc(r, 48, 48, 21, hex('#3ee67a'));
      disc(r, 48, 48, 12, hex('#c8ffd8'));
      for (let y = -18; y <= 18; y++) {
        const s = Math.sin(y / 4.5) * 7;
        r.px(48 + s, 48 + y, hex('#0b3a20'));
        r.px(48 - s, 48 + y, hex('#0b3a20'));
        if (y % 4 === 0) line(r, 48 - s, 48 + y, 48 + s, 48 + y, hex('#0b3a20', 140));
      }
      disc(r, 40, 38, 4, WHITE(120));
    },
  },
  bed: {
    w: 1, h: 2,
    draw(r) {
      shadow(r, 3, 3, 26, 58);
      box3d(r, 3, 3, 26, 58, 6, { top: '#8a97a0', front: '#5a656e' });
      r.rect(5, 5, 22, 50, hex('#dfe9ee'));
      roundRect(r, 7, 7, 18, 10, 3, hex('#ffffff'));
      r.rect(7, 16, 18, 1, hex('#b8c8d0'));
      r.rect(5, 26, 22, 29, hex('#2f7fa0'));
      r.rect(5, 26, 22, 3, hex('#5fb0cf'));
      r.rect(5, 40, 22, 1, hex('#276c88'));
    },
  },
  medCabinet: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 4, 3, 24, 26);
      box3d(r, 4, 3, 24, 26, 14, { top: '#e4ecef', front: '#aebbc1', outline: '#2a3036' });
      r.rect(14, 5, 4, 8, hex('#2fd2c0'));
      r.rect(12, 7, 8, 4, hex('#2fd2c0'));
      r.rect(15, 18, 2, 6, hex('#6a7880'));
    },
  },
  emergencyButton: {
    w: 2, h: 2,
    draw(r) {
      disc(r, 34, 35, 30, BLACK(90));
      ring(r, 32, 32, 26, 30, STRIPES());
      disc(r, 32, 32, 25, hex('#0b0e13'));
      disc(r, 32, 32, 23, hex('#3a4458'));
      disc(r, 32, 32, 18, hex('#232a38'));
      disc(r, 32, 33, 13, hex('#5a0c0c'));
      disc(r, 32, 31, 12, hex('#e02a2a'));
      disc(r, 32, 30, 8, hex('#ff5a5a'));
      disc(r, 28, 27, 3, WHITE(170));
      ring(r, 32, 32, 19, 20, WHITE(50));
    },
  },
  bench: {
    w: 2, h: 1,
    draw(r) {
      shadow(r, 4, 10, 56, 16);
      r.rect(8, 20, 3, 8, hex('#1d2330'));
      r.rect(53, 20, 3, 8, hex('#1d2330'));
      box3d(r, 4, 9, 56, 15, 5, { top: '#5a6472', front: '#3c4450' });
      for (let x = 6; x < 58; x += 6) r.rect(x, 10, 1, 9, hex('#48515e'));
    },
  },
  planter: {
    w: 1, h: 1,
    draw(r) {
      ellipse(r, 17, 28, 10, 3, BLACK(90));
      box3d(r, 8, 16, 16, 13, 6, { top: '#5a4632', front: '#3d2f21' });
      r.rect(9, 17, 14, 4, hex('#2a1f14'));
      const leaves = [[16, 10, 7, '#246b39'], [11, 12, 5, '#2f8a4a'], [21, 12, 5, '#2f8a4a'], [16, 7, 5, '#3fae5e'], [12, 7, 3, '#3fae5e'], [20, 8, 3, '#55c873']];
      for (const [x, y, s, c] of leaves) disc(r, x, y, s, hex(c));
      disc(r, 14, 5, 1.5, WHITE(80));
    },
  },
  reactorCore: {
    w: 4, h: 4,
    draw(r) {
      disc(r, 66, 68, 62, BLACK(100));
      ring(r, 64, 64, 57, 62, STRIPES());
      disc(r, 64, 64, 56, hex('#0b0e13'));
      disc(r, 64, 64, 54, hex('#2c3240'));
      ring(r, 64, 64, 44, 54, (a) => (Math.floor((a + Math.PI) / (Math.PI / 12)) % 2 ? hex('#3a4458') : hex('#1a1f27')));
      disc(r, 64, 64, 42, hex('#140a04'));
      disc(r, 64, 64, 39, hex('#a83a00'));
      disc(r, 64, 64, 32, hex('#ff7a1a'));
      disc(r, 64, 64, 22, hex('#ffb347'));
      disc(r, 64, 64, 12, hex('#fff0c8'));
      for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        line(r, 64 - Math.cos(a) * 40, 64 - Math.sin(a) * 40, 64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, hex('#2c1408', 200), 3);
      }
      disc(r, 64, 64, 6, hex('#3a4458'));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        disc(r, 64 + Math.cos(a) * 49, 64 + Math.sin(a) * 49, 1.5, hex('#8a97a6'));
      }
    },
  },
  controlPanel: {
    w: 2, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 4, 60, 26);
      box3d(r, 2, 4, 60, 26, 9, { top: '#3a4458', front: '#232a38' });
      screenLines(r, 6, 6, 20, 10, '#ffb347', rng);
      const btn = ['#e0443e', '#3ee67a', '#e6b23e', '#3e8bff'];
      for (let i = 0; i < 8; i++) r.rect(31 + (i % 4) * 7, 7 + Math.floor(i / 4) * 6, 4, 3, hex(btn[(i * 3) % 4]));
      r.rect(6, 18, 52, 1, hex('#4a5672'));
    },
  },
  barsH: {
    w: 1, h: 1,
    draw(r) {
      r.rect(0, 24, 32, 4, BLACK(70));
      for (let x = 2; x < 32; x += 6) {
        r.rect(x, 2, 3, 24, hex('#2a3036'));
        r.rect(x, 2, 2, 24, hex('#8a97a0'));
        r.rect(x, 2, 1, 24, hex('#c4ced4'));
      }
      r.rect(0, 2, 32, 4, hex('#5a656e'));
      r.rect(0, 2, 32, 1, hex('#9aa7b0'));
      r.rect(0, 22, 32, 4, hex('#5a656e'));
    },
  },
  barsV: {
    w: 1, h: 1,
    draw(r) {
      r.rect(14, 0, 6, 32, BLACK(60));
      r.rect(12, 0, 8, 32, hex('#2a3036'));
      r.rect(13, 0, 6, 32, hex('#5a656e'));
      r.rect(13, 0, 2, 32, hex('#9aa7b0'));
      for (let y = 3; y < 32; y += 8) r.rect(11, y, 10, 2, hex('#8a97a0'));
    },
  },
  cafeTable: {
    w: 2, h: 2,
    draw(r, pw, ph, rng) {
      const chair = (x, y) => {
        r.rect(x + 1, y + 2, 12, 12, BLACK(70));
        box3d(r, x, y, 12, 12, 4, { top: '#6a4aa0', front: '#45306a' });
      };
      chair(26, 2);
      chair(26, 50);
      chair(2, 26);
      chair(50, 26);
      shadow(r, 12, 14, 40, 38);
      box3d(r, 12, 13, 40, 38, 8, { top: '#cdbfa6', front: '#8f8068', outline: '#2a241a' });
      const food = ['#e0443e', '#3ee67a', '#ffb347', '#f4f4f0'];
      for (const [x, y] of [[16, 17], [36, 17], [16, 30], [36, 30]]) {
        r.rect(x, y, 12, 9, hex('#8a97a0'));
        disc(r, x + 4, y + 4.5, 2.5, hex(food[Math.floor(rng() * 4)]));
        r.rect(x + 8, y + 2, 2, 5, hex(food[Math.floor(rng() * 4)]));
      }
    },
  },
  vending: {
    w: 1, h: 2,
    draw(r, pw, ph, rng) {
      shadow(r, 3, 4, 26, 58);
      box3d(r, 3, 4, 26, 58, 44, { top: '#2a3142', front: '#1a2030' });
      r.rect(5, 21, 17, 34, hex('#0b1a22'));
      const goods = ['#e0443e', '#3ee67a', '#ffb347', '#3e8bff', '#ff5ad1'];
      for (let y = 23; y < 52; y += 6) for (let x = 6; x < 21; x += 4) r.rect(x, y, 3, 4, hex(goods[Math.floor(rng() * 5)]));
      r.rect(5, 21, 17, 1, WHITE(90));
      r.rect(23, 21, 4, 34, hex('#ff4da6'));
      r.rect(24, 24, 2, 4, hex('#1a2030'));
      r.rect(7, 56, 13, 3, hex('#05070a'));
      r.rect(5, 7, 22, 9, hex('#ff4da6', 200));
      r.rect(7, 9, 18, 5, hex('#3a0f2a'));
    },
  },
  counter: {
    w: 4, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 6, 124, 24);
      box3d(r, 2, 6, 124, 24, 9, { top: '#a7b2ba', front: '#5e6a72' });
      for (let x = 8; x < 118; x += 22) {
        r.rect(x, 9, 16, 9, hex('#2a3036'));
        r.rect(x + 1, 10, 14, 7, hex(['#c46a2a', '#6aa84a', '#d9b526', '#a84a3a'][Math.floor(rng() * 4)]));
      }
      r.rect(4, 7, 120, 1, WHITE(120));
    },
  },
  locker: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 4, 2, 24, 28);
      box3d(r, 4, 2, 24, 28, 20, { top: '#3d5a80', front: '#2b4060' });
      for (const y of [13, 15, 17]) r.rect(9, y, 14, 1, hex('#1a2a40'));
      r.rect(21, 20, 2, 5, hex('#c4ced4'));
      r.rect(4, 2, 24, 1, hex('#6a8ab0'));
    },
  },
  supplyStation: {
    w: 2, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 4, 60, 26);
      box3d(r, 2, 4, 60, 26, 12, { top: '#3a4458', front: '#2a2410' });
      hazard(r, 3, 19, 58, 3, 200);
      screenLines(r, 8, 6, 22, 9, '#f2e14a', rng);
      r.rect(38, 7, 18, 3, hex('#0b0e13'));
      r.rect(40, 8, 14, 1, hex('#f2e14a'));
      r.rect(38, 12, 6, 3, hex('#3ee67a'));
    },
  },
  console: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 3, 4, 26, 26);
      box3d(r, 3, 4, 26, 26, 10, { top: '#3a4458', front: '#1d2330' });
      screenLines(r, 6, 6, 20, 9, '#2fd2c0', rng);
      r.rect(7, 22, 2, 2, hex('#e0443e'));
      r.rect(11, 22, 2, 2, hex('#3ee67a'));
      r.rect(15, 22, 2, 2, hex('#e6b23e'));
    },
  },
};

export const DECOR = {
  stain: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      const cx = 16, cy = 16;
      for (let i = 0; i < 7; i++) disc(r, cx + (rng() - 0.5) * 16, cy + (rng() - 0.5) * 12, 2 + rng() * 5, BLACK(18));
    },
  },
  goo: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      for (let i = 0; i < 6; i++) disc(r, 16 + (rng() - 0.5) * 14, 16 + (rng() - 0.5) * 10, 2 + rng() * 5, hex('#2fbf5a', 110));
      for (let i = 0; i < 4; i++) disc(r, 16 + (rng() - 0.5) * 8, 16 + (rng() - 0.5) * 6, 1 + rng() * 2.5, hex('#9cff7a', 170));
      for (let i = 0; i < 5; i++) disc(r, 4 + rng() * 24, 4 + rng() * 24, 0.8, hex('#9cff7a', 150));
    },
  },
  crack: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      let x = 6 + rng() * 6, y = 6 + rng() * 6, a = 0.6 + rng();
      for (let i = 0; i < 16; i++) {
        const nx = x + Math.cos(a) * 2, ny = y + Math.sin(a) * 2;
        line(r, x, y, nx, ny, BLACK(130));
        if (rng() < 0.15) line(r, nx, ny, nx + (rng() - 0.5) * 8, ny + (rng() - 0.5) * 8, BLACK(90));
        x = Math.min(30, Math.max(1, nx)); y = Math.min(30, Math.max(1, ny)); a += (rng() - 0.5) * 1.2;
      }
    },
  },
  cables: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      const cols = ['#0b0f14', '#3a1414', '#14243a'];
      for (let k = 0; k < 3; k++) {
        const off = 8 + k * 6 + rng() * 2;
        let px = 0, py = off;
        for (let x = 1; x <= 32; x++) {
          const y = off + Math.sin(x / 5 + k) * 2.5;
          line(r, px, py, x, y, hex(cols[k]), 2);
          px = x; py = y;
        }
      }
    },
  },
  papers: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      for (let i = 0; i < 3; i++) {
        const x = 4 + rng() * 16, y = 4 + rng() * 16;
        r.rect(x + 1, y + 1, 8, 10, BLACK(50));
        r.rect(x, y, 8, 10, hex('#9a9e94', 200));
        for (let ly = 2; ly < 9; ly += 2) r.rect(x + 1, y + ly, 5, 1, hex('#5a6058', 200));
      }
    },
  },
  vent: {
    w: 1, h: 1,
    draw(r) {
      r.rect(4, 4, 24, 24, hex('#0b0e13'));
      r.rect(5, 5, 22, 22, hex('#2a3140'));
      for (let y = 7; y < 26; y += 3) r.rect(6, y, 20, 2, hex('#07090c'));
      for (const [x, y] of [[5, 5], [25, 5], [5, 25], [25, 25]]) r.px(x, y, hex('#8a97a6'));
    },
  },
  drain: {
    w: 1, h: 1,
    draw(r) {
      disc(r, 16, 16, 8, hex('#0b0e13'));
      disc(r, 16, 16, 7, hex('#2a3140'));
      for (let x = 11; x < 22; x += 3) r.rect(x, 11, 1, 11, hex('#07090c'));
    },
  },
  pallet: {
    w: 1, h: 1,
    draw(r) {
      r.rect(3, 5, 26, 24, BLACK(60));
      for (let y = 4; y < 28; y += 6) r.rect(2, y, 28, 4, hex('#8a6a3a'));
      r.rect(4, 3, 3, 26, hex('#6a4a24'));
      r.rect(25, 3, 3, 26, hex('#6a4a24'));
    },
  },
  hazardH: { w: 1, h: 1, draw(r) { hazard(r, 0, 12, 32, 8, 170); } },
  hazardV: { w: 1, h: 1, draw(r) { hazard(r, 12, 0, 8, 32, 170); } },
  pad: {
    w: 1, h: 1,
    draw(r) {
      r.rect(2, 2, 28, 28, hex('#0b0e13'));
      hazard(r, 3, 3, 26, 26, 230);
      r.rect(8, 8, 16, 16, hex('#3a4458'));
      r.rect(10, 10, 12, 12, hex('#e6b23e'));
    },
  },
  emblem: {
    w: 4, h: 4,
    draw(r) {
      const teal = (a) => hex('#2fd2c0', a);
      ring(r, 64, 64, 58, 61, teal(90));
      ring(r, 64, 64, 46, 47, teal(70));
      ring(r, 64, 64, 61, 63, (a) => (Math.floor((a + Math.PI) / (Math.PI / 16)) % 2 ? teal(60) : null));
      for (let y = -34; y <= 34; y++) {
        const s = Math.sin(y / 9) * 14;
        r.rect(64 + s - 1, 64 + y, 3, 1, teal(150));
        r.rect(64 - s - 1, 64 + y, 3, 1, teal(110));
        if (y % 6 === 0) line(r, 64 - s, 64 + y, 64 + s, 64 + y, teal(70));
      }
    },
  },
  scanPad: {
    w: 2, h: 2,
    draw(r) {
      disc(r, 32, 32, 28, hex('#0b1a20'));
      ring(r, 32, 32, 25, 28, hex('#2fd2e0', 210));
      ring(r, 32, 32, 17, 18, hex('#2fd2e0', 120));
      ring(r, 32, 32, 9, 10, hex('#2fd2e0', 90));
      r.rect(31, 6, 2, 52, hex('#2fd2e0', 60));
      r.rect(6, 31, 52, 2, hex('#2fd2e0', 60));
    },
  },
};

// ------------------------------------------------- Medical Wing additions
Object.assign(PROPS, {
  duelTable: {
    w: 2, h: 2,
    draw(r) {
      disc(r, 34, 36, 27, BLACK(90));
      ring(r, 32, 32, 24, 28, hex('#3e8bff', 230));
      disc(r, 32, 32, 24, hex('#0b0e13'));
      disc(r, 32, 32, 22, hex('#1d2a44'));
      disc(r, 32, 32, 18, hex('#24365a'));
      ring(r, 32, 32, 17, 18, hex('#6aa8ff', 160));
      // two face-down cards and crossed blades symbol
      const card = (x, y) => {
        r.rect(x - 1, y - 1, 11, 15, hex('#0b0e13'));
        r.rect(x, y, 9, 13, hex('#e8eef8'));
        r.rect(x + 1, y + 1, 7, 11, hex('#3e8bff'));
        r.rect(x + 3, y + 4, 3, 5, hex('#bcd6ff'));
      };
      card(19, 25);
      card(36, 25);
      line(r, 27, 14, 37, 22, hex('#bcd6ff'), 2);
      line(r, 37, 14, 27, 22, hex('#bcd6ff'), 2);
    },
  },
  supplyBox: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 4, 5, 24, 24);
      box3d(r, 4, 4, 24, 24, 8, { top: '#e6b23e', front: '#a8781c', outline: '#3a2a08' });
      r.rect(4, 11, 24, 2, hex('#7a5410'));
      r.rect(14, 4, 4, 16, hex('#7a5410'));
      r.rect(12, 22, 8, 3, hex('#fff2b0'));
      r.rect(5, 5, 22, 1, hex('#fff2b0', 200));
    },
  },
  bigTank: {
    w: 3, h: 4,
    draw(r, pw, ph, rng) {
      ellipse(r, 50, 112, 44, 12, BLACK(90));
      ellipse(r, 48, 106, 44, 14, hex('#0b0e13'));
      ellipse(r, 48, 104, 42, 12, hex('#3a4458'));
      ellipse(r, 48, 102, 32, 8, hex('#232a38'));
      ring(r, 48, 104, 0, 0, null);
      r.rect(18, 22, 60, 80, hex('#08201f'));
      vgrad(r, 20, 24, 56, 78, hex('#43f0dc', 230), hex('#0d5a5a', 230));
      ellipse(r, 48, 62, 10, 18, hex('#06302d', 200));
      disc(r, 48, 40, 7, hex('#06302d', 200));
      for (let i = 0; i < 14; i++) disc(r, 22 + rng() * 52, 28 + rng() * 70, 0.8 + rng() * 1.8, hex('#d4fff8', 170));
      r.rect(24, 24, 4, 78, WHITE(80));
      r.rect(31, 24, 2, 78, WHITE(35));
      for (const y of [40, 70]) r.rect(18, y, 60, 2, hex('#5e6a7e', 200));
      ellipse(r, 48, 22, 32, 8, hex('#0b0e13'));
      ellipse(r, 48, 20, 31, 7, hex('#5e6a7e'));
      ellipse(r, 48, 19, 22, 4, hex('#8a97a6'));
      disc(r, 48, 18, 3, hex('#43f0dc'));
    },
  },
  glassCase: {
    w: 3, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 4, 92, 26);
      box3d(r, 2, 4, 92, 26, 8, { top: '#2a3a44', front: '#1a252c' });
      r.rect(6, 6, 84, 12, hex('#3ee6a0', 90));
      r.rect(6, 6, 84, 1, WHITE(140));
      for (let i = 0; i < 6; i++) disc(r, 14 + i * 14, 12, 3, hex(['#3ee6a0', '#2fd2e0', '#c6f03a'][i % 3], 220));
    },
  },
  meetingTable: {
    w: 4, h: 2,
    draw(r, pw, ph, rng) {
      const chair = (x, y) => box3d(r, x, y, 12, 10, 4, { top: '#2f3a48', front: '#1d2530' });
      for (const x of [18, 40, 62, 84]) { chair(x, 2); chair(x, 52); }
      shadow(r, 10, 14, 108, 36);
      box3d(r, 10, 13, 108, 36, 8, { top: '#8f9ba6', front: '#5a6570' });
      r.rect(44, 18, 40, 14, hex('#0b0e13'));
      r.rect(46, 20, 36, 10, hex('#0f4a5a'));
      for (let y = 22; y < 29; y += 2) r.rect(48, y, 6 + Math.floor(rng() * 24), 1, hex('#2fd2e0'));
      for (const x of [20, 96]) r.rect(x, 22, 10, 7, hex('#e8eef0'));
    },
  },
  nurseDesk: {
    w: 4, h: 2,
    draw(r, pw, ph, rng) {
      shadow(r, 6, 8, 116, 50);
      box3d(r, 6, 8, 116, 18, 7, { top: '#d8c9a8', front: '#8f7f62' });
      box3d(r, 6, 26, 18, 32, 7, { top: '#d8c9a8', front: '#8f7f62' });
      box3d(r, 104, 26, 18, 32, 7, { top: '#d8c9a8', front: '#8f7f62' });
      for (const x of [30, 58, 86]) {
        r.rect(x, 2, 16, 11, hex('#0b0e13'));
        r.rect(x + 1, 3, 14, 8, hex('#0f4a5a'));
        r.rect(x + 3, 5, 8, 1, hex('#2fd2e0'));
      }
      r.rect(50, 34, 26, 16, hex('#3a4458'));
      box3d(r, 54, 36, 18, 12, 4, { top: '#2f3a48', front: '#1d2530' });
    },
  },
  reception: {
    w: 6, h: 2,
    draw(r) {
      shadow(r, 6, 10, 180, 46);
      box3d(r, 6, 10, 180, 20, 8, { top: '#3f6a5a', front: '#284438' });
      box3d(r, 6, 30, 22, 26, 8, { top: '#3f6a5a', front: '#284438' });
      box3d(r, 164, 30, 22, 26, 8, { top: '#3f6a5a', front: '#284438' });
      r.rect(6, 10, 180, 1, hex('#8ae0c0'));
      r.rect(80, 2, 32, 14, hex('#0b0e13'));
      r.rect(82, 4, 28, 10, hex('#0f4a4a'));
      r.rect(85, 7, 18, 1, hex('#3ee6a0'));
      r.rect(120, 14, 16, 6, hex('#e8eef0'));
    },
  },
  sofa: {
    w: 2, h: 1,
    draw(r) {
      shadow(r, 3, 6, 58, 24);
      box3d(r, 3, 4, 58, 24, 8, { top: '#2f4a56', front: '#1d303a' });
      r.rect(5, 6, 54, 6, hex('#3c5c6a'));
      r.rect(5, 13, 26, 8, hex('#36525e'));
      r.rect(33, 13, 26, 8, hex('#36525e'));
    },
  },
  labBenchV: {
    w: 1, h: 3,
    draw(r, pw, ph, rng) {
      shadow(r, 4, 3, 24, 90);
      box3d(r, 4, 3, 24, 90, 7, { top: '#c4ced4', front: '#7f8c94', outline: '#2a3036' });
      const glass = ['#3ee6d0', '#2fd2e0', '#ff5ad1', '#ffb347'];
      for (let i = 0; i < 5; i++) {
        const y = 8 + i * 16;
        r.rect(9, y, 8, 8, hex('#e8f4f8', 120));
        r.rect(9, y + 3, 8, 5, hex(glass[i % 4], 220));
      }
      r.rect(18, 60, 7, 18, hex('#0b0e13'));
      r.rect(19, 61, 5, 9, hex('#0f4a5a'));
    },
  },
  benchV: {
    w: 1, h: 2,
    draw(r) {
      shadow(r, 8, 4, 16, 56);
      box3d(r, 8, 4, 16, 56, 5, { top: '#2f6a4a', front: '#1f4a32' });
      for (let y = 8; y < 54; y += 6) r.rect(10, y, 12, 1, hex('#3f8a5e'));
    },
  },
});

Object.assign(DECOR, {
  redCross: {
    w: 2, h: 2,
    draw(r) {
      disc(r, 32, 32, 26, hex('#ffffff', 25));
      r.rect(24, 12, 16, 40, hex('#ff4a5a', 230));
      r.rect(12, 24, 40, 16, hex('#ff4a5a', 230));
      r.rect(25, 13, 14, 2, WHITE(120));
    },
  },
  arrowUp: {
    w: 2, h: 2,
    draw(r) {
      const c = hex('#e8f4ff', 200);
      for (let y = 0; y < 20; y++) r.rect(32 - y, 10 + y, y * 2, 1, c);
      r.rect(24, 30, 16, 24, c);
    },
  },
  stairs: {
    w: 2, h: 3,
    draw(r) {
      for (let i = 0; i < 12; i++) {
        const y = i * 8;
        r.rect(0, y, 64, 8, hex('#1a1f27'));
        r.rect(0, y, 64, 2, mix(hex('#5a6788'), hex('#1a1f27'), i / 12));
      }
      r.rect(0, 0, 3, 96, hex('#ff9a2a'));
      r.rect(61, 0, 3, 96, hex('#ff9a2a'));
    },
  },
  ventRed: {
    w: 1, h: 1,
    draw(r) {
      r.rect(2, 2, 28, 28, hex('#ff3b4a'));
      r.rect(3, 3, 26, 26, hex('#2a0a0e'));
      for (let x = 6; x < 27; x += 4) r.rect(x, 6, 2, 20, hex('#ff3b4a', 200));
      r.rect(3, 3, 26, 1, hex('#ff8a94'));
    },
  },
});

// ------------------------------------------------------- small details
Object.assign(PROPS, {
  officeChair: {
    w: 1, h: 1,
    draw(r) {
      ellipse(r, 17, 27, 9, 3, BLACK(80));
      for (const a of [0, 1.26, 2.51, 3.77, 5.03]) line(r, 16, 24, 16 + Math.cos(a) * 8, 24 + Math.sin(a) * 4, hex('#1a1f27'), 2);
      r.rect(15, 18, 2, 6, hex('#2a313c'));
      roundRect(r, 8, 12, 16, 9, 3, hex('#0b0e13'));
      roundRect(r, 9, 12, 14, 7, 3, hex('#2f4a6a'));
      roundRect(r, 9, 4, 14, 9, 3, hex('#0b0e13'));
      roundRect(r, 10, 5, 12, 7, 3, hex('#3a5a80'));
    },
  },
  computerDesk: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      shadow(r, 2, 8, 28, 22);
      box3d(r, 2, 8, 28, 22, 7, { top: '#5a6472', front: '#3a414c' });
      r.rect(7, 1, 18, 13, hex('#0b0e13'));
      screenLines(r, 8, 2, 16, 10, '#2fd2e0', rng);
      r.rect(14, 14, 4, 2, hex('#0b0e13'));
      r.rect(7, 17, 14, 4, hex('#8a97a6'));
      disc(r, 25, 19, 2, hex('#c4ced4'));
    },
  },
  ivStand: {
    w: 1, h: 1,
    draw(r) {
      ellipse(r, 17, 28, 7, 2.5, BLACK(80));
      for (const a of [0.3, 1.9, 3.5, 5.1]) line(r, 16, 27, 16 + Math.cos(a) * 6, 27 + Math.sin(a) * 2.5, hex('#5e6a78'), 1);
      r.rect(15, 4, 2, 23, hex('#c4ced4'));
      r.rect(10, 3, 12, 2, hex('#c4ced4'));
      roundRect(r, 9, 5, 7, 10, 2, hex('#bfe6ff', 200));
      r.rect(10, 9, 5, 5, hex('#7fd0ff', 200));
      line(r, 12, 15, 14, 24, hex('#bfe6ff', 160));
    },
  },
  medCart: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 5, 5, 22, 24);
      box3d(r, 5, 4, 22, 24, 14, { top: '#e8eef0', front: '#c44a4a', outline: '#2a1a1a' });
      for (const y of [17, 21, 25]) r.rect(7, y, 18, 1, hex('#8a2a2a'));
      r.rect(9, 6, 6, 4, hex('#3ee6d0'));
      r.rect(17, 6, 5, 5, hex('#ffffff'));
      for (const x of [6, 24]) disc(r, x, 29, 1.6, hex('#1a1a1a'));
    },
  },
  waterCooler: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 8, 8, 16, 21);
      box3d(r, 8, 14, 16, 15, 9, { top: '#e8eef0', front: '#b8c4c9', outline: '#2a3036' });
      roundRect(r, 9, 1, 14, 15, 5, hex('#3e8bff', 170));
      r.rect(11, 3, 2, 10, WHITE(140));
      r.rect(14, 22, 2, 2, hex('#3e8bff'));
      r.rect(18, 22, 2, 2, hex('#e0443e'));
    },
  },
  trashBin: {
    w: 1, h: 1,
    draw(r) {
      ellipse(r, 17, 27, 8, 3, BLACK(80));
      r.rect(9, 14, 14, 13, hex('#1a1f27'));
      vgrad(r, 10, 14, 12, 13, hex('#5e6a78'), hex('#3a414c'));
      ellipse(r, 16, 14, 7, 3, hex('#1a1f27'));
      ellipse(r, 16, 14, 6, 2.2, hex('#0b0e13'));
      r.rect(13, 10, 5, 4, hex('#d8dccf'));
    },
  },
  fileCabinet: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 5, 3, 22, 27);
      box3d(r, 5, 3, 22, 27, 18, { top: '#6a7586', front: '#4a5464' });
      for (const y of [16, 22]) { r.rect(7, y, 18, 1, hex('#2a313c')); r.rect(13, y + 2, 6, 1, hex('#c4ced4')); }
    },
  },
  sink: {
    w: 1, h: 1,
    draw(r) {
      shadow(r, 3, 4, 26, 22);
      box3d(r, 3, 4, 26, 22, 8, { top: '#e8eef0', front: '#aebbc1', outline: '#2a3036' });
      roundRect(r, 7, 7, 18, 9, 4, hex('#9aa7b0'));
      roundRect(r, 8, 8, 16, 7, 3, hex('#c8e6f0'));
      r.rect(15, 5, 2, 5, hex('#5e6a78'));
      disc(r, 16, 11, 1, hex('#5e6a78'));
    },
  },
  cone: {
    w: 1, h: 1,
    draw(r) {
      r.rect(7, 25, 18, 4, BLACK(80));
      r.rect(6, 24, 20, 4, hex('#1a1a1a'));
      for (let y = 6; y < 24; y++) {
        const half = 2 + (y - 6) * 0.38;
        const c = y > 11 && y < 15 ? hex('#ffffff') : y > 18 && y < 21 ? hex('#ffffff') : hex('#ff7a1a');
        r.rect(16 - half, y, half * 2, 1, c);
      }
    },
  },
  wheelchair: {
    w: 1, h: 1,
    draw(r) {
      ellipse(r, 17, 27, 11, 3, BLACK(80));
      for (const x of [6, 26]) { r.rect(x - 2, 10, 4, 18, hex('#1a1a1a')); r.rect(x - 1, 11, 2, 16, hex('#5e6a78')); }
      roundRect(r, 8, 12, 16, 11, 2, hex('#2f4a6a'));
      roundRect(r, 8, 5, 16, 8, 2, hex('#3a5a80'));
      r.rect(9, 24, 14, 2, hex('#8a97a6'));
    },
  },
  holoTable: {
    w: 2, h: 2,
    draw(r) {
      disc(r, 34, 36, 26, BLACK(90));
      disc(r, 32, 34, 24, hex('#0b0e13'));
      disc(r, 32, 33, 22, hex('#2c3446'));
      ring(r, 32, 33, 18, 20, hex('#2fd2e0', 220));
      disc(r, 32, 33, 14, hex('#0d2a33'));
      ring(r, 32, 33, 8, 9, hex('#2fd2e0', 150));
      disc(r, 32, 33, 3, hex('#bff8ff'));
    },
  },
});

// Screen areas inside props (pixels), so the game can make them flicker.
export const SCREENS = {
  terminalDesk: [[10, 3, 18, 10], [39, 3, 18, 10], [68, 3, 18, 10]],
  console: [[6, 6, 20, 9]],
  computerDesk: [[8, 2, 16, 10]],
  controlPanel: [[6, 6, 20, 10]],
  supplyStation: [[8, 6, 22, 9]],
  meetingTable: [[46, 20, 36, 10]],
  nurseDesk: [[31, 3, 14, 8], [59, 3, 14, 8], [87, 3, 14, 8]],
  reception: [[82, 4, 28, 10]],
};

Object.assign(DECOR, {
  rug: {
    w: 4, h: 3,
    draw(r) {
      r.rect(2, 2, 124, 92, hex('#1f3a3a'));
      r.rect(5, 5, 118, 86, hex('#2c5250'));
      r.rect(9, 9, 110, 78, hex('#1f3a3a'));
      for (let x = 12; x < 116; x += 8) for (let y = 12; y < 84; y += 8) if ((x + y) % 16 === 0) r.rect(x, y, 3, 3, hex('#3e6a66'));
      ring(r, 64, 48, 18, 20, hex('#3ee6a0', 140));
    },
  },
  lineTealH: { w: 1, h: 1, draw(r) { r.rect(0, 14, 32, 4, hex('#2fd2c0', 120)); r.rect(0, 15, 32, 1, hex('#bff8f0', 90)); } },
  lineTealV: { w: 1, h: 1, draw(r) { r.rect(14, 0, 4, 32, hex('#2fd2c0', 120)); r.rect(15, 0, 1, 32, hex('#bff8f0', 90)); } },
  lineAmberH: { w: 1, h: 1, draw(r) { r.rect(0, 14, 32, 4, hex('#f2b84a', 120)); r.rect(0, 15, 32, 1, hex('#fff0c0', 90)); } },
  lineAmberV: { w: 1, h: 1, draw(r) { r.rect(14, 0, 4, 32, hex('#f2b84a', 120)); r.rect(15, 0, 1, 32, hex('#fff0c0', 90)); } },
  puddle: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      for (let i = 0; i < 5; i++) ellipse(r, 16 + (rng() - 0.5) * 12, 16 + (rng() - 0.5) * 8, 4 + rng() * 5, 2 + rng() * 3, hex('#7fb8d8', 70));
      r.rect(12, 14, 5, 1, WHITE(110));
    },
  },
  footprints: {
    w: 1, h: 1,
    draw(r) {
      for (const [x, y] of [[8, 26], [15, 20], [10, 13], [17, 6]]) { ellipse(r, x, y, 2, 3.2, BLACK(55)); ellipse(r, x, y + 4, 1.5, 1.5, BLACK(45)); }
    },
  },
  scuffs: {
    w: 1, h: 1,
    draw(r, pw, ph, rng) {
      for (let i = 0; i < 6; i++) {
        const x = 3 + rng() * 22, y = 3 + rng() * 24;
        line(r, x, y, x + 3 + rng() * 6, y + (rng() - 0.5) * 3, BLACK(70));
      }
    },
  },
  tapeCross: {
    w: 1, h: 1,
    draw(r) {
      line(r, 5, 5, 27, 27, hex('#f2e14a', 200), 3);
      line(r, 27, 5, 5, 27, hex('#f2e14a', 200), 3);
    },
  },
});
