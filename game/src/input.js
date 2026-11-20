// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter a car, pause, confirm) are queued and taken once, so a press between two
// frames is never lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_TAXI = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;

const MOVE = {
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
};
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const TAXI = new Set(['KeyT']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    const code = codeOf(event);
    held.add(code);
    if (event.repeat) return;
    if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (TAXI.has(code)) actions |= ACTION_TAXI;
    else if (RELOAD.has(code)) actions |= ACTION_RELOAD;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    if (MOVE.up.has(code) || MOVE.down.has(code) || MOVE.left.has(code) || MOVE.right.has(code) || CONFIRM.has(code) || code === 'Space') {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(codeOf(event));
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    // -1/0/1 steering from held keys.
    moveX() {
      return (has(MOVE.right) ? 1 : 0) - (has(MOVE.left) ? 1 : 0);
    },
    moveY() {
      return (has(MOVE.down) ? 1 : 0) - (has(MOVE.up) ? 1 : 0);
    },
    sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    handbrake() {
      return held.has('Space');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    // The one-shot presses since the last call, as ACTION_* flags.
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // True while the named key is held (for menu navigation).
    isDown(code) {
      return held.has(code);
    },
  };
}
