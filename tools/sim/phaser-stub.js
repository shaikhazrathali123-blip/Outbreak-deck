// The few Phaser helpers the match code uses, without a browser (balance simulator only).
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const Shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export default {
  Math: { Clamp, Between },
  Utils: { Array: { Shuffle } },
  Display: { Color: { Interpolate: { ColorWithColor: () => ({ r: 255, g: 255, b: 255 }) }, GetColor: () => 0xffffff, HexStringToColor: () => ({ color: 0xffffff }) } },
  BlendModes: { ADD: 1 },
};
