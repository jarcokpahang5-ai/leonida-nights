// Palmera Bay: the city itself. A seeded generator lays out a 10x10 grid of blocks
// separated by streets, fills the blocks with buildings, parks and palms, puts the
// story's named places on fixed blocks, and answers collision questions for the sim.
// Nothing here touches the screen; render.js draws what this builds.
import { BLOCK, CELL, GRID, ROAD, WORLD, blockCenter, roadCenter } from './config.js';

// The story's named places, each pinned to one block so missions can find them.
export const SITES = [
  { id: 'safehouse', name: "Mako's Safehouse", i: 2, j: 2, color: '#7fb069', label: 'SAFEHOUSE' },
  { id: 'vera', name: "Vera's Office", i: 5, j: 4, color: '#e9c46a', label: "VERA'S OFFICE" },
  { id: 'gunshop', name: 'Ironworks Arms', i: 3, j: 7, color: '#bc6c25', label: 'GUN SHOP' },
  { id: 'clinic', name: 'Doc Marisol Clinic', i: 7, j: 3, color: '#f4f1de', label: 'CLINIC' },
  { id: 'garage', name: "Rico's Garage", i: 8, j: 6, color: '#8d99ae', label: 'GARAGE' },
  { id: 'bank', name: 'Palmera Bay Bank', i: 5, j: 5, color: '#e07a5f', label: 'BANK' },
  { id: 'police', name: 'Palmera Police HQ', i: 4, j: 6, color: '#4361ee', label: 'POLICE HQ' },
  { id: 'beachbar', name: 'The Sandbar', i: 1, j: 9, color: '#f3722c', label: 'THE SANDBAR' },
  { id: 'docks', name: 'Portside Docks', i: 0, j: 5, color: '#6c757d', label: 'DOCKS' },
  { id: 'marina', name: 'Solmar Marina', i: 8, j: 9, color: '#48cae4', label: 'MARINA' },
];

const PARK_BLOCKS = [
  [6, 1],
  [2, 6],
  [8, 2],
];

const HOUSE_COLORS = ['#e07a5f', '#f2cc8f', '#81b29a', '#f4d35e', '#ee964b', '#a3b18a', '#e5989b', '#b5838d'];
const TOWER_COLORS = ['#8d99ae', '#6c757d', '#495057', '#7d8597', '#5c677d'];
const ROOF_COLORS = ['#b08968', '#6c584c', '#7f4f24', '#936639'];

// Downtown is the middle of the map, where the towers stand.
function isDowntown(i, j) {
  return i >= 4 && i <= 6 && j >= 3 && j <= 6;
}

function siteAt(i, j) {
  for (const site of SITES) if (site.i === i && site.j === j) return site;
  return null;
}

function isPark(i, j) {
  return PARK_BLOCKS.some(([pi, pj]) => pi === i && pj === j);
}

