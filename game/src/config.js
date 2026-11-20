// Leonida Nights — tuning constants shared by every system of the game.
// All distances are in world pixels, all times in seconds, all money in dollars.
export const GRID = 10; // blocks per side of the city
export const BLOCK = 420; // size of one city block, in pixels
export const ROAD = 96; // width of every street, in pixels
export const CELL = BLOCK + ROAD; // block + street, the city grid pitch
export const WORLD = GRID * CELL + ROAD; // full city width/height, in pixels
export const STEP = 1 / 60; // fixed simulation step

export const SAVE_KEY = 'leonida-nights-save-v1';

export const PLAYER_RADIUS = 14;
export const WALK_SPEED = 205;
export const SPRINT_SPEED = 315;
export const PLAYER_HEALTH = 100;
export const PISTOL_DAMAGE = 34;
export const PISTOL_RATE = 0.16; // seconds between shots
export const PISTOL_RANGE = 520;

export const CAR_LENGTH = 56;
export const CAR_WIDTH = 27;
export const CAR_RADIUS = 26; // collision circle radius for a car

export const WANTED_MAX = 5;
export const HEAT_PER_STAR = [0, 40, 120, 200, 300, 400]; // heat thresholds for stars 0..5
export const HEAT_MAX = 500;

export const TRAFFIC_TARGET = 14; // traffic cars kept near the player
export const PED_TARGET = 18; // pedestrians kept near the player
export const SPAWN_RADIUS = 900; // cars and peds appear inside this radius
export const DESPAWN_RADIUS = 1300; // and vanish beyond this one

export const DAY_LENGTH = 360; // real seconds for one full in-game day
export const DAY_START = 10.5; // the story opens at 10:30 in the morning

// Prices at the city's shops.
export const PRICE_AMMO = 30;
export const AMMO_PACK = 60;
export const PRICE_HEAL = 40;
export const PRICE_REPAIR = 25;

// Centre of the road with index i (roads run 0..GRID on both axes).
export function roadCenter(i) {
  return i * CELL + ROAD / 2;
}

// True when the point sits on a street (rather than inside a block).
export function isOnRoad(x, y) {
  const mx = ((x % CELL) + CELL) % CELL;
  const my = ((y % CELL) + CELL) % CELL;
  return mx < ROAD || my < ROAD;
}

// Centre of the block at column i, row j.
export function blockCenter(i, j) {
  return { x: i * CELL + ROAD + BLOCK / 2, y: j * CELL + ROAD + BLOCK / 2 };
}
