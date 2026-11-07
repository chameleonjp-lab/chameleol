// カメレオンの体の描き方。照明を使わず、面の縁（輪郭に近い所）だけを暗くし、小さな光沢を縁寄りに足して立体感を出す。
// 正面を向いた中央部分（視線と法線の内積が 0.9 以上）は、設定した体色をそのまま出す。
// これにより、判定の体色・プレビュー・画面上の体の中央が同じ8ビット値になる（仕様 COLOR-03「立体感は比較を妨げない部位で表す」）。
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHADE = /* glsl */ `
  uniform float uRim;
  uniform float uGloss;
  uniform vec3 uLightDir;
  varying vec3 vN;
  varying vec3 vV;
  vec3 shade(vec3 base) {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    // 縁だけ暗く（ndv が 0.45 以上なら変えない）
    float rim = 1.0 - smoothstep(0.0, 0.45, ndv);
    vec3 c = base * (1.0 - uRim * rim);
    // 光沢は縁寄り（ndv が 0.9 以上の中央には足さない）
    vec3 h = normalize(normalize(uLightDir) + v);
    float spec = pow(clamp(dot(n, h), 0.0, 1.0), 40.0) * uGloss * (1.0 - smoothstep(0.8, 0.9, ndv));
    return c + vec3(spec);
  }
`;

const SKIN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  ${SHADE}
  void main() {
    gl_FragColor = vec4(shade(uColor), 1.0);
  }
`;

// 目：白地に黒い渦の模様を、目の地色と渦の色に塗り分ける
const EYE_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uSpiral;
  uniform sampler2D uMask;
  varying vec2 vUv;
  ${SHADE}
  void main() {
    float m = texture2D(uMask, vUv).r;
    gl_FragColor = vec4(shade(mix(uSpiral, uBase, m)), 1.0);
  }
`;

const LIGHT_DIR = new THREE.Vector3(-0.45, 0.75, 0.55).normalize();

export function createSkinMaterial({ color = [0.35, 0.77, 0.24], rim = 0.42, gloss = 0.45 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(...color) },
      uRim: { value: rim },
      uGloss: { value: gloss },
      uLightDir: { value: LIGHT_DIR.clone() },
    },
    vertexShader: VERTEX,
    fragmentShader: SKIN_FRAGMENT,
  });
}

export function createEyeMaterial(maskTexture, { rim = 0.35, gloss = 0.6 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Vector3(0.45, 0.83, 0.33) },
      uSpiral: { value: new THREE.Vector3(0.984, 1, 0.965) },
      uMask: { value: maskTexture },
      uRim: { value: rim },
      uGloss: { value: gloss },
      uLightDir: { value: LIGHT_DIR.clone() },
    },
    vertexShader: VERTEX,
    fragmentShader: EYE_FRAGMENT,
  });
}

/** 渦巻きの模様（白地に黒い線）。エディターの drawEye と同じ形。 */
export function createSpiralMask({ turns = 3.862, width = 26.08 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const A = turns * Math.PI * 2;
  const k = 158 / A;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = '#000000';
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  for (let a = 0; a <= A; a += 0.05) {
    const r = 8 + a * k;
    const x = 256 + Math.cos(a) * r;
    const y = 256 + Math.sin(a) * r;
    if (a) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}
