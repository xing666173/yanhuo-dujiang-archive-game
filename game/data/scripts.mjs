import { prologue } from './prologue.mjs';
import { reeds } from './reeds.mjs';

export const scripts = {
  [prologue.id]: prologue,
  ...reeds
};
