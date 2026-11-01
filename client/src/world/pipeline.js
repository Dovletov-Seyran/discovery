import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Colour grade (saturation, contrast around mid-grey, a touch of warmth) on top of ACES.
// For low/high it runs inside every material's tone mapping, so there is no post-processing at all.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
  vec3 c = pow( ACESFilmicToneMapping( color ), vec3( 1.0 / 2.2 ) ); // grade in display space, like the ultra pass
  float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  c = mix( vec3( l ), c, 1.12 );
  c = ( c - 0.5 ) * 1.08 + 0.5;
  c *= vec3( 1.03, 1.0, 0.97 );
  return pow( clamp( c, 0.0, 1.0 ), vec3( 2.2 ) );
}`,
);

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.1);
      c = (c - 0.5) * 1.06 + 0.5; c *= vec3(1.03, 1.0, 0.97);
      vec2 d = vUv - 0.5; c *= 1.0 - vig * dot(d, d) * 2.2;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
};

// Presets (F1.1):
//   low   — direct render, pixel ratio 1, no shadows, small water reflection
//   high  — direct render with the canvas' own MSAA, shadows; pixel ratio up to 1.25
//   ultra — EffectComposer: GTAO at half resolution, bloom for lamps, vignette, SMAA
// MSAA on a half-float composer target alone cost ~13 ms on a full-screen Retina window, so the
// composer has no MSAA (SMAA instead) and low/high do not use a composer at all.
export class Pipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.composer = null;
  }

  build(quality) {
    this.quality = quality;
    this.composer?.dispose();
    this.composer = null; this.gtao = null; this.bloom = null;
    this.pixelRatio = { low: 1, high: Math.min(devicePixelRatio, 1.25), ultra: Math.min(devicePixelRatio, 1.5) }[quality];
    this.renderer.toneMapping = quality === 'ultra' ? THREE.ACESFilmicToneMapping : THREE.CustomToneMapping;
    if (quality === 'ultra') {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 8 });
      this.gtao.blendIntensity = 0.85;
      // half resolution: AO is soft anyway
      const setSize = this.gtao.setSize.bind(this.gtao);
      this.gtao.setSize = (w, h) => setSize(Math.ceil(w / 2), Math.ceil(h / 2));
      // sprites and points would be drawn as opaque quads into the AO normal/depth pass, and so would the
      // invisible hit boxes of interactables (material.userData.hitbox)
      const render = this.gtao.render.bind(this.gtao);
      this.gtao.render = (...args) => {
        const hidden = [];
        this.scene.traverseVisible((o) => { if (o.isSprite || o.isPoints || o.material?.userData?.hitbox) hidden.push(o); });
        hidden.forEach((o) => (o.visible = false));
        render(...args);
        hidden.forEach((o) => (o.visible = true));
      };
      this.composer.addPass(this.gtao);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.5, 1.6);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new ShaderPass(GradeShader));
      this.composer.addPass(new SMAAPass());
    }
    this.resize();
  }

  resize() {
    const c = this.renderer.domElement, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.pixelRatio); this.composer.setSize(w, h); }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(bloom) {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    this.bloom.strength = bloom; this.bloom.enabled = bloom > 0.02;
    this.composer.render();
  }
}
