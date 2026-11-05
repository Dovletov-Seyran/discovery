import * as THREE from 'three';
import { L0, L1, xAtY } from './hullShape.js';

// Sky light (the environment map) does not reach below decks and under the quarterdeck. Every standard material
// darkens its indirect light by where the fragment is in the ship, not by where the camera is: the hold looks dark
// from the deck through the hatch too. Direct sun is left to the shadows; the lamps are point lights, untouched.
// Only on the open sea (zone 'ship'): `INTERIOR.on.value` is set by world/index.js.
const Y0 = -3.4, Y1 = 2.2, NZ = 64, NY = 16, SHADE = 0.22;

function hullMap() {
  const px = new Uint8Array(NZ * NY * 4);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NZ; i++) {
    const z = L0 + (L1 - L0) * i / (NZ - 1), y = Y0 + (Y1 - Y0) * j / (NY - 1);
    px[(j * NZ + i) * 4] = Math.round(THREE.MathUtils.clamp(xAtY(z, y) / 4, 0, 1) * 255);
    px[(j * NZ + i) * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(px, NZ, NY, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export const INTERIOR = { on: { value: 0 }, hull: { value: hullMap() } };

const PARS = `
uniform float uInterior;
uniform sampler2D uHullX;
float interiorShade(vec3 viewNormal) {
  if (uInterior < 0.5) return 1.0;
  mat3 toWorld = transpose(mat3(viewMatrix));
  vec3 w = cameraPosition + toWorld * (-vViewPosition);
  float zt = (w.z - (${L0.toFixed(2)})) / ${(L1 - L0).toFixed(2)};
  if (zt < 0.0 || zt > 1.0) return 1.0;
  float yt = (w.y - (${Y0.toFixed(2)})) / ${(Y1 - Y0).toFixed(2)};
  // the map holds its values at texel centres
  vec2 uv = (vec2(zt, yt) * vec2(${(NZ - 1).toFixed(1)}, ${(NY - 1).toFixed(1)}) + 0.5) / vec2(${NZ.toFixed(1)}, ${NY.toFixed(1)});
  float hx = texture2D(uHullX, uv).r * 4.0;
  // the hull's skin lies at hx: its outer face stays lit, anything facing inboard there (lining, floor edge) is inside
  bool outward = (toWorld * viewNormal).x * sign(w.x) > 0.25;
  float inside = step(abs(w.x), hx + (outward ? -0.03 : 0.03));
  float hold = 1.0 - step(-0.11, w.y); // under the main deck's planking (its underside is at −0.12)
  float cabin = step(4.9, w.z) * step(-0.02, w.y) * (1.0 - step(1.91, w.y)); // under the quarterdeck (its underside is at 1.88)
  return mix(1.0, ${SHADE}, inside * max(hold, cabin));
}
`;

const MAPS = `#include <lights_fragment_maps>
{
  float shade = interiorShade(geometryNormal);
  #if defined( RE_IndirectDiffuse )
    iblIrradiance *= shade; irradiance *= shade;
  #endif
  #if defined( RE_IndirectSpecular )
    radiance *= shade;
  #endif
}
`;

// Installed once for every MeshStandardMaterial / MeshPhysicalMaterial without its own onBeforeCompile.
let installed = false;
export function installInteriorLight() {
  if (installed) return;
  installed = true;
  const proto = THREE.MeshStandardMaterial.prototype;
  proto.onBeforeCompile = function (shader) {
    shader.uniforms.uInterior = INTERIOR.on;
    shader.uniforms.uHullX = INTERIOR.hull;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${PARS}\nvoid main() {`)
      .replace('#include <lights_fragment_maps>', MAPS);
  };
  proto.customProgramCacheKey = () => 'interior-light';
}
