import { localize } from './i18n';
import { celebrationPlan, drainPlan, type CelebrationPlan, type DrainPlan } from './rules';

const GOLD = 0xffd966;
const WHITE_HOT = 0xfff5d6;
const AMBER = 0xff9933;
const SMOKE = 0xe3dccf;
const SMOKE_GOLD = 0xf0dca6;
const BLOOD = 0xff2a3a;
const EMBER_RED = 0xff7a5c;
const SHADOW_RED = 0x4a0812;
const FIREWORK_COLORS = [0xffd966, 0xff5e7e, 0x5ee0ff, 0xb07cff, 0x7dff8a, 0xff9933];

// Sizes below are tuned for a 100px grid, where a 1x1 token has a 50px radius.
const BASE_RADIUS = 50;

type Curve = (t: number, age: number) => number;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const backOut = (t: number): number => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const one: Curve = () => 1;
const fadeOut =
  (from: number, max = 1): Curve =>
  (t) =>
    max * (t < from ? 1 : Math.max(0, 1 - (t - from) / (1 - from)));
const bell =
  (peak: number, max = 1): Curve =>
  (t) =>
    max * (t < peak ? t / peak : Math.max(0, (1 - t) / (1 - peak)));
const sine =
  (max = 1): Curve =>
  (t) =>
    max * Math.sin(t * Math.PI);
const grow =
  (from: number, to: number): Curve =>
  (t) =>
    from + (to - from) * easeOut(t);

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

interface Textures {
  star: PIXI.Texture;
  soft: PIXI.Texture;
  halo: PIXI.Texture;
  smoke: PIXI.Texture;
  ringThick: PIXI.Texture;
  ringThin: PIXI.Texture;
  streak: PIXI.Texture;
  dot: PIXI.Texture;
}

const TEXTURE_SIZE = { dot: 24, star: 40, soft: 128, halo: 128, smoke: 64, ring: 128, streak: 48 };
/** Where a halo is brightest, as a fraction of its radius. */
const HALO_PEAK = 0.6;

function bake(gfx: PIXI.Graphics): PIXI.Texture {
  const texture = canvas.app!.renderer.generateTexture(gfx, { resolution: 2 });
  gfx.destroy();
  return texture;
}

// A 4-point star: soft halo, cardinal spikes, fainter diagonals, hot core. Every texture is drawn
// white so each sprite's tint sets its colour.
function starTexture(): PIXI.Texture {
  const size = TEXTURE_SIZE.star;
  const c = size / 2;
  const gfx = new PIXI.Graphics();
  gfx.beginFill(0xffffff, 0.08).drawCircle(c, c, c).endFill();
  gfx.beginFill(0xffffff, 0.22).drawCircle(c, c, c * 0.55).endFill();
  const spikeW = 1.5;
  gfx.beginFill(0xffffff, 0.65).drawRect(0, c - spikeW / 2, size, spikeW).endFill();
  gfx.beginFill(0xffffff, 0.65).drawRect(c - spikeW / 2, 0, spikeW, size).endFill();
  gfx.lineStyle({ width: 1, color: 0xffffff, alpha: 0.35 });
  const d = size * 0.4;
  gfx.moveTo(c - d, c - d).lineTo(c + d, c + d);
  gfx.moveTo(c - d, c + d).lineTo(c + d, c - d);
  gfx.lineStyle(0);
  gfx.beginFill(0xffffff, 1).drawCircle(c, c, size / 8).endFill();
  return bake(gfx);
}

function radialTexture(size: number, steps: number, alpha: number): PIXI.Texture {
  const gfx = new PIXI.Graphics();
  for (let i = steps; i > 0; i--) {
    gfx.beginFill(0xffffff, alpha).drawCircle(size / 2, size / 2, (size / 2) * (i / steps)).endFill();
  }
  return bake(gfx);
}

