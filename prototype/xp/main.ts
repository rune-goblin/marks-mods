// Runs the module's own celebration on a mock board. The effect only touches a few Foundry
// globals (the canvas layers, its ticker, i18n), so this file stands those up with plain PIXI.
import en from '../../lang/en.json';
import { celebrationPlan, XP_PRESETS, type CelebrationPlan } from '@/xp/rules';
import { runSparkle } from '@/xp/sparkle';

const GRID = 100;
const PARTY = [
  { id: 'amiri', name: 'Amiri', color: 0xb5452f },
  { id: 'ezren', name: 'Ezren', color: 0x3c6fb0 },
  { id: 'kyra', name: 'Kyra', color: 0xc99a2e },
  { id: 'merisiel', name: 'Merisiel', color: 0x3f8a5a },
];
const TOUR = [10, 30, 40, 60, 80, 120, 160];
const MAPS = {
  dark: { floor: [0x24212b, 0x2a2631, 0x1f1c25], line: 0x3a3544 },
  light: { floor: [0xe6d6b3, 0xddcba5, 0xeadcbf], line: 0xb9a57f },
};

interface MockToken {
  isVisible: boolean;
  document: { actorId: string };
  actor: { id: string };
  center: { x: number; y: number };
  w: number;
  h: number;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stageEl = $('stage');

const app = new PIXI.Application({
  resizeTo: stageEl,
  antialias: true,
  autoDensity: true,
  resolution: window.devicePixelRatio,
  backgroundColor: 0x000000,
});
stageEl.prepend(app.view as HTMLCanvasElement);

const world = new PIXI.Container();
const floor = new PIXI.Graphics();
const tokenLayer = new PIXI.Container();
const interfaceLayer = new PIXI.Container();
world.addChild(floor, tokenLayer, interfaceLayer);
app.stage.addChild(world);

let placeables: MockToken[] = [];

Object.assign(globalThis, {
  canvas: {
    ready: true,
    app,
    stage: world,
    interface: interfaceLayer,
    tokens: {
      get placeables() {
        return placeables;
      },
    },
  },
  game: {
    i18n: {
      localize: (path: string) => lookup(path) ?? path,
      format: (path: string, data: Record<string, unknown>) =>
        (lookup(path) ?? path).replace(/\{(\w+)\}/g, (_, key: string) => String(data[key])),
    },
  },
});

function lookup(path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], en);
  return typeof value === 'string' ? value : undefined;
}

function drawFloor(kind: keyof typeof MAPS): void {
  const { floor: shades, line } = MAPS[kind];
  floor.clear();
  // Square centres sit on multiples of GRID, so every token lands in a square.
  for (let gx = -12; gx < 12; gx++) {
    for (let gy = -8; gy < 8; gy++) {
      const shade = shades[Math.abs((gx * 7 + gy * 13) % shades.length)];
      floor.beginFill(shade).drawRect(gx * GRID - GRID / 2, gy * GRID - GRID / 2, GRID, GRID).endFill();
    }
  }
  floor.lineStyle({ width: 1.5, color: line, alpha: 0.9 });
  for (let gx = -12; gx <= 12; gx++) floor.moveTo(gx * GRID - GRID / 2, -850).lineTo(gx * GRID - GRID / 2, 750);
  for (let gy = -8; gy <= 8; gy++) floor.moveTo(-1250, gy * GRID - GRID / 2).lineTo(1150, gy * GRID - GRID / 2);
}

function tokenSprite(member: (typeof PARTY)[number]): PIXI.Container {
  const token = new PIXI.Container();
  const r = GRID / 2 - 6;
  const disc = new PIXI.Graphics();
  disc.beginFill(0x000000, 0.35).drawCircle(0, 4, r).endFill();
  disc.beginFill(member.color).drawCircle(0, 0, r).endFill();
  disc.beginFill(0xffffff, 0.12).drawCircle(-r * 0.25, -r * 0.3, r * 0.6).endFill();
  disc.lineStyle({ width: 4, color: 0xf3e6c4 }).drawCircle(0, 0, r);
  const initial = new PIXI.Text(member.name[0], {
    fontFamily: 'Cinzel, Georgia, serif',
    fontSize: 40,
    fontWeight: '700',
    fill: '#fff8e8',
    dropShadow: true,
    dropShadowAlpha: 0.5,
    dropShadowDistance: 2,
  });
  initial.anchor.set(0.5);
  initial.resolution = 3;
  const name = new PIXI.Text(member.name, {
    fontFamily: 'Signika, sans-serif',
    fontSize: 15,
    fontWeight: '600',
    fill: '#ffffff',
    stroke: '#000000',
    strokeThickness: 4,
  });
  name.anchor.set(0.5, 0);
  name.position.set(0, r + 8);
  name.resolution = 3;
  token.addChild(disc, initial, name);
  return token;
}

