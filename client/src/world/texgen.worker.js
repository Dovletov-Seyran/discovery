import { recipes } from './texgen.js';

self.onmessage = ({ data: { quality } }) => {
  for (const [name, make] of Object.entries(recipes(quality))) {
    const set = make();
    self.postMessage({ name, set }, Object.values(set).map((img) => img.data.buffer));
  }
  self.postMessage({ done: true });
};
