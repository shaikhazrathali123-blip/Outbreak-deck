// A pretend Phaser scene: a clock, timers and events, and display objects that do nothing.
// The real Session, BotBrain and Actor code runs on top of it (balance simulator only).

/** Anything at all: callable, and every property is "anything" again (sprite.preFX.addGlow(...)). */
const anything = new Proxy(function () {}, {
  get: (_, key) => (typeof key === 'symbol' ? undefined : anything),
  apply: () => anything,
});

/** Any display object: every method call is accepted and returns the object again. */
function thing(props = {}) {
  const target = { x: 0, y: 0, visible: true, ...props };
  const proxy = new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (typeof key === 'symbol') return undefined;
      // a method call chains (sprite.setDepth(2).setAlpha(1)); a property (sprite.preFX) is "anything"
      return new Proxy(function () {}, { apply: () => proxy, get: (_, k) => (typeof k === 'symbol' ? undefined : anything) });
    },
  });
  return proxy;
}

/** A sprite: keeps its position and current animation (refills check "is it walking?"). */
function sprite(x, y) {
  const anims = { timeScale: 1, currentAnim: null, resume() {}, pause() {}, stop() {} };
  const s = thing({
    x,
    y,
    anims,
    play(cfg) {
      anims.currentAnim = { key: typeof cfg === 'string' ? cfg : cfg.key };
      return s;
    },
    setPosition(nx, ny) {
      s.x = nx;
      if (ny !== undefined) s.y = ny;
      return s;
    },
  });
  return s;
}

export class HeadlessScene {
  constructor() {
    this.now = 0;
    this.timers = [];
    this.listeners = new Map();
    this.time = {
      get now() {
        return scene.now;
      },
      delayedCall: (ms, fn) => {
        this.timers.push({ at: this.now + ms, fn });
        return thing();
      },
    };
    const scene = this;
    this.events = {
      emit: (name, ...args) => (this.listeners.get(name) ?? []).forEach((fn) => fn(...args)),
      on: (name, fn) => this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]),
    };
    this.add = new Proxy({}, { get: (_, kind) => (kind === 'sprite' ? (x, y) => sprite(x, y) : () => thing()) });
    this.tweens = { add: (cfg) => cfg.onComplete?.() };
    this.cameras = { main: thing() };
    this.scene = thing();
    this.textures = { exists: () => true };
    this.anims = { exists: () => true, create: () => {} };
  }

  /** Move the clock on by `ms` and run the timers that are due. */
  advance(ms) {
    this.now += ms;
    const due = this.timers.filter((t) => t.at <= this.now);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const t of due.sort((a, b) => a.at - b.at)) t.fn();
  }
}
