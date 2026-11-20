// The story of Leonida Nights: six missions for Mako Reyes, fresh out of prison and
// back in Palmera Bay, working for the fixer Vera Solano. Each mission is a list of
// stages; the world advances a stage when its condition is met. Stages name a place
// by site id (city.js resolves it) or give explicit world coordinates.
export const MISSIONS = [
  {
    id: 'welcome-back',
    title: 'Welcome Back',
    briefing: "Vera Solano runs this town's favours. Drive to her office and hear her out.",
    reward: 150,
    stages: [
      { type: 'goto', site: 'vera', text: "Drive to Vera's Office" },
      { type: 'wait', site: 'vera', seconds: 3, text: 'Talk to Vera' },
      { type: 'goto', site: 'safehouse', text: 'Head home to the Safehouse' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    briefing: "Rico needs a Falco GT, the orange one parked by The Sandbar. Take it — quietly — and bring it to his garage.",
    reward: 300,
    stages: [
      { type: 'goto', site: 'garage', text: "See Rico at the Garage" },
      { type: 'steal', site: 'beachbar', text: 'Steal the orange Falco GT at The Sandbar' },
      { type: 'deliver', site: 'garage', text: 'Deliver the Falco GT to the Garage' },
    ],
  },
  {
    id: 'the-drop',
    title: 'The Drop',
    briefing: 'A package is waiting at the Portside Docks. Pick it up and run it to The Sandbar. The cops will be watching — move fast.',
    reward: 400,
    stages: [
      { type: 'pickup', site: 'docks', text: 'Pick up the package at the Docks', wanted: 2 },
      { type: 'deliver', site: 'beachbar', text: 'Deliver the package to The Sandbar' },
    ],
  },
  {
    id: 'payback',
    title: 'Payback',
    briefing: "The Vipers jumped Vera's courier in Central Park. Go settle it — four of them, armed. Then get home.",
    reward: 500,
    stages: [
      { type: 'kill', site: 'park', count: 4, text: 'Deal with the Vipers in Central Park (0/4)' },
      { type: 'goto', site: 'safehouse', text: 'Lose the heat — get to the Safehouse' },
    ],
  },
  {
    id: 'beach-run',
    title: 'Beach Run',
    briefing: 'Vera wants to know you can still drive. Hit every checkpoint along the beach road and downtown before the clock runs out.',
    reward: 350,
    stages: [
      { type: 'race', seconds: 100, text: 'Hit the checkpoints! (0/4)', checkpoints: [
        { i: 0, j: 9, label: 'Beach West' },
        { i: 9, j: 9, label: 'Marina' },
        { i: 9, j: 0, label: 'North End' },
        { i: 5, j: 5, label: 'Downtown' },
      ] },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    briefing: 'The Palmera Bay Bank. Walk in, empty the vault, and get out. The whole city will come down on you — make the safehouse.',
    reward: 1500,
    stages: [
      { type: 'goto', site: 'bank', text: 'Get to the Palmera Bay Bank' },
      { type: 'hold', site: 'bank', seconds: 12, text: 'Empty the vault — stay inside!' },
      { type: 'escape', site: 'safehouse', text: 'Escape to the Safehouse — 4 stars!' },
    ],
  },
];

// The mission the player is on, or null when the story is finished.
export function missionAt(index) {
  return index < MISSIONS.length ? MISSIONS[index] : null;
}
