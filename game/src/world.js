// The simulation of Palmera Bay: the player on foot and behind the wheel, traffic,
// pedestrians, police, the wanted level, combat, the taxi side job, shops, cash
// stashes and the six story missions. No drawing and no DOM here — step() takes the
// frame's input and the sound engine, advances one fixed step, and returns events.
import {
  AMMO_PACK, BLOCK, CAR_LENGTH, CAR_RADIUS, CAR_WIDTH, CELL, DAY_LENGTH, DAY_START,
  DESPAWN_RADIUS, GRID, HEAT_MAX, HEAT_PER_STAR, PISTOL_DAMAGE, PISTOL_RANGE,
  PISTOL_RATE, PLAYER_HEALTH, PLAYER_RADIUS, PRICE_AMMO, PRICE_HEAL, PRICE_REPAIR,
  ROAD, SPAWN_RADIUS, SPRINT_SPEED, STEP, TRAFFIC_TARGET, PED_TARGET, WALK_SPEED,
  WORLD, blockCenter, isOnRoad, roadCenter,
} from './config.js';
import { generateCity, sitePosition, collideCircle, pointInBuilding } from './city.js';
import { createCar, createCop, createPed, CAR_MODELS } from './entities.js';
import { MISSIONS, missionAt } from './missions.js';

export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;
export const EVENT_MISSION_DONE = 4;
export const EVENT_MISSION_FAIL = 8;
export const EVENT_PICKUP = 16;
export const EVENT_SHOP = 32;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function angleTo(from, to) {
  return Math.atan2(from.y - to.y, from.x - to.x);
}

function turnToward(angle, target, maxTurn) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return angle + Math.max(-maxTurn, Math.min(maxTurn, diff));
}