// A hollow glow, brightest at HALO_PEAK and dark in the middle, so it lights the token's edge
// without washing out its face.
function haloTexture(): PIXI.Texture {
  const size = TEXTURE_SIZE.halo;
  const steps = 24;
  const band = (size / 2) / steps;
  const gfx = new PIXI.Graphics();
  for (let i = 0; i < steps; i++) {
    const rho = (i + 0.5) / steps;
    const falloff = Math.max(0, 1 - Math.abs(rho - HALO_PEAK) / (rho < HALO_PEAK ? HALO_PEAK - 0.25 : 1 - HALO_PEAK));
    if (falloff <= 0) continue;
    gfx.lineStyle({ width: band + 0.5, color: 0xffffff, alpha: 0.7 * falloff ** 1.5, alignment: 0.5 });
    gfx.drawCircle(size / 2, size / 2, rho * (size / 2));
  }
  return bake(gfx);
}

// Overlapping offset lobes give the puff a lumpy, cloud-like edge instead of a clean disc.
function smokeTexture(): PIXI.Texture {
  const size = TEXTURE_SIZE.smoke;
  const c = size / 2;
  const gfx = new PIXI.Graphics();
  const lobes: Array<[number, number, number]> = [
    [0, 0, 0.5],
    [-0.22, -0.12, 0.32],
    [0.2, -0.16, 0.3],
    [0.16, 0.18, 0.3],
    [-0.18, 0.2, 0.28],
  ];
  for (let i = 6; i > 0; i--) {
    for (const [dx, dy, r] of lobes) {
      gfx.beginFill(0xffffff, 0.13).drawCircle(c + dx * size, c + dy * size, r * c * (i / 6)).endFill();
    }
  }
  return bake(gfx);
}

function ringTexture(width: number): PIXI.Texture {
  const size = TEXTURE_SIZE.ring;
  const gfx = new PIXI.Graphics();
  gfx.lineStyle({ width, color: 0xffffff, alpha: 1, alignment: 0.5 });
  gfx.drawCircle(size / 2, size / 2, size / 2 - width);
  return bake(gfx);
}

function streakTexture(): PIXI.Texture {
  const w = TEXTURE_SIZE.streak;
  const h = 8;
  const gfx = new PIXI.Graphics();
  gfx.beginFill(0xffffff, 0.15).drawRect(0, 0, w, h).endFill();
  gfx.beginFill(0xffffff, 0.55).drawRect(w * 0.15, h * 0.15, w * 0.7, h * 0.7).endFill();
  gfx.beginFill(0xffffff, 1).drawRect(w * 0.3, h * 0.25, w * 0.4, h * 0.5).endFill();
  return bake(gfx);
}

function makeTextures(power: number): Textures {
  return {
    star: starTexture(),
    soft: radialTexture(TEXTURE_SIZE.soft, 10, 0.07),
    halo: haloTexture(),
    smoke: smokeTexture(),
    ringThick: ringTexture(1.5 + power * 7.5),
    ringThin: ringTexture(1.5 + power * 1.2),
    streak: streakTexture(),
    dot: radialTexture(TEXTURE_SIZE.dot, 6, 0.3),
  };
}

interface Motion {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  /** Pixels per second squared; negative rises. */
  gravity?: number;
  /** Fraction of velocity shed per second. */
  drag?: number;
  /** Sets the position from the life fraction, replacing velocity, drag and gravity. */
  path?: (t: number) => readonly [number, number];
  life: number;
  delay?: number;
  /** Rendered diameter in pixels at a scale curve value of 1; omitted keeps the texture's size. */
  size?: number;
  rotation?: number;
  scale?: Curve;
  alpha?: Curve;
  tint?: number;
  spin?: number;
  twinkle?: boolean;
  /** Fades the sprite out inside this distance of the token's centre, keeping the token visible. */
  clear?: number;
  /** Stretches the sprite along its velocity: length grows by this much per px/s. */
  stretch?: number;
  ownsTexture?: boolean;
  onFrame?: (p: Particle, dt: number) => void;
  onEnd?: (p: Particle) => void;
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age = 0;
  delay: number;
  readonly phase = Math.random() * Math.PI * 2;
  readonly baseScale: number;

