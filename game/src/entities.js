// The people and vehicles of Palmera Bay: car models with their own handling, and
// factories for traffic cars, pedestrians and police. The sim moves them; render.js
// draws them. All names and models are original to this game.
import { CAR_LENGTH, CAR_WIDTH } from './config.js';

// Original models: a quick coupe, a workhorse sedan, a family SUV, a van, a pickup
// and a beach buggy. accel is px/s^2, top is px/s, grip steers how sharply it turns.
export const CAR_MODELS = [
  { name: 'Falco GT', color: '#e63946', accel: 420, top: 560, grip: 3.1, length: CAR_LENGTH, width: CAR_WIDTH },
  { name: 'Marea Sedan', color: '#457b9d', accel: 320, top: 430, grip: 2.7, length: CAR_LENGTH, width: CAR_WIDTH },
  { name: 'Caiman SUV', color: '#2a9d8f', accel: 300, top: 410, grip: 2.4, length: 60, width: 30 },
  { name: 'Tortuga Van', color: '#f4a261', accel: 260, top: 360, grip: 2.2, length: 64, width: 30 },
  { name: 'Duna Pickup', color: '#e9c46a', accel: 300, top: 420, grip: 2.5, length: 60, width: 28 },
  { name: 'Brisa Buggy', color: '#f3722c', accel: 360, top: 470, grip: 2.9, length: 52, width: 28 },
];

export const POLICE_MODEL = { name: 'Interceptor', color: '#1d3557', accel: 400, top: 520, grip: 3.0, length: CAR_LENGTH, width: CAR_WIDTH };

const PED_SHIRTS = ['#e63946', '#f4d35e', '#2a9d8f', '#ee964b', '#6d6875', '#84a98c', '#f28482', '#4361ee', '#e07a5f', '#90be6d'];
const PED_PANTS = ['#2b2d42', '#4a4e69', '#6c584c', '#3a506b', '#5c677d'];

export function createCar(rng, x, y, angle, modelIndex, options = {}) {
  const model = options.police ? POLICE_MODEL : CAR_MODELS[modelIndex % CAR_MODELS.length];
  return {
    x, y, angle, speed: 0,
    model, modelIndex,
    police: Boolean(options.police),
    taxi: Boolean(options.taxi),
    mission: options.mission || null, // 'steal' marks the car a mission wants
    health: 100,
    color: options.color || model.color,
    // Traffic cars follow a road: axis 'x' or 'y', direction +1 or -1, and a lane offset.
    axis: options.axis || 'x',
    dir: options.dir || 1,
    lane: options.lane || 0,
    cruise: options.cruise ?? rng.range(120, 200),
    driver: options.driver !== false, // false parks the car (no autopilot)
    honk: 0,
    smoke: 0,
    crashTimer: 0, // seconds until the next crash may hurt this car again
  };
}

export function createPed(rng, x, y) {
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    tx: x, ty: y, // current walking target
    speed: rng.range(45, 75),
    shirt: rng.pick(PED_SHIRTS),
    pants: rng.pick(PED_PANTS),
    panic: 0, // seconds of fleeing left
    armed: false, // rival gang members carry a pistol
    health: 100,
    down: false,
    passenger: false, // a taxi fare waiting for a ride
    fare: 0, // what the ride pays
    wait: rng.range(0, 2), // idle seconds before picking a new target
  };
}

export function createCop(rng, x, y, onFoot) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2),
    onFoot: Boolean(onFoot),
    speed: 0,
    health: 100,
    shootTimer: rng.range(0.4, 1),
    bustTimer: 0, // seconds spent touching the player: a full bar means busted
    car: null, // the patrol car this cop drives, when on foot after stepping out
  };
}