function layoutTokens(count: number): void {
  tokenLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
  const members = PARTY.slice(0, count);
  placeables = members.map((member, i) => {
    const x = count === 1 ? 0 : (i - (count - 1) / 2) * GRID * 2;
    const y = GRID;
    const sprite = tokenSprite(member);
    sprite.position.set(x, y);
    tokenLayer.addChild(sprite);
    return { isVisible: true, document: { actorId: member.id }, actor: { id: member.id }, center: { x, y }, w: GRID, h: GRID };
  });
}

function place(): void {
  // Tokens sit low so fireworks have sky to climb into.
  world.position.set(app.screen.width / 2, app.screen.height * 0.5);
}

const zoomEl = $<HTMLInputElement>('zoom');
function applyZoom(): void {
  world.scale.set(Number(zoomEl.value));
}

const PLAN_ROWS: Array<[keyof CelebrationPlan, string]> = [
  ['puffs', 'Smoke puffs'],
  ['glints', 'Glints'],
  ['sparks', 'Sparkles'],
  ['embers', 'Embers'],
  ['waves', 'Shock waves'],
  ['streaks', 'Streaks'],
  ['rockets', 'Rockets'],
];

function showPlan(amount: number): void {
  const plan = celebrationPlan(amount);
  $('plan-title').textContent = `What ${amount} XP shows · power ${Math.round(plan.power * 100)}%`;
  $('plan').replaceChildren(
    ...PLAN_ROWS.map(([key, label]) => {
      const row = document.createElement('tr');
      const value = Number(plan[key]);
      row.innerHTML = `<th scope="row">${label}</th><td class="${value ? '' : 'off'}">${value || '—'}</td>`;
      return row;
    }),
  );
}

let tour: number | undefined;
function play(amount: number, fromTour = false): void {
  if (!fromTour) stopTour();
  if (!Number.isFinite(amount) || amount <= 0) return;
  $('now').textContent = `+${amount} XP`;
  showPlan(amount);
  runSparkle(
    placeables.map((t) => t.actor.id),
    amount,
  );
}

function stopTour(): void {
  if (tour !== undefined) window.clearTimeout(tour);
  tour = undefined;
  $('all').textContent = 'Play every tier';
}

function startTour(): void {
  stopTour();
  $('all').textContent = 'Stop';
  let i = 0;
  const next = (): void => {
    const amount = TOUR[i++];
    play(amount, true);
    tour = i < TOUR.length ? window.setTimeout(next, 1400 + celebrationPlan(amount).power * 2200) : undefined;
    if (tour === undefined) window.setTimeout(stopTour, 3000);
  };
  next();
}

function presetButtons(): void {
  const groups = { encounter: $('encounter'), accomplishment: $('accomplishment') };
  for (const preset of XP_PRESETS) {
    const label = lookup(`marks-mods.xp.preset.${preset.group}.${preset.key}`) ?? preset.key;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    button.innerHTML = `<span class="name">${label}</span><span class="xp">${preset.xp}</span>`;
    button.addEventListener('click', () => play(preset.xp));
    groups[preset.group].append(button);
  }
}

function segmented(id: string, attr: string, onPick: (value: string) => void): void {
  const seg = $(id);
  seg.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(`button[${attr}]`);
    if (!button) return;
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
    onPick(button.getAttribute(attr)!);
  });
}

async function start(): Promise<void> {
  // PIXI rasterises text once, so the faces must load before the first label is drawn.
  await Promise.allSettled([
    document.fonts.load('700 40px Signika'),
    document.fonts.load('600 15px Signika'),
    document.fonts.load('700 40px Cinzel'),
  ]);
  drawFloor('dark');
  layoutTokens(4);
  if (app.screen.width < 560) zoomEl.value = String(Math.max(0.4, app.screen.width / 760));
  applyZoom();
  place();
  app.renderer.on('resize', place);

  presetButtons();
  zoomEl.addEventListener('input', applyZoom);
  segmented('count', 'data-count', (value) => layoutTokens(Number(value)));
  segmented('map', 'data-map', (value) => drawFloor(value as keyof typeof MAPS));
  $('play').addEventListener('click', () => play(Number($<HTMLInputElement>('amount').value)));
  $('amount').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') play(Number($<HTMLInputElement>('amount').value));
  });
  $('all').addEventListener('click', () => (tour === undefined ? startTour() : stopTour()));

  showPlan(80);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.setTimeout(() => play(80), 400);
}

void start();