export function generateCity(rng) {
  const buildings = [];
  const trees = [];
  const parks = [];

  for (let j = 0; j < GRID; j += 1) {
    for (let i = 0; i < GRID; i += 1) {
      const bx = i * CELL + ROAD;
      const by = j * CELL + ROAD;
      const site = siteAt(i, j);
      if (j === GRID - 1) {
        // The south row is the beach: sand, palms and the boardwalk bars.
        const palms = site ? 4 : rng.int(5, 9);
        for (let p = 0; p < palms; p += 1) {
          trees.push({ x: bx + rng.range(30, BLOCK - 30), y: by + rng.range(40, BLOCK - 40), palm: true });
        }
        if (site) {
          const c = blockCenter(i, j);
          buildings.push({ x: c.x - 90, y: c.y - 60, w: 180, h: 120, color: site.color, roof: '#7f4f24', tall: false, site: site.id });
        }
        continue;
      }
      if (isPark(i, j)) {
        parks.push({ x: bx, y: by, w: BLOCK, h: BLOCK });
        for (let p = 0; p < 14; p += 1) {
          trees.push({ x: bx + rng.range(30, BLOCK - 30), y: by + rng.range(30, BLOCK - 30), palm: rng.chance(0.3) });
        }
        continue;
      }
      if (site) {
        const c = blockCenter(i, j);
        const big = site.id === 'bank' || site.id === 'police';
        buildings.push({
          x: c.x - (big ? 130 : 95),
          y: c.y - (big ? 95 : 70),
          w: big ? 260 : 190,
          h: big ? 190 : 140,
          color: site.color,
          roof: '#5c677d',
          tall: big,
          site: site.id,
        });
        continue;
      }
      if (isDowntown(i, j)) {
        // One tower per downtown block, with a plaza of palms around it.
        const w = rng.range(150, 210);
        const h = rng.range(150, 210);
        const c = blockCenter(i, j);
        buildings.push({ x: c.x - w / 2, y: c.y - h / 2, w, h, color: rng.pick(TOWER_COLORS), roof: '#343a40', tall: true, site: null });
        trees.push({ x: bx + 40, y: by + 40, palm: true });
        trees.push({ x: bx + BLOCK - 40, y: by + BLOCK - 40, palm: true });
        continue;
      }
      // Ordinary blocks hold two houses or shops side by side.
      const split = rng.chance(0.5) ? 'v' : 'h';
      const gap = 46;
      if (split === 'v') {
        const w1 = rng.range(120, 180);
        const w2 = BLOCK - w1 - gap;
        const h = rng.range(130, 220);
        const y = by + (BLOCK - h) / 2;
        buildings.push({ x: bx + 14, y, w: w1, h, color: rng.pick(HOUSE_COLORS), roof: rng.pick(ROOF_COLORS), tall: false, site: null });
        buildings.push({ x: bx + 14 + w1 + gap, y, w: w2, h, color: rng.pick(HOUSE_COLORS), roof: rng.pick(ROOF_COLORS), tall: false, site: null });
      } else {
        const h1 = rng.range(120, 180);
        const h2 = BLOCK - h1 - gap;
        const w = rng.range(150, 260);
        const x = bx + (BLOCK - w) / 2;
        buildings.push({ x, y: by + 14, w, h: h1, color: rng.pick(HOUSE_COLORS), roof: rng.pick(ROOF_COLORS), tall: false, site: null });
        buildings.push({ x, y: by + 14 + h1 + gap, w, h: h2, color: rng.pick(HOUSE_COLORS), roof: rng.pick(ROOF_COLORS), tall: false, site: null });
      }
      // A street tree or two on ordinary blocks.
      if (rng.chance(0.6)) trees.push({ x: bx + rng.range(30, BLOCK - 30), y: by + rng.range(30, BLOCK - 30), palm: rng.chance(0.5) });
    }
  }

  // Hidden cash stashes on sidewalks, for the player to hunt down.
  const stashes = [];
  for (let s = 0; s < 12; s += 1) {
    const i = rng.int(0, GRID);
    const j = rng.int(0, GRID - 1);
    const onVertical = rng.chance(0.5);
    const x = onVertical ? roadCenter(i) + (rng.chance(0.5) ? -ROAD / 4 : ROAD / 4) : i * CELL + ROAD + rng.range(20, BLOCK - 20);
    const y = onVertical ? j * CELL + ROAD + rng.range(20, BLOCK - 20) : roadCenter(j) + (rng.chance(0.5) ? -ROAD / 4 : ROAD / 4);
    stashes.push({ x, y, taken: false });
  }

  return { buildings, trees, parks, stashes, sites: SITES };
}

// The centre of a named place, for missions and markers.
export function sitePosition(city, id) {
  const site = city.sites.find((s) => s.id === id);
  if (!site) return { x: WORLD / 2, y: WORLD / 2 };
  return blockCenter(site.i, site.j);
}

// Push a circle out of every building it overlaps and out of the map's edges.
// Returns true when anything was hit (the caller uses it for crash damage).
export function collideCircle(city, body, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * r;
      body.y = cy + (dy / d) * r;
    } else {
      // Dead centre inside the rect: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - r;
      else if (m === right) body.x = b.x + b.w + r;
      else if (m === top) body.y = b.y - r;
      else body.y = b.y + b.h + r;
    }
  }
  // The ocean swallows the south edge; the other edges are the map's end.
  if (body.x < r) { body.x = r; hit = true; }
  if (body.x > WORLD - r) { body.x = WORLD - r; hit = true; }
  if (body.y < r) { body.y = r; hit = true; }
  if (body.y > WORLD + 30 - r) { body.y = WORLD + 30 - r; hit = true; }
  return hit;
}

// True when the point is inside any building (bullets and line of sight use this).
export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}
