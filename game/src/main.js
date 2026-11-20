// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, the renderer paints what is there. The game moves between four
// screens: title, play, paused and game over. Progress saves at the safehouse, from
// the pause menu, and automatically when a mission is completed.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|chase|mission|beach (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, blockCenter } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { hasSave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';
import { sitePosition } from './city.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);
const world = createWorld(rng);
// A debug handle for play-testing (and for the ?shot stager): the world and the screen.
window.__leonida = { world, get screen() { return screen; } };
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

let screen = SCREEN_TITLE;
let overKind = 'wasted';
let menuIndex = 0;
let showHelp = false;
let saveNote = '';
let savedFlag = hasSave();
let accumulator = 0;
let last = performance.now();

window.addEventListener('error', (event) => {
  status.textContent = `Error: ${event.message}`;
});

function announce(message) {
  status.textContent = message;
}

// The title menu's options depend on whether a save exists.
function titleOptions() {
  return savedFlag ? ['continue', 'new', 'help'] : ['new', 'help'];
}

function pauseOptions() {
  return ['resume', 'save', 'help', 'quit'];
}

function menuCount() {
  if (screen === SCREEN_TITLE) return titleOptions().length;
  if (screen === SCREEN_PAUSED) return pauseOptions().length;
  return 0;
}

// Arrow keys move the menu highlight; Enter/Space/click confirms.
window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowUp' || event.code === 'KeyW') {
    if (menuCount() > 0) {
      menuIndex = (menuIndex - 1 + menuCount()) % menuCount();
      audio.unlock();
      audio.click();
      event.preventDefault();
    }
  } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
    if (menuCount() > 0) {
      menuIndex = (menuIndex + 1) % menuCount();
      audio.unlock();
      audio.click();
      event.preventDefault();
    }
  }
});

// What the renderer needs about the mission, in plain words for the HUD.
function missionInfo() {
  const mission = world.currentMission();
  const stage = world.currentStage();
  if (!world.state.missionActive || !mission || !stage) return null;
  let objective = stage.text;
  if (stage.type === 'kill') objective = `Deal with the Vipers in Central Park (${world.state.missionState.kills}/${stage.count})`;
  if (stage.type === 'race') {
    objective = `Hit the checkpoints! (${world.state.missionState.checkpoint}/${stage.checkpoints.length})`;
  }
  const info = { title: `MISSION — ${mission.title}`, objective };
  if (stage.type === 'race') info.timer = `Time left: ${Math.max(0, Math.ceil(world.state.missionState.timer))}s`;
  if (stage.type === 'hold' || stage.type === 'wait') {
    info.timer = `${Math.floor(world.state.missionState.timer)}s / ${stage.seconds}s`;
  }
  return info;
}

// Where the yellow marker points: the current stage's target, or the active race checkpoint.
function missionStageInfo() {
  const stage = world.currentStage();
  if (!world.state.missionActive || !stage) return null;
  if (stage.type === 'race') {
    const cp = stage.checkpoints[world.state.missionState.checkpoint];
    if (!cp) return null;
    return { target: blockCenter(cp.i, cp.j), label: `CHECKPOINT ${world.state.missionState.checkpoint + 1}` };
  }
  return { target: world.stageTarget(stage), label: null };
}

function buildUi() {
  const state = world.state;
  state.missionInfo = missionInfo();
  state.missionStageInfo = missionStageInfo();
  state.menuIndex = menuIndex;
  return {
    screen,
    hasSave: savedFlag,
    menuIndex,
    showHelp,
    overKind,
    saveNote,
  };
}

function startNewGame() {
  world.reset();
  screen = SCREEN_PLAY;
  showHelp = false;
  saveNote = '';
  audio.unlock();
  audio.startMusic();
  announce('Playing Leonida Nights. Follow the yellow marker to your first mission.');
}

function continueGame() {
  const save = loadGame();
  world.reset();
  if (save) {
    world.applySave(save);
    world.showMessage('Welcome back to Palmera Bay.', 4);
  }
  screen = SCREEN_PLAY;
  showHelp = false;
  saveNote = '';
  audio.unlock();
  audio.startMusic();
  announce('Playing Leonida Nights.');
}

function doSave() {
  if (saveGame(world.state)) {
    savedFlag = true;
    saveNote = 'Game saved.';
    world.showMessage('Game saved.', 3);
  } else {
    saveNote = 'Could not save in this browser.';
  }
}

function handleTitleConfirm() {
  const option = titleOptions()[menuIndex];
  audio.unlock();
  audio.click();
  if (option === 'continue') continueGame();
  else if (option === 'new') startNewGame();
  else if (option === 'help') showHelp = true;
}

function handlePauseConfirm() {
  const option = pauseOptions()[menuIndex];
  audio.click();
  if (option === 'resume') {
    screen = SCREEN_PLAY;
    showHelp = false;
  } else if (option === 'save') {
    doSave();
  } else if (option === 'help') {
    showHelp = true;
  } else if (option === 'quit') {
    screen = SCREEN_TITLE;
    showHelp = false;
    menuIndex = 0;
    savedFlag = hasSave();
    audio.stopMusic();
    audio.engine(false, 0);
    audio.stopSiren();
  }
}

