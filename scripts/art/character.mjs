// Player sprite sheet: an original "hazmat survivor" with a bubble helmet.
// Rows: down, left, right, up. Columns: idle, step A, idle, step B.
import { Raster, hex } from './raster.mjs';

const TS = 32;

const roundPred = (w, h, rTop, rBottom) => (x, y) => {
  const r = y < h / 2 ? rTop : rBottom;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const ellipsePred = (w, h) => (x, y) => ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2 <= 1;

function drawCharacter(r, ox, oy, dir, frame) {
  const OUTLINE = hex('#140c06');
  const SUIT = hex('#e0892a');
  const SUIT_DARK = hex('#a85f17');
  const BAND = hex('#f2e14a');
  const BOOT = hex('#2b2f36');
  const GLASS = hex('#9fd8ff', 150);
  const SKIN = hex('#e8b48a');
  const EYE = hex('#1a1a1a');
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const bob = step !== 0 ? -1 : 0;
  const side = dir === 'left' || dir === 'right';

  r.shape(ox + 8, oy + 26, 16, 5, ellipsePred(16, 5), hex('#000000', 100));

  const leg = (x, lift) => {
    const y = oy + 22 - lift;
    r.rect(x - 1, y - 1, 6, 8, OUTLINE);
    r.rect(x, y, 4, 4, SUIT_DARK);
    r.rect(x, y + 4, 4, 2, BOOT);
  };
  if (side) {
    leg(ox + 14 - step * 2, 0);
    leg(ox + 14 + step * 2, step !== 0 ? 1 : 0);
  } else {
    leg(ox + 11, step === 1 ? 1 : 0);
    leg(ox + 17, step === -1 ? 1 : 0);
  }

  const arm = (x, y) => {
    r.rect(x - 1, y - 1, 5, 9, OUTLINE);
    r.rect(x, y, 3, 7, SUIT_DARK);
    r.rect(x, y + 6, 3, 1, BOOT);
  };
  const ty = oy + 13 + bob;
  if (side) {
    arm(ox + 14 + step * 2, ty + 1);
  } else {
    arm(ox + 7, ty + 1 + (step === -1 ? 1 : 0));
    arm(ox + 22, ty + 1 + (step === 1 ? 1 : 0));
  }

  r.shape(ox + 9, ty - 1, 14, 12, roundPred(14, 12, 4, 3), OUTLINE);
  r.shape(ox + 10, ty, 12, 10, roundPred(12, 10, 3, 2), SUIT);
  r.rect(ox + 18, ty + 1, 3, 8, SUIT_DARK);
  r.rect(ox + 10, ty + 3, 12, 1, BAND);
  r.rect(ox + 10, ty + 7, 12, 1, OUTLINE);
  if (side) arm(ox + 14 - step * 2, ty + 1);

  const hy = oy + 2 + bob;
  r.shape(ox + 9, hy, 14, 14, ellipsePred(14, 14), OUTLINE);
  r.shape(ox + 10, hy + 1, 12, 12, ellipsePred(12, 12), dir === 'up' ? SUIT : hex('#203040'));
  if (dir !== 'up') {
    const fx = { down: 0, left: -2, right: 2 }[dir];
    r.shape(ox + 12 + fx, hy + 3, 8, 9, ellipsePred(8, 9), SKIN);
    if (dir === 'down') {
      r.px(ox + 14, hy + 7, EYE);
      r.px(ox + 17, hy + 7, EYE);
    } else {
      r.px(ox + (dir === 'left' ? 13 : 18), hy + 7, EYE);
    }
    r.shape(ox + 10, hy + 1, 12, 12, ellipsePred(12, 12), GLASS);
    r.rect(ox + 12, hy + 3, 2, 2, hex('#ffffff', 220));
  } else {
    r.rect(ox + 13, hy + 9, 6, 2, SUIT_DARK);
    r.rect(ox + 14, hy + 3, 2, 1, hex('#ffffff', 120));
  }
}

export function buildPlayerSheet(file) {
  const dirs = ['down', 'left', 'right', 'up'];
  const r = new Raster(TS * 4, TS * 4);
  dirs.forEach((dir, row) => {
    for (let frame = 0; frame < 4; frame++) drawCharacter(r, frame * TS, row * TS, dir, frame);
  });
  r.save(file);
}