  constructor(
    readonly sprite: PIXI.Sprite,
    readonly m: Motion,
  ) {
    this.x = m.x ?? 0;
    this.y = m.y ?? 0;
    this.vx = m.vx ?? 0;
    this.vy = m.vy ?? 0;
    this.delay = m.delay ?? 0;
    this.baseScale = m.size ? m.size / Math.max(sprite.texture.width, sprite.texture.height, 1) : 1;
    sprite.anchor.set(0.5);
    sprite.visible = false;
    sprite.rotation = m.rotation ?? Math.random() * Math.PI * 2;
    if (m.tint !== undefined) sprite.tint = m.tint;
  }

  /** Advances one frame; false once the particle has finished. */
  step(dt: number): boolean {
    if (this.delay > 0) {
      this.delay -= dt;
      return true;
    }
    const { m, sprite } = this;
    this.age += dt;
    const t = this.age / m.life;
    if (t >= 1) return false;

    if (m.path) {
      [this.x, this.y] = m.path(t);
    } else {
      const keep = Math.exp(-(m.drag ?? 0) * dt);
      this.vx *= keep;
      this.vy = this.vy * keep + (m.gravity ?? 0) * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    const twinkle = m.twinkle ? 0.7 + 0.3 * Math.sin(this.age * 14 + this.phase) : 1;
    const clear = m.clear ? Math.min(1, Math.max(0, (Math.hypot(this.x, this.y) / m.clear - 0.6) / 0.4)) : 1;
    const scale = this.baseScale * (m.scale ?? one)(t, this.age);
    sprite.visible = true;
    sprite.position.set(this.x, this.y);
    sprite.alpha = (m.alpha ?? one)(t, this.age) * twinkle * clear;
    if (m.stretch) {
      sprite.rotation = Math.atan2(this.vy, this.vx);
      sprite.scale.set(scale * (1 + Math.hypot(this.vx, this.vy) * m.stretch), scale);
    } else {
      sprite.scale.set(scale);
      sprite.rotation += (m.spin ?? 0) * dt;
    }
    m.onFrame?.(this, dt);
    return true;
  }

  /** Ends the particle on its next frame, which runs its `onEnd`. */
  finish(): void {
    this.age = this.m.life;
  }
}

type LayerName = 'smoke' | 'glow' | 'sparks' | 'text';

/** One token's celebration: its own container of layers, centred on the token. */
class Show {
  readonly root = new PIXI.Container();
  readonly #layers: Record<LayerName, PIXI.Container>;
  #particles: Particle[] = [];