function handleOverConfirm() {
  screen = SCREEN_PLAY;
  audio.click();
  announce('Back on the streets of Palmera Bay.');
}

function handleActions(actions) {
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    world.showMessage(muted ? 'Sound muted.' : 'Sound on.', 2);
  }
  if (screen === SCREEN_TITLE) {
    if (showHelp && (actions & ACTION_CONFIRM)) {
      showHelp = false;
      return;
    }
    if (actions & ACTION_CONFIRM) handleTitleConfirm();
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (showHelp && (actions & ACTION_CONFIRM)) {
      showHelp = false;
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PLAY;
      showHelp = false;
      return;
    }
    if (actions & ACTION_CONFIRM) handlePauseConfirm();
    return;
  }
  if (screen === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM) handleOverConfirm();
    return;
  }
  if (actions & ACTION_PAUSE) {
    screen = SCREEN_PAUSED;
    menuIndex = 0;
    showHelp = false;
    saveNote = '';
    audio.engine(false, 0);
    announce('Paused.');
  }
}

function handleEvents(events) {
  const state = world.state;
  if (events & EVENT_WASTED) {
    overKind = 'wasted';
    screen = SCREEN_OVER;
    world.respawn(sitePosition(state.city, 'clinic'));
    audio.stopSiren();
    audio.engine(false, 0);
    announce('Wasted. Doc Marisol patched you up.');
  } else if (events & EVENT_BUSTED) {
    overKind = 'busted';
    screen = SCREEN_OVER;
    world.respawn(sitePosition(state.city, 'police'));
    audio.stopSiren();
    audio.engine(false, 0);
    announce('Busted. The police hauled you in.');
  }
  if (events & EVENT_MISSION_DONE) {
    audio.missionDone();
    doSave();
  }
  if (events & EVENT_MISSION_FAIL) {
    audio.wasted();
  }
}

function stepWorld() {
  const state = world.state;
  const ratio = window.devicePixelRatio || 1;
  const mouse = input.mouse();
  const mx = mouse.x * ratio;
  const my = mouse.y * ratio;
  const cam = renderer.camera;
  const worldMouseX = cam.x + (mx - canvas.width / 2) / cam.zoom;
  const worldMouseY = cam.y + (my - canvas.height / 2) / cam.zoom;
  state.mouseScreen = { x: mx, y: my };
  const actions = input.takeActions();
  handleActions(actions);
  if (screen !== SCREEN_PLAY) return;
  const frameInput = {
    moveX: input.moveX(),
    moveY: input.moveY(),
    sprint: input.sprint(),
    handbrake: input.handbrake(),
    mouseDown: mouse.down,
    mouseWorldX: worldMouseX,
    mouseWorldY: worldMouseY,
    actions,
  };
  const events = world.step(STEP, frameInput, audio);
  handleEvents(events);
  // Saving at the safehouse: press E near it on foot.
  if ((actions & ACTION_ENTER) && state.player.onFoot) {
    const home = sitePosition(state.city, 'safehouse');
    const d = Math.hypot(home.x - state.player.x, home.y - state.player.y);
    if (d < 110) doSave();
  }
  // Sound follows the world: engine, sirens, music.
  const car = state.player.car;
  audio.engine(!state.player.onFoot && car !== null, car ? Math.abs(car.speed) / car.model.top : 0);
  if (state.wanted > 0) audio.startSiren();
  else audio.stopSiren();
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (screen === SCREEN_TITLE) {
    // The title's backdrop city idles: traffic and pedestrians drift by.
    const actions = input.takeActions();
    handleActions(actions);
    while (accumulator >= STEP) {
      world.step(STEP, { moveX: 0, moveY: 0, sprint: false, handbrake: false, mouseDown: false, mouseWorldX: 0, mouseWorldY: 0, actions: 0 }, null);
      accumulator -= STEP;
    }
  } else if (screen === SCREEN_PLAY) {
    while (accumulator >= STEP) {
      stepWorld();
      accumulator -= STEP;
      if (screen !== SCREEN_PLAY) break;
    }
  } else {
    accumulator = 0;
    const actions = input.takeActions();
    handleActions(actions);
  }
  renderer.draw(world.state, buildUi());
}

// Leaving the tab pauses a running game rather than letting the city run unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) {
    screen = SCREEN_PAUSED;
    menuIndex = 0;
    showHelp = false;
    audio.engine(false, 0);
    announce('Paused.');
  }
});

function runShot(name) {
  const staged = stageShot(name, world);
  screen = staged.screen === 'play' ? SCREEN_PLAY : SCREEN_TITLE;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, buildUi());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else {
  announce('Leonida Nights. Press Enter to start.');
  requestAnimationFrame(frame);
}
