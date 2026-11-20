// Drawing only: the world's state and the current screen in, pixels out. A camera
// follows the player across Palmera Bay; the HUD (cash, health, wanted stars, the
// mission objective, speed and a live minimap) is painted over the world, and the
// title, pause and game-over screens are panels drawn the same way.
import { BLOCK, CAR_LENGTH, CAR_WIDTH, CELL, GRID, ROAD, WORLD, blockCenter, roadCenter } from './config.js';
import { pointInBuilding } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const TAU = Math.PI * 2;

const PALETTE = {
  grass: '#7fb069',
  park: '#588157',
  sand: '#e9c46a',
  ocean: '#219ebc',
  oceanDeep: '#126782',
  road: '#3a3f4a',
  roadLine: '#e9c46a',
  sidewalk: '#adb5bd',
  text: '#f8f9fa',
  muted: '#ced4da',
  gold: '#f2c94c',
  red: '#e63946',
  blue: '#4361ee',
  panel: 'rgba(20, 24, 34, 0.92)',
};

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    camera.zoom = Math.min(canvas.width / 1280, canvas.height / 800) * 1.15;
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function screenSize() {
    return { w: canvas.width / camera.zoom, h: canvas.height / camera.zoom };
  }

  function worldToScreen(x, y) {
    return { x: (x - camera.x) * camera.zoom + canvas.width / 2, y: (y - camera.y) * camera.zoom + canvas.height / 2 };
  }

  // --- the world ------------------------------------------------------------
  function drawGround(view) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    // The south row is the beach: sand from the last blocks to the water's edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(view.x0, 9 * CELL + ROAD, view.x1 - view.x0, WORLD + 30 - (9 * CELL + ROAD));
    // The ocean south of the city, with a sand beach between it and the last road.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(view.x0, WORLD - ROAD, view.x1 - view.x0, ROAD + 60);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(view.x0, WORLD + 30, view.x1 - view.x0, view.y1 - (WORLD + 30));
    ctx.fillStyle = PALETTE.oceanDeep;
    for (let x = Math.floor(view.x0 / 260) * 260; x < view.x1; x += 260) {
      ctx.fillRect(x, WORLD + 90, 180, 4);
      ctx.fillRect(x + 90, WORLD + 170, 180, 4);
    }
    // Parks.
    for (const park of view.city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Streets: asphalt bands with a dashed centre line.
    ctx.fillStyle = PALETTE.road;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      ctx.fillRect(view.x0, c - ROAD / 2, view.x1 - view.x0, ROAD);
      ctx.fillRect(c - ROAD / 2, view.y0, ROAD, view.y1 - view.y0);
    }
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      ctx.moveTo(view.x0, c);
      ctx.lineTo(view.x1, c);
      ctx.moveTo(c, view.y0);
      ctx.lineTo(c, view.y1);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Sidewalks: pale borders around every block.
    ctx.strokeStyle = PALETTE.sidewalk;
    ctx.lineWidth = 10;
    for (let j = 0; j < GRID; j += 1) {
      for (let i = 0; i < GRID; i += 1) {
        ctx.strokeRect(i * CELL + ROAD + 5, j * CELL + ROAD + 5, BLOCK - 10, BLOCK - 10);
      }
    }
  }

  function drawBuildings(view) {
    for (const b of view.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      // Shadow, then the walls, then the roof line.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = shade(b.color, -28);
      ctx.fillRect(b.x, b.y, b.w, 10);
      ctx.fillRect(b.x, b.y, 10, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      if (b.tall) {
        // Tower windows.
        ctx.fillStyle = '#ffe66d';
        const cols = Math.floor(b.w / 34);
        const rows = Math.floor(b.h / 34);
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            if ((r * cols + c) % 3 !== 0) continue;
            ctx.fillRect(b.x + 14 + c * 34, b.y + 14 + r * 34, 14, 18);
          }
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h / 2 - 8, 24, 16);
      }
      if (b.site) {
        const site = view.city.sites.find((s) => s.id === b.site);
        if (site) text(site.label, b.x + b.w / 2, b.y + b.h / 2 + 34, 15, PALETTE.text, 'center', 'bold');
      }
    }
    for (const t of view.city.trees) {
      if (t.x < view.x0 || t.x > view.x1 || t.y < view.y0 || t.y > view.y1) continue;
      if (t.palm) {
        ctx.strokeStyle = '#7f4f24';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + 4, t.y - 22);
        ctx.stroke();
        ctx.fillStyle = '#2d6a4f';
        for (let f = 0; f < 5; f += 1) {
          const a = (f / 5) * TAU;
          ctx.beginPath();
          ctx.ellipse(t.x + 4 + Math.cos(a) * 12, t.y - 22 + Math.sin(a) * 7, 13, 5, a, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#6c584c';
        ctx.fillRect(t.x - 2, t.y - 4, 4, 12);
        ctx.fillStyle = '#40916c';
        ctx.beginPath();
        ctx.arc(t.x, t.y - 12, 13, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawCar(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.model.length;
    const wid = car.model.width;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-len / 2 + 4, -wid / 2 + 5, len, wid);
    ctx.fillStyle = car.police ? '#f8f9fa' : car.color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    if (car.police) {
      ctx.fillStyle = '#1d3557';
      ctx.fillRect(-len / 2 + 6, -wid / 2, len - 12, 7);
      ctx.fillRect(-len / 2 + 6, wid / 2 - 7, len - 12, 7);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(-4, -wid / 2 - 2, 8, 5);
      ctx.fillStyle = '#4361ee';
      ctx.fillRect(-4, wid / 2 - 3, 8, 5);
    }
    if (car.taxi) {
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(-6, -wid / 2 - 3, 12, 6);
    }
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    ctx.roundRect(-len / 2 + 12, -wid / 2 + 5, 16, wid - 10, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(len / 2 - 26, -wid / 2 + 5, 12, wid - 10, 3);
    ctx.fill();
    // Headlights and taillights.
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 6);
    ctx.fillRect(len / 2 - 3, wid / 2 - 9, 3, 6);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 6);
    ctx.fillRect(-len / 2, wid / 2 - 9, 3, 6);
    if (car.mission) {
      ctx.fillStyle = '#f2c94c';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('★', 0, -wid / 2 - 8);
    }
    ctx.restore();
    if (isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 34, 0, TAU);
      ctx.stroke();
    }
    if (car.health < 60) {
      ctx.fillStyle = 'rgba(90,90,90,0.7)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.angle) * 10, car.y - Math.sin(car.angle) * 10, 8 + Math.random() * 4, 0, TAU);
      ctx.fill();
    }
  }

  function drawPed(ped) {
    if (ped.down) {
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 2, ped.y + 3, 11, 9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.pants;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 4.5, 0, TAU);
    ctx.fill();
    if (ped.armed) {
      ctx.strokeStyle = '#212529';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ped.x + Math.cos(ped.angle) * 6, ped.y + Math.sin(ped.angle) * 6);
      ctx.lineTo(ped.x + Math.cos(ped.angle) * 16, ped.y + Math.sin(ped.angle) * 16);
      ctx.stroke();
      text('!', ped.x, ped.y - 16, 15, '#e63946', 'center', 'bold');
    }
    if (ped.passenger) {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y - 20, 10, 0, TAU);
      ctx.fill();
      text('!', ped.x, ped.y - 15, 14, '#212529', 'center', 'bold');
    }
  }

  function drawCop(cop) {
    ctx.fillStyle = '#1d3557';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#4361ee';
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(cop.x + Math.cos(cop.angle) * 3, cop.y + Math.sin(cop.angle) * 3, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d3557';
    ctx.fillRect(cop.x - 6, cop.y - 15, 12, 4);
    if (cop.bustTimer > 0) {
      ctx.fillStyle = '#e63946';
      ctx.fillRect(cop.x - 14, cop.y - 26, 28 * Math.min(1, cop.bustTimer / 1.2), 4);
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p.onFoot) return;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0;
    if (blink) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 4, 12, 10, 0, 0, TAU);
    ctx.fill();
    // Mako: teal jacket, dark jeans, the white arrow above him.
    ctx.fillStyle = '#212529';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a9d8f';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4, 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
    ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 24);
    ctx.lineTo(p.x - 7, p.y - 34);
    ctx.lineTo(p.x + 7, p.y - 34);
    ctx.closePath();
    ctx.fill();
  }

  function drawMarker(x, y, color, label) {
    const bob = Math.sin(performance.now() / 300) * 6;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(x, y, 46, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y + bob - 30);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-11, -11, 22, 22);
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 90 + bob);
    ctx.lineTo(x, y - 30 + bob);
    ctx.stroke();
    if (label) text(label, x, y - 100 + bob, 16, color, 'center', 'bold');
  }

  function drawWorld(state) {
    const size = screenSize();
    const view = {
      x0: camera.x - size.w / 2 - 60,
      y0: camera.y - size.h / 2 - 60,
      x1: camera.x + size.w / 2 + 60,
      y1: camera.y + size.h / 2 + 60,
      city: state.city,
    };
    drawGround(view);
    drawBuildings(view);
    // Cash stashes glint on the sidewalk.
    for (const stash of state.city.stashes) {
      if (stash.taken) continue;
      if (stash.x < view.x0 || stash.x > view.x1 || stash.y < view.y0 || stash.y > view.y1) continue;
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(stash.x, stash.y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#212529';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', stash.x, stash.y + 4);
    }
    // Mission marker and taxi destination.
    const stage = state.missionStageInfo;
    if (state.missionActive && stage && stage.target) {
      drawMarker(stage.target.x, stage.target.y, '#f2c94c', stage.label || null);
    }
    if (state.taxi) drawMarker(state.taxi.dest.x, state.taxi.dest.y, '#48cae4', 'FARE');
    if (state.waitingFare) {
      const f = state.waitingFare;
      drawMarker(f.x, f.y, '#f2c94c', `$${f.fare}`);
    }
    for (const car of state.cars) drawCar(car, state.player.car === car);
    for (const ped of state.peds) drawPed(ped);
    for (const cop of state.cops) if (cop.onFoot) drawCop(cop);
    drawPlayer(state);
    for (const b of state.bullets) {
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 12, b.y - Math.sin(b.angle) * 12);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Night falls: a blue tint deepens with the hour, and headlights glow.
    const hour = state.time;
    const night = hour < 5 || hour > 19 ? 0.35 : hour < 6.5 || hour > 17.5 ? 0.18 : 0;
    if (night > 0) {
      ctx.fillStyle = `rgba(10, 20, 60, ${night})`;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    }
  }

  // --- the HUD ----------------------------------------------------------------
  function drawStars(wanted, x, y) {
    for (let s = 0; s < 5; s += 1) {
      const filled = s < wanted;
      const blink = filled && wanted >= 4 && Math.floor(performance.now() / 250) % 2 === 0;
      ctx.fillStyle = filled ? (blink ? '#ff758f' : '#ffd60a') : 'rgba(255,255,255,0.35)';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('★', x + s * 30, y);
    }
  }

  function drawMinimap(state, x, y, size) {
    const scale = size / WORLD;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
    ctx.fillRect(x - 6, y - 6, size + 12, size + 12);
    ctx.strokeStyle = '#f8f9fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 6, y - 6, size + 12, size + 12);
    ctx.fillStyle = '#3a3f4a';
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i) * scale;
      ctx.fillRect(x, y + c - 2, size, 4);
      ctx.fillRect(x + c - 2, y, 4, size);
    }
    ctx.fillStyle = '#219ebc';
    ctx.fillRect(x, y + size - 6, size, 6);
    for (const site of state.city.sites) {
      const p = blockCenter(site.i, site.j);
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(x + p.x * scale - 2, y + p.y * scale - 2, 4, 4);
    }
    const stage = state.missionStageInfo;
    if (state.missionActive && stage && stage.target) {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(x + stage.target.x * scale, y + stage.target.y * scale, 5, 0, TAU);
      ctx.fill();
    }
    for (const car of state.cars) {
      if (!car.police) continue;
      ctx.fillStyle = '#4361ee';
      ctx.fillRect(x + car.x * scale - 2, y + car.y * scale - 2, 4, 4);
    }
    const p = state.player;
    ctx.save();
    ctx.translate(x + p.x * scale, y + p.y * scale);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHud(state, screenW, screenH) {
    const p = state.player;
    // Top-left: cash, health, ammo.
    ctx.fillStyle = 'rgba(10, 14, 22, 0.7)';
    ctx.fillRect(14, 12, 250, 92);
    text(`$${state.cash.toLocaleString('en-US')}`, 26, 42, 26, '#7bf1a8', 'left', 'bold');
    ctx.fillStyle = '#343a40';
    ctx.fillRect(26, 54, 200, 14);
    ctx.fillStyle = state.health > 50 ? '#7bf1a8' : state.health > 25 ? '#f2c94c' : '#e63946';
    ctx.fillRect(26, 54, 200 * Math.max(0, state.health / 100), 14);
    text('HEALTH', 26, 84, 12, PALETTE.muted);
    text(p.onFoot ? `AMMO ${state.ammo}` : `${p.car ? p.car.model.name : ''}`, 26, 100, 13, PALETTE.text);
    // Top-centre: wanted stars.
    drawStars(state.wanted, screenW / 2 - 75, 44);
    // Clock and district, top-right above the minimap.
    const hour = Math.floor(state.time);
    const mins = Math.floor((state.time - hour) * 60);
    const clock = `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    text(clock, screenW - 24, 30, 20, PALETTE.text, 'right', 'bold');
    text('PALMERA BAY', screenW - 24, 52, 12, PALETTE.muted, 'right');
    drawMinimap(state, screenW - 174, 66, 150);
    // Mission objective, bottom-left.
    const mission = state.missionInfo;
    if (mission) {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.7)';
      const lines = [mission.title, mission.objective];
      if (mission.timer !== undefined) lines.push(mission.timer);
      const w = 420;
      const h = 24 + lines.length * 24;
      ctx.fillRect(14, screenH - h - 14, w, h);
      text(lines[0], 26, screenH - h + 12, 15, '#f2c94c', 'left', 'bold');
      text(lines[1], 26, screenH - h + 36, 15, PALETTE.text);
      if (lines[2]) text(lines[2], 26, screenH - h + 60, 15, '#ff758f', 'left', 'bold');
    }
    // Speed and prompt, bottom-right.
    if (!p.onFoot && p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
      text(`${kmh}`, screenW - 24, screenH - 66, 44, PALETTE.text, 'right', 'bold');
      text('km/h', screenW - 24, screenH - 44, 13, PALETTE.muted, 'right');
      ctx.fillStyle = '#343a40';
      ctx.fillRect(screenW - 224, screenH - 30, 200, 10);
      ctx.fillStyle = p.car.health > 50 ? '#7bf1a8' : '#e63946';
      ctx.fillRect(screenW - 224, screenH - 30, 200 * Math.max(0, p.car.health / 100), 10);
    }
    if (state.prompt) {
      text(state.prompt, screenW / 2, screenH - 18, 16, '#ffd60a', 'center', 'bold');
    }
    // Centre message, wrapped so a long one never runs off the screen.
    if (state.message) {
      const words = state.message.split(' ');
      const lines = [''];
      for (const word of words) {
        const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
        if (next.length > 52 && lines[lines.length - 1]) lines.push(word);
        else lines[lines.length - 1] = next;
      }
      const shown = lines.slice(0, 3);
      ctx.font = `bold 22px ${FONT}`;
      const widest = Math.max(...shown.map((line) => ctx.measureText(line).width));
      ctx.fillStyle = 'rgba(10, 14, 22, 0.7)';
      ctx.fillRect(screenW / 2 - widest / 2 - 14, 66, widest + 28, shown.length * 28 + 12);
      shown.forEach((line, i) => text(line, screenW / 2, 96 + i * 28, 22, '#ffffff', 'center', 'bold'));
    }
    // Crosshair when on foot and aiming (mouse is in device pixels; the HUD is in screen units).
    if (p.onFoot && screenW > 0) {
      const m = state.mouseScreen;
      if (m) {
        const cx = m.x / camera.zoom;
        const cy = m.y / camera.zoom;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy);
        ctx.lineTo(cx - 6, cy);
        ctx.moveTo(cx + 6, cy);
        ctx.lineTo(cx + 15, cy);
        ctx.moveTo(cx, cy - 15);
        ctx.lineTo(cx, cy - 6);
        ctx.moveTo(cx, cy + 6);
        ctx.lineTo(cx, cy + 15);
        ctx.stroke();
      }
    }
    // Hurt flash.
    if (p.invuln > 0 && state.health < 40) {
      ctx.fillStyle = 'rgba(230, 57, 70, 0.18)';
      ctx.fillRect(0, 0, screenW, screenH);
    }
  }

  // --- screens ------------------------------------------------------------------
  function drawPanel(title, lines, prompt, selected = -1) {
    const w = 640;
    const lineH = 30;
    const h = 150 + lines.length * lineH + 70;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    text(title, canvas.width / 2, y + 72, 46, '#f2c94c', 'center', 'bold');
    lines.forEach((line, i) => {
      const isSel = i === selected;
      text(line, canvas.width / 2, y + 128 + i * lineH, 20, isSel ? '#ffffff' : PALETTE.muted, 'center', isSel ? 'bold' : '');
    });
    text(prompt, canvas.width / 2, y + h - 28, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, hasSave) {
    // The world is already painted behind this; the title is screen-space text.
    ctx.fillStyle = 'rgba(8, 10, 18, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    text('LEONIDA NIGHTS', canvas.width / 2, canvas.height / 2 - 130, 64, '#f2c94c', 'center', 'bold');
    text('An open-world crime story in Palmera Bay', canvas.width / 2, canvas.height / 2 - 92, 22, PALETTE.text, 'center');
    const options = hasSave
      ? ['Continue — pick up where you left off', 'New Game — start the story over', 'How to Play']
      : ['New Game — start the story', 'How to Play'];
    const sel = state.menuIndex ?? 0;
    options.forEach((opt, i) => {
      const isSel = i === sel;
      text(`${isSel ? '▶ ' : '   '}${opt}`, canvas.width / 2, canvas.height / 2 - 20 + i * 38, 22, isSel ? '#ffffff' : PALETTE.muted, 'center', isSel ? 'bold' : '');
    });
    text('WASD move · Mouse aim · Click shoot · E enter/exit car · Shift sprint · Space handbrake · T taxi · P pause', canvas.width / 2, canvas.height - 40, 15, PALETTE.muted, 'center');
  }

  function drawHowTo() {
    const lines = [
      'WASD / arrows — move or drive. Mouse — aim. Click — shoot.',
      'E — enter or steal a car, get out, or use a shop.',
      'Shift — sprint. Space — handbrake. T — pick up a taxi fare.',
      'R — check ammo. M — mute. P / Esc — pause.',
      'Commit crimes and the police come for you: lose them to cool off.',
      'Follow the yellow marker to work through Mako\'s six missions.',
      'Progress saves at the safehouse and from the pause menu.',
    ];
    drawPanel('How to Play', lines, 'Press Enter or click to go back');
  }

  function drawPaused(state, saveNote) {
    ctx.fillStyle = 'rgba(8, 10, 18, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const options = ['Resume', 'Save Game', 'How to Play', 'Quit to Title'];
    const sel = state.menuIndex ?? 0;
    drawPanel('Paused', options.map((o, i) => `${i === sel ? '▶ ' : '   '}${o}`), '↑ ↓ to choose · Enter to select', sel);
    if (saveNote) text(saveNote, canvas.width / 2, canvas.height - 60, 18, PALETTE.gold, 'center', 'bold');
  }

  function drawOver(state, kind) {
    ctx.fillStyle = 'rgba(8, 10, 18, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
    const lines = kind === 'busted'
      ? ['The Palmera police hauled you in.', `They took 10% of your cash. $${state.cash.toLocaleString('en-US')} left.`, 'Your story is not over yet.']
      : ['Palmera Bay got the better of you.', `They took 10% of your cash. $${state.cash.toLocaleString('en-US')} left.`, 'Doc Marisol patched you up.'];
    drawPanel(title, lines, 'Press Enter to get back on the streets');
  }

  /** Paint one frame. `ui` carries the screen name and menu state from main.js.
   *  The world is drawn under the camera transform; the HUD under a zoom-only
   *  transform (screen units); panels and titles under the identity transform. */
  function draw(state, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    camera.x = state.player.x;
    camera.y = state.player.y;
    const screenW = canvas.width / camera.zoom;
    const screenH = canvas.height / camera.zoom;
    // Centre the camera on the player: translate so the player sits mid-screen.
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom,
      canvas.width / 2 - camera.x * camera.zoom, canvas.height / 2 - camera.y * camera.zoom);
    drawWorld(state);
    if (ui.screen === SCREEN_TITLE) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawTitle(state, ui.hasSave);
      if (ui.showHelp) drawHowTo();
      return;
    }
    if (ui.screen === SCREEN_PLAY) {
      // HUD in screen units: zoom only, no camera translation.
      ctx.setTransform(camera.zoom, 0, 0, camera.zoom, 0, 0);
      drawHud(state, screenW, screenH);
    } else if (ui.screen === SCREEN_PAUSED) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (ui.showHelp) drawHowTo();
      else drawPaused(state, ui.saveNote);
    } else if (ui.screen === SCREEN_OVER) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawOver(state, ui.overKind || 'wasted');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, worldToScreen, camera };
}