function hasLineOfSight(city, ax, ay, bx, by) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 40);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (pointInBuilding(city, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

export function createWorld(rng) {
  const city = generateCity(rng);
  const state = {
    city, rng,
    time: DAY_START, elapsed: 0,
    cash: 200, health: PLAYER_HEALTH, ammo: 120,
    heat: 0, wanted: 0, lastCrime: -1000,
    player: { x: 0, y: 0, angle: 0, onFoot: true, car: null, fireTimer: 0, invuln: 0 },
    cars: [], peds: [], cops: [], bullets: [], particles: [],
    missionIndex: 0, missionStage: 0, missionState: {}, missionActive: true,
    taxi: null, waitingFare: null, fareTimer: 0,
    message: '', messageTimer: 0,
    prompt: '',
    gameOver: null,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, fares: 0, stashes: 0 },
    stealTarget: null,
  };

  function showMessage(text, seconds = 4) {
    state.message = text;
    state.messageTimer = seconds;
  }

  function commitCrime(heat) {
    state.heat = Math.min(HEAT_MAX, state.heat + heat);
    state.lastCrime = state.elapsed;
  }

  function wantedFromHeat(heat) {
    let stars = 0;
    for (let s = 1; s <= 5; s += 1) if (heat >= HEAT_PER_STAR[s]) stars = s;
    return stars;
  }

  function addCash(amount) {
    state.cash = Math.max(0, state.cash + amount);
  }

  function burst(x, y, color, count, speed, life = 0.7, size = 4) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.range(0, TAU);
      const v = rng.range(speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rng.range(life * 0.5, life), maxLife: life, color, size: rng.range(size * 0.6, size * 1.4) });
    }
  }

  function explodeCar(car, audio) {
    burst(car.x, car.y, '#ff6d00', 26, 320, 0.9, 6);
    burst(car.x, car.y, '#ffb703', 18, 220, 0.6, 5);
    burst(car.x, car.y, '#5c677d', 12, 90, 1.6, 8);
    if (audio) audio.explosion();
    if (state.player.car === car) {
      state.player.car = null;
      state.player.onFoot = true;
      state.player.x = car.x + 40;
      state.player.y = car.y;
      state.player.health = Math.max(1, state.player.health - 40);
      state.player.invuln = 1.5;
      collideCircle(city, state.player, PLAYER_RADIUS);
    }
    const index = state.cars.indexOf(car);
    if (index !== -1) state.cars.splice(index, 1);
    commitCrime(10);
  }

  // --- spawning -------------------------------------------------------------
  function randomRoadPoint(minDist, maxDist) {
    for (let tries = 0; tries < 12; tries += 1) {
      const vertical = rng.chance(0.5);
      const i = rng.int(0, GRID);
      const along = rng.range(0, WORLD);
      const x = vertical ? roadCenter(i) : along;
      const y = vertical ? along : roadCenter(i);
      const d = Math.hypot(x - state.player.x, y - state.player.y);
      if (d >= minDist && d <= maxDist) return { x, y, vertical, i };
    }
    return null;
  }

  function spawnTrafficCar() {
    const spot = randomRoadPoint(280, SPAWN_RADIUS);
    if (!spot) return;
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = spot.vertical ? -dir * ROAD / 4 : dir * ROAD / 4;
    const car = createCar(rng,
      spot.vertical ? spot.x + lane : spot.x,
      spot.vertical ? spot.y : spot.y + lane,
      spot.vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      rng.int(0, CAR_MODELS.length - 1),
      { axis: spot.vertical ? 'y' : 'x', dir, lane, cruise: rng.range(120, 200) });
    state.cars.push(car);
  }

  function spawnParkedCar(modelIndex, x, y, angle, options = {}) {
    const car = createCar(rng, x, y, angle, modelIndex, { ...options, driver: false });
    state.cars.push(car);
    return car;
  }

  // A traffic car placed exactly on a road: axis 'x' drives along a horizontal
  // road (lane offset to the right), axis 'y' along a vertical one.
  function spawnTrafficAt(x, y, angle, axis, dir, cruise = 170) {
    const car = createCar(rng, x, y, angle, rng.int(0, CAR_MODELS.length - 1),
      { axis, dir, lane: axis === 'x' ? dir * ROAD / 4 : -dir * ROAD / 4, cruise });
    state.cars.push(car);
    return car;
  }

  // A patrol car placed for a chase: it drives itself, straight at the player.
  function spawnPoliceAt(x, y, angle) {
    const car = createCar(rng, x, y, angle, 0, { police: true, driver: true, axis: 'x', dir: 1 });
    state.cars.push(car);
    return car;
  }

  function spawnPed() {
    const spot = randomRoadPoint(200, SPAWN_RADIUS);
    if (!spot) return;
    // Pedestrians stand on the sidewalk beside the road, never in traffic.
    const side = rng.chance(0.5) ? -1 : 1;
    const x = spot.vertical ? spot.x + side * (ROAD / 2 + 14) : spot.x;
    const y = spot.vertical ? spot.y : spot.y + side * (ROAD / 2 + 14);
    const ped = createPed(rng, x, y);
    pickPedTarget(ped);
    state.peds.push(ped);
  }

  function pickPedTarget(ped) {
    // Stroll along the sidewalk of the road the ped is already on, in either
    // direction, so they stay out of traffic.
    const vi = Math.round((ped.x - ROAD / 2) / CELL);
    const hi = Math.round((ped.y - ROAD / 2) / CELL);
    const dv = Math.abs(ped.x - roadCenter(vi));
    const dh = Math.abs(ped.y - roadCenter(hi));
    const dir = rng.chance(0.5) ? 1 : -1;
    const dist = rng.range(200, 520);
    if (dv < dh) {
      ped.tx = ped.x;
      ped.ty = Math.max(40, Math.min(WORLD - 40, ped.y + dir * dist));
    } else {
      ped.tx = Math.max(40, Math.min(WORLD - 40, ped.x + dir * dist));
      ped.ty = ped.y;
    }
  }

  function spawnCopCar() {
    const spot = randomRoadPoint(420, 750);
    if (!spot) return null;
    const car = createCar(rng, spot.x, spot.y, Math.atan2(state.player.y - spot.y, state.player.x - spot.x),
      0, { police: true, driver: true, axis: spot.vertical ? 'y' : 'x', dir: 1 });
    state.cars.push(car);
    return car;
  }

  function spawnOnFootCop(x, y) {
    const cop = createCop(rng, x, y, true);
    state.cops.push(cop);
    return cop;
  }

  function spawnRival(x, y) {
    const ped = createPed(rng, x, y);
    ped.armed = true;
    ped.speed = 90;
    state.peds.push(ped);
    return ped;
  }

  // --- missions ---------------------------------------------------------------
  function stageTarget(stage) {
    if (stage.site === 'park') {
      // The Vipers hold Central Park, the park block at (6, 1).
      const park = city.parks[0];
      if (park) return { x: park.x + park.w / 2, y: park.y + park.h / 2 };
      return { x: WORLD / 2, y: WORLD / 2 };
    }
    if (stage.site) return sitePosition(city, stage.site);
    if (stage.i !== undefined) return blockCenter(stage.i, stage.j);
    return { x: WORLD / 2, y: WORLD / 2 };
  }

  function currentMission() {
    return missionAt(state.missionIndex);
  }

  function currentStage() {
    const mission = currentMission();
    if (!mission) return null;
    return mission.stages[state.missionStage] || null;
  }

  function beginStage() {
    const mission = currentMission();
    const stage = currentStage();
    state.missionState = { timer: 0, kills: 0, checkpoint: 0, spawned: false };
    if (!mission || !stage) return;
    if (stage.type === 'steal') {
      const spot = stageTarget(stage);
      state.stealTarget = spawnParkedCar(0, spot.x + 60, spot.y - 30, Math.PI / 2, { mission: 'steal', color: '#e63946' });
    } else if (stage.type === 'kill') {
      const spot = stageTarget(stage);
      const park = city.parks[0] || { x: spot.x, y: spot.y };
      for (let i = 0; i < stage.count; i += 1) {
        spawnRival(park.x + 60 + rng.range(-90, 90), park.y + 60 + rng.range(-90, 90));
      }
      state.missionState.spawned = true;
    } else if (stage.type === 'race') {
      state.missionState.timer = stage.seconds;
    }
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStage = 0;
    state.missionActive = true;
    state.stealTarget = null;
    beginStage();
    const mission = currentMission();
    if (mission) showMessage(`Mission: ${mission.title}`, 5);
  }

  function advanceStage() {
    const mission = currentMission();
    state.missionStage += 1;
    if (state.missionStage >= mission.stages.length) {
      addCash(mission.reward);
      state.stats.missionsDone += 1;
      showMessage(`Mission complete: ${mission.title}  +$${mission.reward}`, 6);
      state.missionActive = false;
      state.missionIndex += 1;
      state.missionStage = 0;
      if (currentMission()) startMission(state.missionIndex);
      return EVENT_MISSION_DONE;
    }
    beginStage();
    return 0;
  }

  function failMission() {
    showMessage('Mission failed — Vera is not impressed. Try again.', 5);
    startMission(state.missionIndex);
    return EVENT_MISSION_FAIL;
  }

  // --- combat -----------------------------------------------------------------
  function fireBullet(x, y, angle, from, damage) {
    state.bullets.push({ x, y, angle, speed: 900, from, damage, life: PISTOL_RANGE / 900 });
  }

  function killPed(ped, audio) {
    ped.down = true;
    ped.health = 0;
    burst(ped.x, ped.y, '#c1121f', 10, 140, 0.8, 4);
    state.stats.kills += 1;
    commitCrime(30);
    if (ped.armed) {
      state.missionState.kills += 1;
      showMessage(`Rival down (${state.missionState.kills}/${currentStage() ? currentStage().count : 0})`, 2);
    }
    if (state.waitingFare === ped) state.waitingFare = null;
    if (audio) audio.enemyShoot();
  }

  // --- player -----------------------------------------------------------------
  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      const d = dist2(car.x, car.y, state.player.x, state.player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function nearestSite(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const site of city.sites) {
      const p = sitePosition(city, site.id);
      const d = dist2(p.x, p.y, state.player.x, state.player.y);
      if (d < bestD) { bestD = d; best = { site, x: p.x, y: p.y }; }
    }
    return best;
  }

  function enterCar(car, audio) {
    if (car.driver && !car.police) {
      // Stealing a car someone is driving: the driver flees on foot.
      commitCrime(25);
      state.stats.carsStolen += 1;
      showMessage(`You stole a ${car.model.name}!`, 3);
      if (audio) audio.horn();
    } else if (car.police) {
      commitCrime(40);
      showMessage('You stole a police cruiser!', 3);
    }
    car.driver = false;
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = car.angle;
  }

  function exitCar() {
    const car = state.player.car;
    if (!car || Math.abs(car.speed) > 80) return false;
    state.player.car = null;
    state.player.onFoot = true;
    state.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
    state.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
    state.player.angle = car.angle;
    collideCircle(city, state.player, PLAYER_RADIUS);
    return true;
  }

  function useShop(site, audio) {
    if (site.id === 'gunshop') {
      if (state.cash < PRICE_AMMO) { showMessage('Not enough cash for ammo.', 3); return; }
      addCash(-PRICE_AMMO);
      state.ammo += AMMO_PACK;
      showMessage(`Bought ${AMMO_PACK} rounds. Ammo: ${state.ammo}`, 3);
    } else if (site.id === 'clinic') {
      if (state.cash < PRICE_HEAL) { showMessage('Not enough cash for treatment.', 3); return; }
      if (state.health >= PLAYER_HEALTH) { showMessage('You are already in full health.', 3); return; }
      addCash(-PRICE_HEAL);
      state.health = PLAYER_HEALTH;
      showMessage('Doc Marisol patched you up. Health full.', 3);
    } else if (site.id === 'garage') {
      const car = state.player.car;
      if (!car) { showMessage('Bring a car to repair it.', 3); return; }
      if (state.cash < PRICE_REPAIR) { showMessage('Not enough cash for repairs.', 3); return; }
      if (car.health >= 100) { showMessage('This car is already pristine.', 3); return; }
      addCash(-PRICE_REPAIR);
      car.health = 100;
      showMessage('Rico fixed your car. Good as new.', 3);
    } else {
      return;
    }
    if (audio) audio.cash();
  }

  function updatePlayerOnFoot(dt, input, audio) {
    const p = state.player;
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    collideCircle(city, p, PLAYER_RADIUS);
    p.angle = Math.atan2(input.mouseWorldY - p.y, input.mouseWorldX - p.x);
    if (p.fireTimer > 0) p.fireTimer -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (input.mouseDown && p.fireTimer <= 0) {
      if (state.ammo > 0) {
        state.ammo -= 1;
        p.fireTimer = PISTOL_RATE;
        fireBullet(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, p.angle, 'player', PISTOL_DAMAGE);
        burst(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, '#ffd60a', 3, 160, 0.15, 3);
        commitCrime(3);
        if (audio) audio.shoot();
      } else {
        p.fireTimer = 0.25;
        showMessage('Out of ammo — buy more at Ironworks Arms.', 3);
      }
    }
    if (input.actions & 4) { // ACTION_ENTER
      const car = nearestCar(95);
      if (car) {
        enterCar(car, audio);
        return;
      }
      const near = nearestSite(90);
      if (near && (near.site.id === 'gunshop' || near.site.id === 'clinic' || near.site.id === 'garage')) {
        useShop(near.site, audio);
      }
    }
    if (input.actions & 16) { // ACTION_RELOAD
      if (state.ammo === 0) showMessage('Out of ammo — buy more at Ironworks Arms.', 3);
      else showMessage(`Ammo: ${state.ammo}`, 2);
    }
  }

  function updateDriving(dt, input, audio) {
    const p = state.player;
    const car = p.car;
    if (!car) { p.onFoot = true; return; }
    const model = car.model;
    const forward = input.moveY < 0 ? 1 : input.moveY > 0 ? -0.5 : 0;
    const braking = input.moveY > 0 && car.speed > 20;
    if (forward !== 0) car.speed += forward * model.accel * dt * (braking ? 1.6 : 1);
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
    if (input.handbrake) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
    }
    car.speed = Math.max(-140, Math.min(model.top, car.speed));
    // Steering answers even at low speed (a parking turn), so a car pressed
    // against a wall can always turn away instead of staying wedged there.
    const steer = input.moveX * model.grip * (Math.abs(car.speed) > 10 ? 1 : 0.4) * (input.handbrake ? 1.5 : 1);
    car.angle += steer * dt * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 100 + 0.5);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Two collision circles, nose and tail, so the car slides along walls.
    const fx = nx + Math.cos(car.angle) * CAR_LENGTH * 0.32;
    const fy = ny + Math.sin(car.angle) * CAR_LENGTH * 0.32;
    const bx = nx - Math.cos(car.angle) * CAR_LENGTH * 0.32;
    const by = ny - Math.sin(car.angle) * CAR_LENGTH * 0.32;
    const front = { x: fx, y: fy };
    const back = { x: bx, y: by };
    const hitF = collideCircle(city, front, CAR_RADIUS * 0.8);
    const hitB = collideCircle(city, back, CAR_RADIUS * 0.8);
    if (hitF || hitB) {
      const impact = Math.abs(car.speed);
      car.x = (front.x + back.x) / 2;
      car.y = (front.y + back.y) / 2;
      if (impact > 120) {
        car.health -= impact * 0.06;
        burst(car.x, car.y, '#adb5bd', 6, 120, 0.5, 3);
        if (audio) audio.crash();
      }
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.health <= 0) explodeCar(car, audio);
    if (input.actions & 4) exitCar(); // ACTION_ENTER
    if (input.handbrake && Math.abs(car.speed) > 200 && rng.chance(dt * 8)) {
      state.particles.push({ x: car.x - Math.cos(car.angle) * 24, y: car.y - Math.sin(car.angle) * 24, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, color: '#adb5bd', size: 5 });
    }
  }

  // --- traffic, peds, cops ------------------------------------------------------
  function updateTraffic(dt) {
    for (const car of state.cars) {
      if (!car.driver || car.police || car === state.player.car) continue;
      // Slow down for the player's car ahead.
      let target = car.cruise;
      const pc = state.player.car;
      if (pc) {
        const d = Math.hypot(pc.x - car.x, pc.y - car.y);
        if (d < 110) {
          const ahead = Math.cos(car.angle) * (pc.x - car.x) + Math.sin(car.angle) * (pc.y - car.y);
          if (ahead > 0) target = 0;
        }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      const along = car.axis === 'x' ? car.x : car.y;
      const crossRoad = Math.round((along - ROAD / 2) / CELL);
      const centre = roadCenter(crossRoad);
      if (Math.abs(along - centre) < Math.abs(car.speed) * dt + 8 && crossRoad >= 0 && crossRoad <= GRID) {
        // At an intersection: mostly keep going, sometimes turn.
        if (rng.chance(0.35)) {
          const newDir = rng.chance(0.5) ? 1 : -1;
          if (car.axis === 'x') {
            // Turn onto the vertical road: snap onto its centre line, right-hand lane.
            car.x = centre - newDir * ROAD / 4;
            car.axis = 'y';
            car.dir = newDir;
            car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            // Turn onto the horizontal road: snap onto its centre line, right-hand lane.
            car.y = centre + newDir * ROAD / 4;
            car.axis = 'x';
            car.dir = newDir;
            car.angle = newDir > 0 ? 0 : Math.PI;
          }
        }
      }
      if (car.axis === 'x') car.x += car.dir * car.speed * dt;
      else car.y += car.dir * car.speed * dt;
      car.x = Math.max(10, Math.min(WORLD - 10, car.x));
      car.y = Math.max(10, Math.min(WORLD - 10, car.y));
    }
  }

  function updatePeds(dt, audio) {
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (ped.passenger) continue; // waiting for a taxi, standing still
      if (ped.armed) {
        // Rival gang member: hunt the player when close, shoot when in range.
        const d = Math.hypot(state.player.x - ped.x, state.player.y - ped.y);
        if (d < 420) {
          ped.angle = Math.atan2(state.player.y - ped.y, state.player.x - ped.x);
          if (d > 180) {
            ped.x += Math.cos(ped.angle) * ped.speed * dt;
            ped.y += Math.sin(ped.angle) * ped.speed * dt;
            collideCircle(city, ped, 12);
          } else if (ped.shootTimer === undefined || (ped.shootTimer -= dt) <= 0) {
            ped.shootTimer = rng.range(0.8, 1.4);
            if (hasLineOfSight(city, ped.x, ped.y, state.player.x, state.player.y)) {
              fireBullet(ped.x, ped.y, ped.angle + rng.range(-0.12, 0.12), 'enemy', 9);
              if (audio) audio.enemyShoot();
            }
          }
        }
        continue;
      }
      if (ped.panic > 0) {
        ped.panic -= dt;
        ped.x += Math.cos(ped.angle) * 260 * dt;
        ped.y += Math.sin(ped.angle) * 260 * dt;
        collideCircle(city, ped, 12);
        continue;
      }
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        ped.wait -= dt;
        if (ped.wait <= 0) {
          pickPedTarget(ped);
          ped.wait = rng.range(0, 3);
        }
        continue;
      }
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * ped.speed * dt;
      ped.y += (dy / d) * ped.speed * dt;
      collideCircle(city, ped, 12);
    }
  }

  function updateCops(dt, audio) {
    const p = state.player;
    // Spawn patrol cars to match the wanted level.
    const wantCars = state.wanted > 0 ? Math.min(state.wanted + 1, 5) : 0;
    const activeCars = state.cars.filter((c) => c.police && c.driver).length;
    if (activeCars < wantCars && rng.chance(dt * 1.2)) spawnCopCar();
    if (state.wanted >= 2) {
      const onFoot = state.cops.filter((c) => c.onFoot).length;
      if (onFoot < Math.min(state.wanted, 3) && rng.chance(dt * 0.8) && p.onFoot) {
        const a = rng.range(0, TAU);
        spawnOnFootCop(p.x + Math.cos(a) * 380, p.y + Math.sin(a) * 380);
      }
    }
    for (const car of state.cars) {
      if (!car.police || !car.driver) continue;
      const target = Math.atan2(p.y - car.y, p.x - car.x);
      car.angle = turnToward(car.angle, target, car.model.grip * dt * 1.4);
      car.speed += (car.model.top * 0.92 - car.speed) * Math.min(1, dt * 1.2);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const probe = { x: nx, y: ny };
      if (collideCircle(city, probe, CAR_RADIUS * 0.8)) {
        car.speed *= 0.4;
        car.angle += 0.6; // steer away from the wall
      }
      car.x = probe.x;
      car.y = probe.y;
      // Ram the player's car.
      const pc = state.player.car;
      if (pc && pc !== car && dist2(car.x, car.y, pc.x, pc.y) < (CAR_RADIUS * 2) ** 2) {
        pc.health -= 14 * dt;
        car.speed *= 0.6;
        if (rng.chance(dt * 4) && audio) audio.crash();
      }
      // A cop car close to a player on foot sends its officer out.
      if (p.onFoot && state.wanted >= 1 && dist2(car.x, car.y, p.x, p.y) < 130 * 130 && state.cops.filter((c) => c.onFoot).length < 3) {
        car.driver = false;
        const cop = spawnOnFootCop(car.x + 30, car.y + 30);
        cop.car = car;
      }
    }
    for (const cop of state.cops) {
      if (!cop.onFoot) continue;
      const d = Math.hypot(p.x - cop.x, p.y - cop.y);
      if (p.onFoot && d < 30) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 1.2) {
          state.gameOver = 'busted';
          return EVENT_BUSTED;
        }
      } else {
        cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
      }
      if (d > 700) continue;
      cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
      if (d > 26) {
        cop.x += Math.cos(cop.angle) * 235 * dt;
        cop.y += Math.sin(cop.angle) * 235 * dt;
        collideCircle(city, cop, 12);
      }
      cop.shootTimer -= dt;
      if (d < 300 && cop.shootTimer <= 0 && hasLineOfSight(city, cop.x, cop.y, p.x, p.y)) {
        cop.shootTimer = rng.range(0.8, 1.3);
        fireBullet(cop.x, cop.y, cop.angle + rng.range(-0.1, 0.1), 'enemy', 8);
        if (audio) audio.enemyShoot();
      }
    }
    return 0;
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && pointInBuilding(city, b.x, b.y)) {
        burst(b.x, b.y, '#ffd60a', 3, 100, 0.2, 2);
        dead = true;
      }
      if (!dead && b.from === 'player') {
        for (const ped of state.peds) {
          if (ped.down) continue;
          if (dist2(b.x, b.y, ped.x, ped.y) < 17 * 17) {
            ped.health -= b.damage;
            burst(b.x, b.y, '#c1121f', 5, 120, 0.5, 3);
            if (ped.health <= 0) killPed(ped, null);
            else {
              ped.panic = 3;
              ped.angle = Math.atan2(ped.y - state.player.y, ped.x - state.player.x);
            }
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of state.cops) {
            if (!cop.onFoot) continue;
            if (dist2(b.x, b.y, cop.x, cop.y) < 17 * 17) {
              cop.health -= b.damage;
              burst(b.x, b.y, '#4361ee', 5, 120, 0.5, 3);
              commitCrime(15);
              if (cop.health <= 0) {
                cop.health = 0;
                cop.onFoot = false;
                cop.dead = true;
                state.stats.kills += 1;
                commitCrime(40);
              }
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const car of state.cars) {
            if (dist2(b.x, b.y, car.x, car.y) < CAR_RADIUS * CAR_RADIUS) {
              car.health -= b.damage * 0.6;
              burst(b.x, b.y, '#ffd60a', 3, 100, 0.25, 2);
              if (car.health <= 0) explodeCar(car, null);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && b.from === 'enemy') {
        const p = state.player;
        if (p.onFoot && dist2(b.x, b.y, p.x, p.y) < 17 * 17) {
          if (p.invuln <= 0) {
            p.health -= b.damage;
            p.invuln = 0.25;
            burst(p.x, p.y, '#c1121f', 5, 120, 0.5, 3);
          }
          dead = true;
        } else if (!p.onFoot && p.car && dist2(b.x, b.y, p.car.x, p.car.y) < CAR_RADIUS * CAR_RADIUS) {
          p.car.health -= b.damage * 0.5;
          if (p.car.health <= 0) explodeCar(p.car, null);
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    state.cops = state.cops.filter((c) => !c.dead);
  }

  function updateCarPedCollisions(audio) {
    // Only the player's car and police cars run pedestrians over; ordinary
    // traffic shares the road with them and never mows them down.
    for (const car of state.cars) {
      if (car !== state.player.car && !car.police) continue;
      if (Math.abs(car.speed) < 60) continue;
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (dist2(car.x, car.y, ped.x, ped.y) < (CAR_RADIUS + 10) ** 2) {
          killPed(ped, null);
          burst(ped.x, ped.y, '#c1121f', 8, 160, 0.7, 4);
          if (car === state.player.car) {
            showMessage('You ran someone over!', 2);
          }
          if (audio) audio.crash();
        }
      }
    }
    // Player car vs traffic cars: bump and slow both down.
    const pc = state.player.car;
    if (pc) {
      for (const car of state.cars) {
        if (car === pc) continue;
        const d2 = dist2(pc.x, pc.y, car.x, car.y);
        if (d2 < (CAR_RADIUS * 2 - 6) ** 2 && d2 > 1) {
          const d = Math.sqrt(d2);
          const push = ((CAR_RADIUS * 2 - 6) - d) / 2;
          const nx = (car.x - pc.x) / d;
          const ny = (car.y - pc.y) / d;
          car.x += nx * push;
          car.y += ny * push;
          pc.x -= nx * push;
          pc.y -= ny * push;
          const impact = Math.abs(pc.speed - car.speed);
          if (impact > 100 && pc.crashTimer <= 0 && car.crashTimer <= 0) {
            pc.health -= impact * 0.03;
            car.health -= impact * 0.03;
            pc.crashTimer = 0.6;
            car.crashTimer = 0.6;
            if (audio) audio.crash();
          }
          pc.speed *= 0.9;
          const ahead = Math.cos(pc.angle) * nx + Math.sin(pc.angle) * ny;
          if (ahead > 0.3) {
            // Rear-ended: the car ahead is shoved up to speed rather than glued to the player.
            car.speed = Math.max(car.speed, pc.speed * 0.8);
          } else {
            car.speed *= 0.7;
          }
          if (car.health <= 0) explodeCar(car, audio);
          if (pc.health <= 0) explodeCar(pc, audio);
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - dt * 2;
      pt.vy *= 1 - dt * 2;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updatePickups(audio) {
    const p = state.player;
    for (const stash of city.stashes) {
      if (stash.taken) continue;
      if (dist2(p.x, p.y, stash.x, stash.y) < 30 * 30) {
        stash.taken = true;
        addCash(50);
        state.stats.stashes += 1;
        showMessage('Found a hidden stash: +$50', 3);
        if (audio) audio.pickup();
      }
    }
  }

  function updateTaxi(dt, input, audio) {
    const p = state.player;
    // A fare appears on a sidewalk near the player every so often.
    state.fareTimer -= dt;
    if (!state.waitingFare && !state.taxi && state.fareTimer <= 0) {
      const spot = randomRoadPoint(150, 500);
      if (spot) {
        const ped = createPed(rng, spot.x, spot.y);
        ped.passenger = true;
        ped.fare = rng.int(25, 70);
        state.peds.push(ped);
        state.waitingFare = ped;
      }
      state.fareTimer = 14;
    }
    if (state.waitingFare) {
      const fare = state.waitingFare;
      if (fare.down) state.waitingFare = null;
      else if (!p.onFoot && dist2(p.x, p.y, fare.x, fare.y) < 70 * 70 && (input.actions & 8)) {
        const site = rng.pick(city.sites);
        const dest = sitePosition(city, site.id);
        state.taxi = { ped: fare, dest, site, timer: Math.hypot(dest.x - p.x, dest.y - p.y) / 320 + 25, fare: fare.fare };
        state.peds.splice(state.peds.indexOf(fare), 1);
        state.waitingFare = null;
        showMessage(`Fare to ${site.name} — $${fare.fare}. Drive!`, 4);
        if (audio) audio.pickup();
      }
    }
    if (state.taxi) {
      state.taxi.timer -= dt;
      if (dist2(p.x, p.y, state.taxi.dest.x, state.taxi.dest.y) < 90 * 90 && !p.onFoot) {
        addCash(state.taxi.fare);
        state.stats.fares += 1;
        showMessage(`Fare delivered: +$${state.taxi.fare}`, 3);
        if (audio) audio.cash();
        state.taxi = null;
      } else if (state.taxi.timer <= 0) {
        showMessage('The fare got tired of waiting and left.', 3);
        state.taxi = null;
      } else if (p.onFoot) {
        // Abandoning the fare mid-ride cancels it.
        state.taxi = null;
        showMessage('You ditched your fare.', 3);
      }
    }
  }

  function updateMissions(dt, audio) {
    if (!state.missionActive) return 0;
    const mission = currentMission();
    const stage = currentStage();
    if (!mission || !stage) return 0;
    const p = state.player;
    const target = stageTarget(stage);
    if (stage.type === 'goto' || stage.type === 'pickup' || stage.type === 'deliver') {
      const radius = stage.type === 'deliver' ? 110 : 95;
      const atTarget = dist2(p.x, p.y, target.x, target.y) < radius * radius;
      if (stage.type === 'deliver') {
        if (atTarget && !p.onFoot && p.car === state.stealTarget) return advanceStage();
        if (atTarget && p.onFoot) showMessage('Bring the car here — on foot will not do.', 2);
      } else if (atTarget) {
        if (stage.type === 'pickup') {
          state.heat = Math.max(state.heat, 120);
          state.lastCrime = state.elapsed;
          showMessage('Package grabbed — the cops are onto you!', 4);
        }
        return advanceStage();
      }
    } else if (stage.type === 'wait' || stage.type === 'hold') {
      const inside = dist2(p.x, p.y, target.x, target.y) < (stage.type === 'hold' ? 150 : 100) ** 2;
      if (inside) {
        state.missionState.timer += dt;
        if (state.missionState.timer >= stage.seconds) {
          if (stage.type === 'hold') {
            state.heat = Math.max(state.heat, 400);
            state.lastCrime = state.elapsed;
            showMessage('Vault emptied! Run — the whole city is coming!', 4);
          }
          return advanceStage();
        }
      }
    } else if (stage.type === 'steal') {
      if (!p.onFoot && p.car === state.stealTarget) {
        showMessage('That is the one. Now deliver it to Rico.', 3);
        return advanceStage();
      }
    } else if (stage.type === 'kill') {
      if (state.missionState.kills >= stage.count) return advanceStage();
    } else if (stage.type === 'race') {
      state.missionState.timer -= dt;
      const cp = stage.checkpoints[state.missionState.checkpoint];
      if (cp) {
        const pos = blockCenter(cp.i, cp.j);
        if (dist2(p.x, p.y, pos.x, pos.y) < 120 * 120) {
          state.missionState.checkpoint += 1;
          if (audio) audio.pickup();
          if (state.missionState.checkpoint >= stage.checkpoints.length) return advanceStage();
          showMessage(`Checkpoint ${state.missionState.checkpoint + 1}/${stage.checkpoints.length}`, 2);
        }
      }
      if (state.missionState.timer <= 0) return failMission();
    } else if (stage.type === 'escape') {
      if (dist2(p.x, p.y, target.x, target.y) < 100 * 100) {
        state.heat = 0;
        showMessage('You lost them. The score is yours.', 4);
        return advanceStage();
      }
    }
    return 0;
  }

  function updateWanted(dt) {
    state.wanted = wantedFromHeat(state.heat);
    if (state.heat > 0 && state.elapsed - state.lastCrime > 6) {
      const nearCop = state.cops.some((c) => dist2(c.x, c.y, state.player.x, state.player.y) < 350 * 350)
        || state.cars.some((c) => c.police && dist2(c.x, c.y, state.player.x, state.player.y) < 350 * 350);
      state.heat = Math.max(0, state.heat - (nearCop ? 3 : 9) * dt);
    }
  }

  function updatePrompt() {
    const p = state.player;
    let prompt = '';
    if (p.onFoot) {
      const car = nearestCar(95);
      if (car) prompt = `E — ${car.police ? 'Steal police cruiser' : `Enter ${car.model.name}`}`;
      else {
        const near = nearestSite(90);
        if (near) {
          if (near.site.id === 'gunshop') prompt = `E — Buy ammo ($${PRICE_AMMO})`;
          else if (near.site.id === 'clinic') prompt = `E — Get treated ($${PRICE_HEAL})`;
          else if (near.site.id === 'garage') prompt = `E — Repair ($${PRICE_REPAIR}) — bring a car`;
          else if (near.site.id === 'safehouse') prompt = 'Safehouse — progress is saved here';
        }
      }
      if (state.waitingFare && dist2(p.x, p.y, state.waitingFare.x, state.waitingFare.y) < 200 * 200) {
        prompt = 'Get in a car, then press T near a fare to pick them up';
      }
    } else {
      prompt = 'E — Get out    Space — Handbrake    M — Mute';
      if (state.taxi) prompt = `Fare: ${state.taxi.site.name} — ${Math.ceil(state.taxi.timer)}s left`;
    }
    state.prompt = prompt;
  }

  function maintainPopulation() {
    const traffic = state.cars.filter((c) => c.driver && !c.police).length;
    for (let i = traffic; i < TRAFFIC_TARGET; i += 1) spawnTrafficCar();
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.driver && !car.police && car !== state.player.car && car !== state.stealTarget
        && dist2(car.x, car.y, state.player.x, state.player.y) > DESPAWN_RADIUS * DESPAWN_RADIUS) {
        state.cars.splice(i, 1);
      }
    }
    const walking = state.peds.filter((ped) => !ped.down && !ped.passenger).length;
    for (let i = walking; i < PED_TARGET; i += 1) spawnPed();
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (!ped.armed && !ped.passenger && dist2(ped.x, ped.y, state.player.x, state.player.y) > DESPAWN_RADIUS * DESPAWN_RADIUS) {
        state.peds.splice(i, 1);
      }
    }
  }

  function reset() {
    state.time = DAY_START;
    state.elapsed = 0;
    state.cash = 200;
    state.health = PLAYER_HEALTH;
    state.ammo = 120;
    state.heat = 0;
    state.wanted = 0;
    state.lastCrime = -1000;
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.bullets = [];
    state.particles = [];
    state.taxi = null;
    state.waitingFare = null;
    state.fareTimer = 8;
    state.message = '';
    state.messageTimer = 0;
    state.gameOver = null;
    state.stats = { kills: 0, carsStolen: 0, missionsDone: 0, fares: 0, stashes: 0 };
    state.stealTarget = null;
    const home = sitePosition(city, 'safehouse');
    state.player.x = home.x;
    state.player.y = home.y + 120;
    state.player.angle = -Math.PI / 2;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.fireTimer = 0;
    state.player.invuln = 0;
    // A car of your own parked on the street in front of the safehouse, facing east.
    spawnParkedCar(1, home.x, roadCenter(3) + 24, 0, { color: '#457b9d' });
    maintainPopulation();
    startMission(0);
  }

  function respawn(spot) {
    const p = state.player;
    p.x = spot.x;
    p.y = spot.y;
    p.angle = 0;
    p.onFoot = true;
    p.car = null;
    p.health = PLAYER_HEALTH;
    p.invuln = 2;
    p.fireTimer = 0;
    state.heat = 0;
    state.wanted = 0;
    state.cops = [];
    state.bullets = [];
    // The police impound every patrol car on the scene.
    state.cars = state.cars.filter((c) => !c.police);
    addCash(-Math.floor(state.cash * 0.1));
    state.gameOver = null;
  }

  function step(dt, input, audio) {
    let events = 0;
    state.elapsed += dt;
    state.time = (state.time + (dt / DAY_LENGTH) * 24) % 24;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    if (state.gameOver) return events;

    if (state.player.onFoot) updatePlayerOnFoot(dt, input, audio);
    else updateDriving(dt, input, audio);
    if (state.gameOver) return events;

    updateTraffic(dt);
    updatePeds(dt, audio);
    events |= updateCops(dt, audio);
    if (state.gameOver) return events;
    for (const car of state.cars) if (car.crashTimer > 0) car.crashTimer -= dt;
    updateBullets(dt);
    updateCarPedCollisions(audio);
    updateParticles(dt);
    updatePickups(audio);
    updateTaxi(dt, input, audio);
    events |= updateMissions(dt, audio);
    updateWanted(dt);
    updatePrompt();
    maintainPopulation();

    if (state.player.health <= 0) {
      state.gameOver = 'wasted';
      if (audio) audio.wasted();
      events |= EVENT_WASTED;
      return events;
    }
    if (state.player.car && state.player.car.health <= 0) {
      // explodeCar already ejected the player; the check above keeps us safe.
    }
    return events;
  }

  // --- helpers the screenshot stager and the save system use ------------------
  function setWanted(stars) {
    state.heat = stars <= 0 ? 0 : HEAT_PER_STAR[Math.min(5, stars)];
    state.lastCrime = state.elapsed;
    state.wanted = wantedFromHeat(state.heat);
  }

  function teleport(x, y) {
    state.player.x = x;
    state.player.y = y;
    if (state.player.car) {
      state.player.car.x = x;
      state.player.car.y = y;
    }
  }

  function putPlayerInCar(car) {
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = car.angle;
    car.driver = false;
  }

  function applySave(save) {
    state.cash = save.cash ?? 200;
    state.health = save.health ?? PLAYER_HEALTH;
    state.ammo = save.ammo ?? 120;
    state.missionIndex = Math.min(save.missionIndex ?? 0, MISSIONS.length);
    state.stats = { ...state.stats, ...(save.stats || {}) };
    if (save.x !== undefined) {
      state.player.x = save.x;
      state.player.y = save.y;
      state.player.onFoot = true;
      state.player.car = null;
      // A saved spot is never inside a wall: push out of any building.
      collideCircle(city, state.player, PLAYER_RADIUS);
    }
    state.missionStage = 0;
    state.missionActive = state.missionIndex < MISSIONS.length;
    beginStage();
  }

  reset();
  return {
    state, reset, step, startMission, currentMission, currentStage, stageTarget,
    spawnParkedCar, spawnTrafficAt, spawnPoliceAt, spawnCopCar, spawnPed, spawnTrafficCar, putPlayerInCar,
    setWanted, teleport, explodeCar, respawn, applySave, showMessage, addCash,
    commitCrime,
  };
}
