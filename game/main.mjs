import { createGameShell } from './ui/game-shell.mjs';

const root = document.querySelector('#game-root');
const shell = createGameShell(root, {
  onNewGame() {},
  onTeacherBrowse() {},
  onSettings() {}
});

shell.showMainMenu({ hasSave: false });
root.dataset.shellReady = 'true';