  /** `labels` is shared by every show and drawn above them all, so no burst covers a label. */
  constructor(center: { x: number; y: number }, labels: PIXI.Container) {
    this.#layers = {
      smoke: new PIXI.Container(),
      glow: new PIXI.Container(),
      sparks: new PIXI.Container(),
      text: new PIXI.Container(),
    };
    this.root.position.set(center.x, center.y);
    this.root.addChild(this.#layers.smoke, this.#layers.glow, this.#layers.sparks);
    this.#layers.text.position.set(center.x, center.y);
    labels.addChild(this.#layers.text);
    canvas.interface!.addChild(this.root);
  }

  emit(layer: LayerName, sprite: PIXI.Sprite, motion: Motion): Particle {
    // PIXI v7 ignores a container's blend mode, so each sprite carries its own.
    if (layer === 'glow' || layer === 'sparks') sprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.#layers[layer].addChild(sprite);
    const particle = new Particle(sprite, motion);
    this.#particles.push(particle);
    return particle;
  }

  /** Advances every particle; false once nothing is left to draw. */
  update(dt: number): boolean {
    // A scene change tears down the interface layer, and our sprites with it.
    if (this.root.destroyed || this.#layers.text.destroyed) return false;
    const current = this.#particles;
    this.#particles = [];
    for (const p of current) {
      if (p.step(dt)) {
        this.#particles.push(p);
        continue;
      }
      p.m.onEnd?.(p);
      p.sprite.destroy({ texture: !!p.m.ownsTexture, baseTexture: !!p.m.ownsTexture });
    }
    return this.#particles.length > 0;
  }

  destroy(): void {
    if (!this.root.destroyed) this.root.destroy({ children: true });
    if (!this.#layers.text.destroyed) this.#layers.text.destroy({ children: true });
  }
}

interface Scene {
  show: Show;
  tex: Textures;
  plan: CelebrationPlan;
  /** The token's radius in pixels. */
  r: number;
  /** `r` relative to a 1x1 token on a 100px grid. */
  k: number;
}

const sprite = (texture: PIXI.Texture): PIXI.Sprite => new PIXI.Sprite(texture);

/** A halo sized so its brightest band sits just outside a token of radius `r`. */
const haloSize = (r: number): number => (2 * r * 1.1) / HALO_PEAK;

function puff(
  { show, tex, k }: Scene,
  x: number,
  y: number,
  opts: {
    size: number;
    alpha: number;
    life: number;
    spread: number;
    delay?: number;
    outward?: { angle: number; speed: number };
  },
): void {
  const angle = opts.outward?.angle ?? rand(0, Math.PI * 2);
  const speed = opts.outward ? opts.outward.speed * rand(0.7, 1) : opts.spread * rand(0.5, 1);
  show.emit('smoke', sprite(tex.smoke), {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed * 0.6 - 25 * k,
    gravity: -18 * k,
    drag: 2.2,
    life: opts.life * rand(0.85, 1.15),
    delay: opts.delay,
    size: opts.size * rand(0.8, 1.15),
    scale: grow(0.4, 1.5),
    alpha: bell(0.15, opts.alpha),
    tint: Math.random() < 0.3 ? SMOKE_GOLD : SMOKE,
    spin: rand(-0.5, 0.5),
  });
}

/** Every award: a soft puff of smoke with a few rising glints, and a quick poof of light. */
function smokeAndGlints(scene: Scene): void {
  const { show, tex, plan, r, k } = scene;
  const p = plan.power;
  show.emit('glow', sprite(tex.halo), {
    life: 0.4,
    size: haloSize(r),
    scale: grow(0.8, 1.15),
    alpha: fadeOut(0, 0.5),
    tint: GOLD,
  });
  // The puffs start in a ring round the token's edge and billow outward, so the token never
  // hides them.
  for (let i = 0; i < plan.puffs; i++) {
    const angle = (i / plan.puffs) * Math.PI * 2 + rand(-0.25, 0.25);
    const dist = r * rand(0.45, 0.7);
    puff(scene, Math.cos(angle) * dist, Math.sin(angle) * dist * 0.7 + r * 0.1, {
      size: r * 1.05 * (1 + p * 0.5),
      alpha: 0.85 - p * 0.45,
      life: 1.4 + p * 0.6,
      spread: 0,
      outward: { angle, speed: 110 * k },
    });
  }
  for (let i = 0; i < plan.glints; i++) {
    const angle = rand(0, Math.PI * 2);
    const dist = r * 0.6 * Math.random();
    show.emit('sparks', sprite(tex.star), {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      vx: rand(-25, 25) * k,
      vy: -rand(15, 50) * k,
      gravity: -20 * k,
      drag: 1,
      life: rand(0.7, 1.3),
      delay: rand(0.05, 0.35),
      size: r * rand(0.25, 0.45),
      alpha: fadeOut(0.4),
      tint: Math.random() < 0.3 ? WHITE_HOT : GOLD,
      twinkle: true,
      spin: rand(-2, 2),
    });
  }
}

function burstTint(): number {
  const roll = Math.random();
  return roll < 0.1 ? WHITE_HOT : roll < 0.15 ? AMBER : GOLD;
}

/** 30 XP and up: the gold sparkle burst, gaining embers, shock waves and streaks as it grows. */
function sparkleBurst(scene: Scene, delay: number): void {
  const { show, tex, plan, r, k } = scene;
  const p = plan.power;
  const duration = 0.9 + p * 0.7;

  if (plan.preFlash) {
    show.emit('glow', sprite(tex.halo), {
      life: delay + 0.25,
      size: haloSize(r),
      alpha: bell(0.35, 0.6),
      tint: WHITE_HOT,
    });
  }
  show.emit('glow', sprite(tex.halo), {
    life: duration,
    delay,
    size: haloSize(r),
    scale: p > 0.3 ? grow(0.9, 1 + p * 0.3) : one,
    alpha: sine(0.3 + p * 0.3),
    tint: GOLD,
  });

  // Launched from the token's rim, so the burst rings the token instead of covering it.
  const fling = (reach: number, drag: number): { x: number; y: number; vx: number; vy: number } => {
    const angle = rand(0, Math.PI * 2);
    const dist = r * rand(0.5, 0.9);
    // With exponential drag, a particle launched at reach * drag coasts to a stop `reach` away.
    const speed = reach * drag;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  };

  for (let i = 0; i < plan.sparks; i++) {
    show.emit('sparks', sprite(tex.star), {
      ...fling(r * (0.8 + p * 2) * rand(0.35, 1), 2.4),
      drag: 2.4,
      gravity: 15 * k,
      life: duration * rand(0.8, 1.15),
      delay,
      clear: r,
      size: TEXTURE_SIZE.star * k * (0.35 + p * 0.25 + Math.random() * (0.25 + p * 0.35)),
      scale: grow(1, 1.3),
      alpha: fadeOut(0.5, 1 - p * 0.3),
      tint: burstTint(),
      twinkle: true,
    });
  }
  for (let i = 0; i < plan.embers; i++) {
    show.emit('sparks', sprite(tex.star), {
      ...fling(r * rand(0.3, 0.9) * (1 + p), 1),
      drag: 1,
      gravity: -10 * k,
      life: duration * 1.4,
      delay,
      clear: r,
      size: TEXTURE_SIZE.star * k * rand(0.3, 0.8),
      alpha: bell(0.55, 0.45),
      tint: GOLD,
    });
  }
  for (let i = 0; i < plan.streaks; i++) {
    const motion = fling(r * (1.5 + p * 2) * rand(0.6, 1), 2.6);
    show.emit('sparks', sprite(tex.streak), {
      ...motion,
      drag: 2.6,
      life: duration * 0.62,
      delay,
      clear: r,
      size: TEXTURE_SIZE.streak * k * rand(0.9, 1.5),
      alpha: fadeOut(0),
      tint: Math.random() < 0.4 ? WHITE_HOT : GOLD,
      stretch: 2.5 / Math.max(Math.hypot(motion.vx, motion.vy), 1),
    });
  }

  // Each wave stacks a thick ring under a thin one and crossfades them as it expands, so the ring
  // narrows as it grows and both are gone by the maximum radius.
  const expand = (t: number): number => {
    if (p <= 0.7) return (1 - p) * t + p * easeOut(t);
    if (t < 0.25) return easeOut(t / 0.25) * 0.9;
    if (t < 0.45) return 0.9 + ((t - 0.25) / 0.2) * 0.1;
    return 1;
  };
  const peak = 0.3 + p * 0.7;
  for (let w = 0; w < plan.waves; w++) {
    const ring = {
      life: duration * (1 - w * 0.18),
      delay: delay + duration * w * 0.18,
      size: r * (0.6 + p * p * 3.4) * 2,
      scale: (t: number) => 0.1 + expand(t) * 0.9,
      tint: GOLD,
    };
    const fade = w === 0 ? 1 : 0.7;
    show.emit('glow', sprite(tex.ringThick), {
      ...ring,
      alpha: (t) => fade * peak * Math.max(0, 1 - expand(t) * 1.8),
    });
    show.emit('glow', sprite(tex.ringThin), {
      ...ring,
      alpha: (t) => fade * peak * Math.min(1, expand(t) * 3) * (1 - expand(t)),
    });
  }
}

function explode(scene: Scene, x: number, y: number, color: number): void {
  const { show, tex, plan, r, k } = scene;
  show.emit('glow', sprite(tex.soft), {
    x,
    y,
    life: 0.3,
    size: r * 3,
    scale: grow(0.6, 1.2),
    alpha: fadeOut(0, 0.9),
    tint: WHITE_HOT,
  });
  show.emit('glow', sprite(tex.soft), { x, y, life: 0.9, size: r * 5, alpha: sine(0.35), tint: color });

  const count = 48 + Math.round(plan.power * 16);
  const speed = rand(200, 260) * k;
  const shells: Array<{ n: number; speed: number; tints: number[] }> = [
    { n: count, speed, tints: [color, color, color, WHITE_HOT] },
    { n: Math.round(count / 3), speed: speed * 0.45, tints: [WHITE_HOT, GOLD] },
  ];
  for (const shell of shells) {
    for (let j = 0; j < shell.n; j++) {
      const angle = (j / shell.n) * Math.PI * 2 + rand(-0.05, 0.05);
      const v = shell.speed * rand(0.7, 1);
      show.emit('sparks', sprite(tex.star), {
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        drag: 1.5,
        gravity: 110 * k,
        life: rand(1.3, 1.8),
        size: TEXTURE_SIZE.star * k * rand(0.4, 0.6),
        alpha: fadeOut(0.45),
        tint: pick(shell.tints),
        twinkle: true,
        stretch: 1 / shell.speed,
      });
    }
  }

  // Crackle: white glitter pops across the shell as it fades.
  for (let j = 0; j < 14; j++) {
    const angle = rand(0, Math.PI * 2);
    const dist = r * 3 * Math.random();
    show.emit('sparks', sprite(tex.star), {
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      gravity: 40 * k,
      life: rand(0.18, 0.3),
      delay: rand(0.45, 0.9),
      size: TEXTURE_SIZE.star * k * rand(0.5, 0.8),
      alpha: bell(0.2),
      tint: WHITE_HOT,
    });
  }
  for (let j = 0; j < 3; j++) {
    puff(scene, x + rand(-r, r), y + rand(-r, r), { size: r * 1.6, alpha: 0.18, life: 2.2, spread: 30 * k, delay: 0.3 });
  }
}

/** 120 XP and up: rockets fan out above the token and burst in colour. */
function fireworks(scene: Scene, delay: number): void {
  const { show, tex, plan, r, k } = scene;
  const colors = [...FIREWORK_COLORS].sort(() => Math.random() - 0.5);
  const n = plan.rockets;
  for (let i = 0; i < n; i++) {
    const fan = n > 1 ? (i / (n - 1) - 0.5) * 0.7 : 0;
    const angle = -Math.PI / 2 + fan + rand(-0.1, 0.1);
    const speed = rand(550, 700) * k;
    const launchX = rand(-0.3, 0.3) * r;
    const launchDelay = delay + 0.2 + i * 0.22 + rand(0, 0.12);
    const color = colors[i % colors.length];
    let trail = 0;

    puff(scene, launchX, 0, { size: r * 0.8, alpha: 0.3, life: 1.2, spread: 30 * k, delay: launchDelay });
    show.emit('sparks', sprite(tex.star), {
      x: launchX,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 750 * k,
      drag: 0.4,
      life: 1.6,
      delay: launchDelay,
      size: TEXTURE_SIZE.star * k * 0.55,
      tint: WHITE_HOT,
      onFrame: (rocket, dt) => {
        // Burst near the apex, as the climb slows.
        if (rocket.vy > -60 * k) rocket.finish();
        for (trail += dt; trail > 1 / 90; trail -= 1 / 90) {
          show.emit('sparks', sprite(tex.star), {
            x: rocket.x,
            y: rocket.y,
            vx: rand(-15, 15) * k,
            vy: rand(25, 50) * k,
            gravity: 150 * k,
            life: rand(0.3, 0.5),
            size: TEXTURE_SIZE.star * k * rand(0.2, 0.35),
            alpha: fadeOut(0),
            tint: Math.random() < 0.5 ? AMBER : GOLD,
          });
        }
      },
      onEnd: (rocket) => explode(scene, rocket.x, rocket.y, color),
    });
  }
}

const TEXT_LOOKS = {
  gain: { fill: ['#fffbe6', '#ffd34d', '#f0a020'], stroke: '#2a1700' },
  loss: { fill: ['#ffe0e0', '#ff4d5a', '#a8101e'], stroke: '#2a0006' },
};

function labelText(label: string, fontSize: number, look: keyof typeof TEXT_LOOKS): PIXI.Text {
  const text = new PIXI.Text(
    label,
    new PIXI.TextStyle({
      fontFamily: 'Signika, sans-serif',
      fontSize,
      fontWeight: '700',
      fill: TEXT_LOOKS[look].fill,
      fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
      stroke: TEXT_LOOKS[look].stroke,
      strokeThickness: Math.max(3, fontSize * 0.14),
      dropShadow: true,
      dropShadowColor: '#000000',
      dropShadowAlpha: 0.7,
      dropShadowBlur: fontSize * 0.25,
      dropShadowDistance: 0,
      padding: fontSize * 0.3,
    }),
  );
  // Rasterise for the current zoom so the text stays crisp on a zoomed-in canvas.
  text.resolution = Math.max(2, canvas.stage!.scale.x * window.devicePixelRatio);
  return text;
}

/** The award as rising text over the token: it pops in, floats up and fades. */
function floatingText(scene: Scene, label: string, delay: number): void {
  const { show, plan, r } = scene;
  const p = plan.power;
  const pulse = p >= 0.75;
  show.emit('text', labelText(label, Math.round(r * (0.42 + p * 0.5)), 'gain'), {
    y: -r * 0.95,
    vy: -r * (1.1 + p * 0.5),
    drag: 1.4,
    life: 2 + p * 1.2,
    delay,
    rotation: 0,
    scale: (_t, age) => (age < 0.3 ? backOut(age / 0.3) : 1) * (pulse ? 1 + 0.04 * Math.sin(age * 6) : 1),
    alpha: (t, age) => Math.min(1, age / 0.12) * fadeOut(0.6)(t, age),
    ownsTexture: true,
  });
}

function celebrate(
  center: { x: number; y: number },
  r: number,
  plan: CelebrationPlan,
  tex: Textures,
  label: string,
  labels: PIXI.Container,
): Show {
  const show = new Show(center, labels);
  const scene: Scene = { show, tex, plan, r, k: r / BASE_RADIUS };
  const delay = plan.preFlash ? 0.12 : 0;
  smokeAndGlints(scene);
  if (plan.sparks) sparkleBurst(scene, delay);
  if (plan.rockets) fireworks(scene, delay);
  floatingText(scene, label, delay + (plan.rockets ? 0.15 : 0.05));
  return show;
}

/** A loss: red motes fade in around the token and spiral in to its rim as the number sinks. */
function drain(
  center: { x: number; y: number },
  r: number,
  plan: DrainPlan,
  tex: Textures,
  label: string,
  labels: PIXI.Container,
): Show {
  const show = new Show(center, labels);
  const k = r / BASE_RADIUS;
  const p = plan.power;
  const duration = 1.6 + p * 0.6;

  show.emit('glow', sprite(tex.halo), {
    life: duration,
    delay: 0.25,
    size: haloSize(r),
    scale: grow(1.2, 0.95),
    alpha: sine(0.3 + p * 0.25),
    tint: BLOOD,
  });

  for (let i = 0; i < plan.puffs; i++) {
    const angle = (i / plan.puffs) * Math.PI * 2 + rand(-0.3, 0.3);
    const from = r * rand(1.4, 1.7);
    show.emit('smoke', sprite(tex.smoke), {
      path: (t) => {
        const rho = from - r * 0.4 * easeOut(t);
        return [Math.cos(angle + t * 0.8) * rho, Math.sin(angle + t * 0.8) * rho];
      },
      life: duration * rand(0.9, 1.1),
      delay: rand(0, 0.3),
      size: r * (1 + p * 0.4) * rand(0.85, 1.15),
      alpha: bell(0.4, 0.5 + p * 0.15),
      tint: SHADOW_RED,
      spin: rand(-0.5, 0.5),
    });
  }

  for (let i = 0; i < plan.motes; i++) {
    const start = rand(0, Math.PI * 2);
    const from = r * rand(1.5, 2 + p * 0.8);
    const to = r * rand(0.85, 1.05);
    // Every mote turns the same way, so together they read as one swirl.
    const turn = Math.PI * 2 * rand(0.45, 0.8);
    let trail = 0;
    show.emit('sparks', sprite(tex.dot), {
      path: (t) => {
        const rho = from + (to - from) * easeOut(t);
        return [Math.cos(start + turn * t) * rho, Math.sin(start + turn * t) * rho];
      },
      life: duration * rand(0.7, 1),
      delay: rand(0, 0.5),
      size: TEXTURE_SIZE.dot * k * rand(0.45, 0.9),
      alpha: bell(0.45, 0.95),
      tint: Math.random() < 0.25 ? EMBER_RED : BLOOD,
      onFrame: (mote, dt) => {
        for (trail += dt; trail > 1 / 45; trail -= 1 / 45) {
          show.emit('sparks', sprite(tex.dot), {
            x: mote.x,
            y: mote.y,
            life: 0.3,
            size: mote.sprite.width * 0.6,
            alpha: fadeOut(0, mote.sprite.alpha * 0.5),
            tint: BLOOD,
          });
        }
      },
    });
  }

  show.emit('text', labelText(label, Math.round(r * (0.42 + p * 0.3)), 'loss'), {
    y: -r * 1.5,
    vy: r * 0.15,
    gravity: r * 0.3,
    life: 2.2 + p * 0.8,
    delay: 0.1,
    rotation: 0,
    scale: (_t, age) => (age < 0.25 ? 1.25 - 0.25 * easeOut(age / 0.25) : 1),
    alpha: (t, age) => Math.min(1, age / 0.2) * fadeOut(0.55)(t, age),
    ownsTexture: true,
  });
  return show;
}

/** Plays the award, or the loss when `amount` is negative, on every visible token of the named actors. */
export function runSparkle(actorIds: readonly string[], amount: number): void {
  if (!canvas?.ready || !canvas.tokens || !canvas.interface || !canvas.app) return;
  const ids = new Set(actorIds);
  const tokens = canvas.tokens.placeables.filter(
    (t) => t.isVisible && (ids.has(t.document.actorId ?? '') || ids.has(t.actor?.id ?? '')),
  );
  if (!tokens.length) return;

  const labels = new PIXI.Container();
  let live: Set<Show>;
  let tex: Textures;
  if (amount < 0) {
    const plan = drainPlan(amount);
    const label = localize('floatLoss', { xp: -amount });
    tex = makeTextures(plan.power);
    live = new Set(tokens.map((t) => drain(t.center, Math.max(t.w, t.h) / 2, plan, tex, label, labels)));
  } else {
    const plan = celebrationPlan(amount);
    const label = localize('float', { xp: amount });
    tex = makeTextures(plan.power);
    live = new Set(tokens.map((t) => celebrate(t.center, Math.max(t.w, t.h) / 2, plan, tex, label, labels)));
  }
  canvas.interface.addChild(labels);

  const ticker = canvas.app.ticker;
  const tick = (): void => {
    // Clamped so a backgrounded tab doesn't fling everything to its end in one frame.
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    for (const show of live) {
      if (show.update(dt)) continue;
      show.destroy();
      live.delete(show);
    }
    if (live.size) return;
    ticker.remove(tick);
    if (!labels.destroyed) labels.destroy({ children: true });
    for (const texture of Object.values(tex)) texture.destroy(true);
  };
  ticker.add(tick);
}
