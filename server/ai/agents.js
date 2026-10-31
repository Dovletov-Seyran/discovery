import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AI } from './config.js';

const agents = new Map();

export function loadAgents() {
  agents.clear();
  for (const file of readdirSync(AI.AGENTS_DIR).filter((f) => f.endsWith('.json'))) {
    const agent = JSON.parse(readFileSync(join(AI.AGENTS_DIR, file), 'utf8'));
    agents.set(agent.id, agent);
  }
  return agents;
}

export function getAgent(id) {
  if (!agents.size) loadAgents();
  const agent = agents.get(id);
  if (!agent) throw new Error(`unknown agent: ${id}`);
  return agent;
}
