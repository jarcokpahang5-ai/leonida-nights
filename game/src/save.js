// Saving and loading: one JSON blob in localStorage with the cash, health, ammo,
// mission progress, position and stats. Nothing leaves the browser.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      health: state.health,
      ammo: state.ammo,
      missionIndex: state.missionIndex,
      x: state.player.x,
      y: state.player.y,
      stats: state.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}
