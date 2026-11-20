// The screenshot scenes behind ?shot=cover|chase|mission|beach. Each one plays the
// real rules forward from a fresh world for a short while — the player driving,
// the police chasing, a mission in progress — so the frame is what the game really
// looks like, and the same seed always gives the same frame. Traffic and patrol
// cars are placed on the same roads as the player so the scene reads at a glance.
import { STEP, roadCenter } from './config.js';

const IDLE_INPUT = { moveX: 0, moveY: 0, sprint: false, handbrake: false, mouseDown: false, mouseWorldX: 0, mouseWorldY: 0, actions: 0 };

function driveInput(world, ahead) {
  const p = world.state.player;
  const tx = p.x + Math.cos(p.angle) * ahead;
  const ty = p.y + Math.sin(p.angle) * ahead;
  return { ...IDLE_INPUT, moveY: -1, mouseWorldX: tx, mouseWorldY: ty };
}

function stepFor(world, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, inputFn ? inputFn(world) : IDLE_INPUT, null);
    if (world.state.gameOver) break;
  }
}

// Cover: Mako driving his Marea downtown in the afternoon, traffic around him,
// Vera's office marked on the HUD.
function stageCover(world) {
  world.reset();
  const state = world.state;
  state.time = 15.2;
  const spot = { x: roadCenter(5), y: roadCenter(3) + 24 };
  const car = world.spawnParkedCar(1, spot.x, spot.y, 0, { color: '#457b9d' });
  world.teleport(spot.x, spot.y);
  world.putPlayerInCar(car);
  // Traffic on the same street, ahead and behind, and crossing on the avenue.
  world.spawnTrafficAt(spot.x + 320, spot.y, 0, 'x', 1, 150);
  world.spawnTrafficAt(spot.x + 560, spot.y - 48, Math.PI, 'x', -1, 170);
  world.spawnTrafficAt(spot.x - 300, spot.y, 0, 'x', 1, 140);
  world.spawnTrafficAt(spot.x, spot.y - 320, -Math.PI / 2, 'y', -1, 160);
  world.spawnTrafficAt(spot.x, spot.y + 380, Math.PI / 2, 'y', 1, 150);
  for (let i = 0; i < 4; i += 1) world.spawnTrafficCar();
  stepFor(world, 1.4, (w) => driveInput(w, 400));
}

// Chase: three stars, two patrol cars closing in from behind on a night drive.
function stageChase(world) {
  world.reset();
  const state = world.state;
  state.time = 21.4;
  const spot = { x: roadCenter(4), y: roadCenter(5) - 24 };
  const car = world.spawnParkedCar(0, spot.x, spot.y, Math.PI, { color: '#e63946' });
  world.teleport(spot.x, spot.y);
  world.putPlayerInCar(car);
  world.setWanted(3);
  // Patrol cars behind the player, on the same street, already in pursuit.
  world.spawnPoliceAt(spot.x + 320, spot.y, Math.PI);
  world.spawnPoliceAt(spot.x + 520, spot.y - 48, Math.PI);
  world.spawnTrafficAt(spot.x - 420, spot.y - 48, Math.PI, 'x', -1, 150);
  world.spawnTrafficAt(spot.x - 700, spot.y, 0, 'x', 1, 140);
  stepFor(world, 1.5, (w) => driveInput(w, 500));
}

// Mission: on foot in Central Park, the Vipers closing in, the objective on the HUD.
function stageMission(world) {
  world.reset();
  const state = world.state;
  state.time = 11.0;
  world.startMission(3); // Payback: the Vipers in the park.
  const park = state.city.parks[0];
  const px = park.x + park.w / 2;
  const py = park.y + park.h / 2;
  world.teleport(px - 220, py + 90);
  stepFor(world, 0.8, (w) => ({ ...IDLE_INPUT, mouseWorldX: px, mouseWorldY: py }));
}

// Beach: a sunset drive on the sand itself, the ocean at the bottom of the frame,
// the boardwalk and the city behind.
function stageBeach(world) {
  world.reset();
  const state = world.state;
  state.time = 18.4;
  const spot = { x: 1500, y: 5050 };
  const car = world.spawnParkedCar(5, spot.x, spot.y, 0, { color: '#f3722c' });
  world.teleport(spot.x, spot.y);
  world.putPlayerInCar(car);
  // A couple of cars cruising the boardwalk road above the sand.
  world.spawnTrafficAt(spot.x + 260, roadCenter(9) - 24, 0, 'x', 1, 150);
  world.spawnTrafficAt(spot.x - 350, roadCenter(9) + 24, Math.PI, 'x', -1, 140);
  for (let i = 0; i < 4; i += 1) world.spawnPed();
  stepFor(world, 1.4, (w) => driveInput(w, 400));
}

export function stageShot(name, world) {
  if (name === 'chase') stageChase(world);
  else if (name === 'mission') stageMission(world);
  else if (name === 'beach') stageBeach(world);
  else stageCover(world);
  return { screen: 'play' };
}
