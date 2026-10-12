import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type MemberCardData = {
  fullName?: string;
  title?: string;
  role?: string;
  memberId?: string;
  city?: string;
  approvedAt?: string | null;
  expiryYear?: number;
  expiresAt?: string;
  status?: string;
};

type CardMaps = {
  color: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
};

type CardEngine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cardGroup: THREE.Group;
  frontMaps: CardMaps;
  backMaps: CardMaps;
  frontOverlay: THREE.MeshPhysicalMaterial;
  backOverlay: THREE.MeshPhysicalMaterial;
  frontCanvas: HTMLCanvasElement;
  backCanvas: HTMLCanvasElement;
  frontRoughCanvas: HTMLCanvasElement;
  backRoughCanvas: HTMLCanvasElement;
  frontHeightCanvas: HTMLCanvasElement;
  backHeightCanvas: HTMLCanvasElement;
  frontContext: CanvasRenderingContext2D;
  backContext: CanvasRenderingContext2D;
  frontRoughContext: CanvasRenderingContext2D;
  backRoughContext: CanvasRenderingContext2D;
  frontHeightContext: CanvasRenderingContext2D;
  backHeightContext: CanvasRenderingContext2D;
  target: { x: number; y: number };
  current: { x: number; y: number };
  velocity: { x: number; y: number };
  dragging: boolean;
  previous: { x: number; y: number };
  cameraDistance: number;
  resizeObserver: ResizeObserver;
  animationFrame: number;
  disposed: boolean;
};

const CARD_WIDTH = 1.08;
const CARD_HEIGHT = 1.72;
const CARD_DEPTH = 0.01;
const CORNER_RADIUS = 0.085;
const BEVEL = 0.003;
const FACE_OFFSET = CARD_DEPTH / 2 + BEVEL + 0.0002;
const MAP_WIDTH = 512;
const MAP_HEIGHT = 816;
const NORMAL_WIDTH = 256;
const NORMAL_HEIGHT = 408;
const FRONT_INK = 'rgba(245,247,250,0.99)';
const FRONT_MUTED = 'rgba(205,211,222,0.86)';

function roundedCardShape(width = CARD_WIDTH, height = CARD_HEIGHT, radius = CORNER_RADIUS) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  shape.closePath();
  return shape;
}

function roundedFaceGeometry() {
  const geometry = new THREE.ShapeGeometry(roundedCardShape(), 12);
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index += 1) {
    uvs[index * 2] = positions.getX(index) / CARD_WIDTH + 0.5;
    uvs[index * 2 + 1] = positions.getY(index) / CARD_HEIGHT + 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

function heightToNormal(source: HTMLCanvasElement, strength: number) {
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('The membership-card surface map could not be created.');
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('The membership-card normal map could not be created.');
  const image = outputContext.createImageData(output.width, output.height);
  const result = image.data;
  const sample = (x: number, y: number) => {
    const px = Math.max(0, Math.min(source.width - 1, x));
    const py = Math.max(0, Math.min(source.height - 1, y));
    return sourcePixels[(py * source.width + px) * 4] / 255;
  };
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const dx = (sample(x - 1, y) - sample(x + 1, y)) * strength;
      const dy = (sample(x, y - 1) - sample(x, y + 1)) * strength;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const offset = (y * source.width + x) * 4;
      result[offset] = (dx / length * 0.5 + 0.5) * 255;
      result[offset + 1] = (dy / length * 0.5 + 0.5) * 255;
      result[offset + 2] = (1 / length * 0.5 + 0.5) * 255;
      result[offset + 3] = 255;
    }
  }
  outputContext.putImageData(image, 0, 0);
  return output;
}

function canvasTexture(canvas: HTMLCanvasElement, isColor = false) {
  const texture = new THREE.CanvasTexture(canvas);
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function dateLabel(member: MemberCardData) {
  const date = member.approvedAt ?? member.expiresAt;
  if (!date) return 'AWAITING DIRECTOR APPROVAL';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date)).toUpperCase();
}

function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let position = x;
  for (const character of text) {
    context.fillText(character, position, y);
    position += context.measureText(character).width + spacing;
  }
}

function roundedClip(context: CanvasRenderingContext2D) {
  const radius = 40;
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(MAP_WIDTH - radius, 0);
  context.quadraticCurveTo(MAP_WIDTH, 0, MAP_WIDTH, radius);
  context.lineTo(MAP_WIDTH, MAP_HEIGHT - radius);
  context.quadraticCurveTo(MAP_WIDTH, MAP_HEIGHT, MAP_WIDTH - radius, MAP_HEIGHT);
  context.lineTo(radius, MAP_HEIGHT);
  context.quadraticCurveTo(0, MAP_HEIGHT, 0, MAP_HEIGHT - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
  context.clip();
}

function makeSurfaceCanvases() {
  const createCanvas = (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const frontCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const backCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const frontRoughCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const backRoughCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const frontHeightCanvas = createCanvas(NORMAL_WIDTH, NORMAL_HEIGHT);
  const backHeightCanvas = createCanvas(NORMAL_WIDTH, NORMAL_HEIGHT);
  const frontContext = frontCanvas.getContext('2d');
  const backContext = backCanvas.getContext('2d');
  const frontRoughContext = frontRoughCanvas.getContext('2d');
  const backRoughContext = backRoughCanvas.getContext('2d');
  const frontHeightContext = frontHeightCanvas.getContext('2d', { willReadFrequently: true });
  const backHeightContext = backHeightCanvas.getContext('2d', { willReadFrequently: true });
  if (!frontContext || !backContext || !frontRoughContext || !backRoughContext || !frontHeightContext || !backHeightContext) {
    throw new Error('The membership-card artwork could not be initialized.');
  }
  return {
    frontCanvas, backCanvas, frontRoughCanvas, backRoughCanvas, frontHeightCanvas, backHeightCanvas,
    frontContext, backContext, frontRoughContext, backRoughContext, frontHeightContext, backHeightContext,
  };
}

function addIridescence(material: THREE.MeshPhysicalMaterial, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float irNdv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float irF = pow(1.0 - irNdv, 3.0);
        vec3 irTint = mix(vec3(0.10, 0.16, 0.34), vec3(0.26, 0.10, 0.34), smoothstep(0.2, 0.9, irF));
        totalEmissiveRadiance += irTint * irF * ${strength.toFixed(3)};
      }`,
    );
  };
}

function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The studio lighting environment could not be created.');
  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#77746e');
  base.addColorStop(0.5, '#3b3c40');
  base.addColorStop(1, '#17181b');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.filter = 'blur(18px)';
  const key = context.createLinearGradient(230, 0, 390, 0);
  key.addColorStop(0, 'rgba(230,238,252,0)');
  key.addColorStop(0.5, 'rgba(240,246,255,0.96)');
  key.addColorStop(1, 'rgba(230,238,252,0)');
  context.fillStyle = key;
  context.fillRect(220, 40, 200, 400);
  const rim = context.createLinearGradient(760, 0, 840, 0);
  rim.addColorStop(0, 'rgba(255,232,200,0)');
  rim.addColorStop(0.5, 'rgba(255,236,206,0.95)');
  rim.addColorStop(1, 'rgba(255,232,200,0)');
  context.fillStyle = rim;
  context.fillRect(750, 70, 100, 370);
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(texture).texture;
  generator.dispose();
  texture.dispose();
  return environment;
}

function createEngine(canvas: HTMLCanvasElement, container: HTMLDivElement): CardEngine {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor('#d6d0c6', 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0, 3.35);
  const environment = makeEnvironment(renderer);
  scene.environment = environment;

  const rigCenter = new THREE.Vector3(-3, 3.4, 3);
  const rigWidth = new THREE.Vector3(1.35, 0, -0.45);
  const rigHeight = new THREE.Vector3(0, 1.05, 0.35);
  for (const [u, v] of [[-1, -0.5], [0, -0.5], [1, -0.5], [-1, 0.5], [0, 0.5], [1, 0.5]]) {
    const light = new THREE.DirectionalLight(0xdce8fa, 0.55);
    light.position.copy(rigCenter).addScaledVector(rigWidth, u).addScaledVector(rigHeight, v);
    scene.add(light);
  }
  const rimLight = new THREE.DirectionalLight(0xffe8d2, 1.5);
  rimLight.position.set(4.5, -1.8, -2);
  scene.add(rimLight);
  const sweep = new THREE.SpotLight(0xffffff, 9, 22, Math.PI / 20, 0.95, 2);
  sweep.position.set(4.2, 1.2, 1.4);
  sweep.target.position.set(0, 0.12, 0);
  scene.add(sweep, sweep.target);

  const canvases = makeSurfaceCanvases();
  const frontMaps: CardMaps = {
    color: canvasTexture(canvases.frontCanvas, true),
    normal: canvasTexture(canvases.frontHeightCanvas),
    rough: canvasTexture(canvases.frontRoughCanvas),
  };
  const backMaps: CardMaps = {
    color: canvasTexture(canvases.backCanvas, true),
    normal: canvasTexture(canvases.backHeightCanvas),
    rough: canvasTexture(canvases.backRoughCanvas),
  };
  const frontFace = new THREE.MeshPhysicalMaterial({
    color: 0x17191f,
    metalness: 0.96,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.6,
  });
  const backFace = frontFace.clone();
  backFace.color.set(0x17191f);
  const edgeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9c9a91,
    metalness: 1,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 3.2,
  });
  const extrusion = new THREE.ExtrudeGeometry(roundedCardShape(), {
    depth: CARD_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: 0.004,
    bevelSegments: 5,
    steps: 1,
  });
  extrusion.center();
  const cardBody = new THREE.Mesh(extrusion, [frontFace, edgeMaterial]);
  const faceGeometry = roundedFaceGeometry();
  const frontOverlay = new THREE.MeshPhysicalMaterial({
    map: frontMaps.color,
    normalMap: frontMaps.normal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: frontMaps.rough,
    roughness: 0.82,
    metalness: 0.78,
    emissive: 0x9da3ae,
    emissiveMap: frontMaps.color,
    emissiveIntensity: 1.1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.6,
    transparent: false,
    alphaTest: 0.01,
    depthWrite: true,
  });
  const backOverlay = new THREE.MeshPhysicalMaterial({
    map: backMaps.color,
    normalMap: backMaps.normal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: backMaps.rough,
    roughness: 0.82,
    metalness: 0.78,
    emissive: 0x9da3ae,
    emissiveMap: backMaps.color,
    emissiveIntensity: 1.1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.6,
    transparent: false,
    alphaTest: 0.01,
    depthWrite: true,
  });
  addIridescence(frontOverlay, 0.16);
  addIridescence(backOverlay, 0.12);
  const front = new THREE.Mesh(faceGeometry, frontOverlay);
  front.position.z = FACE_OFFSET;
  const back = new THREE.Mesh(faceGeometry, backOverlay);
  back.position.z = -FACE_OFFSET;
  back.rotation.y = Math.PI;
  const cardGroup = new THREE.Group();
  cardGroup.add(cardBody, front, back);
  scene.add(cardGroup);

  const shadowGeometry = new THREE.PlaneGeometry(1.8, 0.8);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  if (!shadowContext) throw new Error('The membership-card shadow could not be created.');
  const shadowGradient = shadowContext.createRadialGradient(128, 64, 0, 128, 64, 120);
  shadowGradient.addColorStop(0, 'rgba(0,0,0,0.52)');
  shadowGradient.addColorStop(0.55, 'rgba(0,0,0,0.2)');
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 256, 128);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  shadow.position.set(0, -1.1, -0.25);
  scene.add(shadow);

  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  });
  resizeObserver.observe(container);

  return {
    renderer, scene, camera, cardGroup, frontMaps, backMaps, frontOverlay, backOverlay,
    ...canvases, target: { x: 0.07, y: -0.08 }, current: { x: 0.07, y: -0.08 },
    velocity: { x: 0, y: 0 }, dragging: false, previous: { x: 0, y: 0 },
    cameraDistance: 3.35, resizeObserver, animationFrame: 0, disposed: false,
  };
}

function drawCardArtwork(engine: CardEngine, member: MemberCardData, logo: HTMLImageElement | null) {
  const approved = member.status === 'approved' && Boolean(member.approvedAt);
  const fullName = member.fullName?.trim() || 'YOUR NAME';
  const memberId = member.memberId || 'MEMBER ID PENDING';
  const location = member.city || 'ANYWHERE';
  const validYear = member.expiryYear
    ?? (member.expiresAt ? new Date(member.expiresAt).getFullYear() : new Date().getFullYear() + 2);

  const paintFace = (context: CanvasRenderingContext2D, heightContext: CanvasRenderingContext2D, isBack: boolean) => {
    context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    context.save();
    roundedClip(context);
    const gradient = context.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT);
    gradient.addColorStop(0, '#292722');
    gradient.addColorStop(0.52, '#171715');
    gradient.addColorStop(1, '#24221d');
    context.fillStyle = gradient;
    context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    context.save();
    context.globalAlpha = 0.13;
    const sheen = context.createLinearGradient(40, 0, MAP_WIDTH - 30, MAP_HEIGHT);
    sheen.addColorStop(0, '#e4d7b7');
    sheen.addColorStop(0.24, '#6a6252');
    sheen.addColorStop(0.52, '#10100f');
    sheen.addColorStop(0.78, '#464033');
    sheen.addColorStop(1, '#c4bba7');
    context.fillStyle = sheen;
    context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    context.restore();

    context.save();
    context.strokeStyle = 'rgba(215,207,187,0.02)';
    context.lineWidth = 0.7;
    for (let line = 0; line < 260; line += 1) {
      const y = (line * 37) % MAP_HEIGHT;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(MAP_WIDTH, y + ((line % 5) - 2) * 0.65);
      context.stroke();
    }
    context.restore();

    if (!isBack) {
      if (logo) context.drawImage(logo, 48, 48, 46, 46);
      context.fillStyle = FRONT_INK;
      context.font = '500 17px Arial, sans-serif';
      drawTrackedText(context, 'THE DIRECTOR GAMES', 112, 69, 2.1);
      context.fillStyle = FRONT_MUTED;
      context.font = '500 9px Arial, sans-serif';
      drawTrackedText(context, approved ? 'MEMBERSHIP' : 'APPLICATION', 113, 91, 2.8);

      context.strokeStyle = 'rgba(220,211,190,0.25)';
      context.beginPath();
      context.moveTo(52, 176);
      context.lineTo(460, 176);
      context.stroke();

      context.fillStyle = FRONT_MUTED;
      context.font = '500 10px Arial, sans-serif';
      drawTrackedText(context, approved ? 'MEMBER' : 'APPLICANT', 54, 226, 2.3);
      context.fillStyle = FRONT_INK;
      const nameSize = Math.min(48, Math.max(23, Math.floor(400 / Math.max(fullName.length * 0.54, 1))));
      context.font = `400 ${nameSize}px Georgia, "Times New Roman", serif`;
      context.fillText(fullName, 50, 286, 410);

      context.strokeStyle = 'rgba(220,211,190,0.2)';
      context.beginPath();
      context.moveTo(52, 328);
      context.lineTo(460, 328);
      context.stroke();
      context.fillStyle = FRONT_MUTED;
      context.font = '500 10px Arial, sans-serif';
      drawTrackedText(context, approved ? 'MEMBER NO.' : 'APPLICATION', 54, 369, 2);
      context.fillStyle = FRONT_INK;
      context.font = '500 18px "SF Mono", Menlo, Consolas, monospace';
      context.fillText(approved ? memberId : 'PENDING REVIEW', 54, 405, 400);
      context.fillStyle = FRONT_MUTED;
      context.font = '500 10px Arial, sans-serif';
      drawTrackedText(context, 'BASED IN', 54, 462, 2);
      context.fillStyle = FRONT_INK;
      context.font = '500 16px Arial, sans-serif';
      context.fillText(location.toUpperCase(), 54, 491, 350);
      context.strokeStyle = 'rgba(220,211,190,0.25)';
      context.beginPath();
      context.moveTo(52, 624);
      context.lineTo(460, 624);
      context.stroke();
      if (approved) {
        context.textAlign = 'right';
        context.fillStyle = 'rgba(226,219,202,0.94)';
        context.font = 'italic 30px "Segoe Script", "Brush Script MT", cursive';
        context.fillText('The Director', 459, 685);
        context.fillStyle = FRONT_MUTED;
        context.font = '500 9px Arial, sans-serif';
        context.fillText(`ISSUED ${dateLabel(member)}`, 459, 712);
        context.textAlign = 'left';
      }
    } else {
      context.strokeStyle = 'rgba(220,211,190,0.28)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(52, 220);
      context.lineTo(460, 220);
      context.stroke();
      context.strokeStyle = 'rgba(220,211,190,0.25)';
      context.strokeRect(52, 338, 408, 58);
      context.fillStyle = 'rgba(222,226,234,0.88)';
      context.font = '500 16px "SF Mono", Menlo, Consolas, monospace';
      context.textAlign = 'center';
      context.fillText(approved ? memberId : 'APPLICATION / PENDING', MAP_WIDTH / 2, 374, 380);
      context.fillStyle = FRONT_MUTED;
      context.font = 'italic 23px Georgia, "Times New Roman", serif';
      const message = approved ? 'A place in the worlds we make.' : 'Your application is under review.';
      context.fillText(message, MAP_WIDTH / 2, 477, 400);
      if (logo) context.drawImage(logo, 232, 668, 48, 48);
      context.fillStyle = FRONT_INK;
      context.font = '500 16px Arial, sans-serif';
      drawTrackedText(context, 'THE DIRECTOR GAMES', 126, 746, 2.1);
      context.fillStyle = FRONT_MUTED;
      context.font = '500 10px Arial, sans-serif';
      context.fillText(approved ? `VALID THROUGH ${validYear}` : 'MEMBERSHIP APPLICATION', MAP_WIDTH / 2, 778);
      context.textAlign = 'left';
    }
    context.restore();

    heightContext.clearRect(0, 0, NORMAL_WIDTH, NORMAL_HEIGHT);
    heightContext.fillStyle = '#000';
    heightContext.fillRect(0, 0, NORMAL_WIDTH, NORMAL_HEIGHT);
    heightContext.save();
    heightContext.scale(NORMAL_WIDTH / MAP_WIDTH, NORMAL_HEIGHT / MAP_HEIGHT);
    heightContext.filter = 'blur(1px)';
    heightContext.fillStyle = '#fff';
    if (isBack) {
      heightContext.fillRect(52, 338, MAP_WIDTH - 104, 58);
      heightContext.font = '500 30px "SF Mono", Menlo, Consolas, monospace';
      heightContext.textAlign = 'center';
      heightContext.fillText(approved ? memberId : 'APPLICATION / PENDING', MAP_WIDTH / 2, 374);
    } else {
      heightContext.font = '400 48px Georgia, "Times New Roman", serif';
      heightContext.fillText(fullName, 50, 286, 410);
      heightContext.font = '500 25px "SF Mono", Menlo, Consolas, monospace';
      if (approved) heightContext.fillText(memberId, 54, 405, 400);
      heightContext.font = 'italic 32px "Segoe Script", "Brush Script MT", cursive';
      if (approved) heightContext.fillText('The Director', 290, 685, 169);
    }
    heightContext.restore();
    heightContext.filter = 'none';
  };

  paintFace(engine.frontContext, engine.frontHeightContext, false);
  paintFace(engine.backContext, engine.backHeightContext, true);

  const drawRoughness = (context: CanvasRenderingContext2D, isBack: boolean) => {
    context.fillStyle = '#3d3d3d';
    context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    context.save();
    context.strokeStyle = 'rgba(90,94,104,0.22)';
    context.lineWidth = 0.6;
    const count = isBack ? 1100 : 1500;
    for (let index = 0; index < count; index += 1) {
      const x = (index * 137.37) % MAP_WIDTH;
      const y = (index * 317.91) % MAP_HEIGHT;
      const length = 55 + ((index * 31) % 220);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + length, y + ((index % 5) - 2) * 0.45);
      context.stroke();
    }
    context.translate(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    context.rotate(Math.PI / 4);
    context.strokeStyle = 'rgba(78,78,82,0.2)';
    for (let line = -900; line < 900; line += 18) {
      context.beginPath();
      context.moveTo(line, -900);
      context.lineTo(line, 900);
      context.stroke();
    }
    context.restore();
  };
  drawRoughness(engine.frontRoughContext, false);
  drawRoughness(engine.backRoughContext, true);

  const frontNormal = heightToNormal(engine.frontHeightCanvas, 2.6);
  const backNormal = heightToNormal(engine.backHeightCanvas, 2.2);
  engine.frontMaps.normal.dispose();
  engine.backMaps.normal.dispose();
  engine.frontMaps.normal = canvasTexture(frontNormal);
  engine.backMaps.normal = canvasTexture(backNormal);
  engine.frontOverlay.normalMap = engine.frontMaps.normal;
  engine.backOverlay.normalMap = engine.backMaps.normal;
  engine.frontOverlay.needsUpdate = true;
  engine.backOverlay.needsUpdate = true;
  engine.frontMaps.color.needsUpdate = true;
  engine.backMaps.color.needsUpdate = true;
  engine.frontMaps.rough.needsUpdate = true;
  engine.backMaps.rough.needsUpdate = true;
}

export function MemberCard3DCanvas({
  member,
  logoPath,
  flipped,
  onFlip,
  label,
}: {
  member: MemberCardData;
  logoPath: string;
  flipped: boolean;
  onFlip: () => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CardEngine | null>(null);
  const flipCallbackRef = useRef(onFlip);
  const memberRef = useRef(member);
  flipCallbackRef.current = onFlip;
  memberRef.current = member;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let engine: CardEngine;
    try {
      engine = createEngine(canvas, container);
    } catch (error) {
      console.error('Could not initialize the 3D membership card renderer.', error);
      throw error;
    }
    engineRef.current = engine;

    let logo: HTMLImageElement | null = null;
    const logoImage = new Image();
    logoImage.onload = () => {
      if (engineRef.current !== engine) return;
      logo = logoImage;
      drawCardArtwork(engine, memberRef.current, logo);
    };
    logoImage.onerror = (error) => {
      console.error('Could not load the studio logo for the 3D membership card.', error);
    };
    logoImage.src = logoPath;
    drawCardArtwork(engine, memberRef.current, logo);

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      engine.dragging = true;
      engine.previous = { x: event.clientX, y: event.clientY };
      engine.velocity = { x: 0, y: 0 };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!engine.dragging) return;
      const dx = event.clientX - engine.previous.x;
      const dy = event.clientY - engine.previous.y;
      engine.velocity.y = dx * 0.011;
      engine.velocity.x = dy * 0.011;
      engine.target.y += engine.velocity.y;
      engine.target.x += engine.velocity.x;
      engine.previous = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => { engine.dragging = false; };
    const onDoubleClick = () => flipCallbackRef.current();
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      engine.cameraDistance = THREE.MathUtils.clamp(engine.cameraDistance + event.deltaY * 0.003, 2.5, 5.5);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let pageVisible = document.visibilityState === 'visible';
    let inViewport = true;
    const render = (time: number) => {
      if (engine.disposed) return;
      engine.animationFrame = 0;
      engine.target.x = THREE.MathUtils.clamp(engine.target.x, -0.9, 0.9);
      if (!engine.dragging) {
        engine.target.y += engine.velocity.y;
        engine.target.x += engine.velocity.x;
        engine.velocity.x *= 0.94;
        engine.velocity.y *= 0.94;
      }
      engine.current.x += (engine.target.x - engine.current.x) * 0.075;
      engine.current.y += (engine.target.y - engine.current.y) * 0.075;
      engine.cardGroup.rotation.x = engine.current.x;
      engine.cardGroup.rotation.y = engine.current.y;
      engine.cardGroup.rotation.z = Math.sin(time * 0.00025) * 0.009;
      engine.camera.position.z += (engine.cameraDistance - engine.camera.position.z) * 0.12;
      engine.renderer.render(engine.scene, engine.camera);
      if (pageVisible && inViewport) engine.animationFrame = window.requestAnimationFrame(render);
    };
    const syncAnimation = () => {
      if (engine.disposed) return;
      if (pageVisible && inViewport && engine.animationFrame === 0) {
        engine.animationFrame = window.requestAnimationFrame(render);
      } else if ((!pageVisible || !inViewport) && engine.animationFrame !== 0) {
        window.cancelAnimationFrame(engine.animationFrame);
        engine.animationFrame = 0;
      }
    };
    const onVisibilityChange = () => {
      pageVisible = document.visibilityState === 'visible';
      syncAnimation();
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      syncAnimation();
    }, { threshold: 0 });
    visibilityObserver.observe(container);
    document.addEventListener('visibilitychange', onVisibilityChange);
    syncAnimation();

    return () => {
      engine.disposed = true;
      window.cancelAnimationFrame(engine.animationFrame);
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel);
      engine.resizeObserver.disconnect();
      engine.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      engine.scene.environment?.dispose();
      engine.frontMaps.color.dispose();
      engine.frontMaps.normal.dispose();
      engine.frontMaps.rough.dispose();
      engine.backMaps.color.dispose();
      engine.backMaps.normal.dispose();
      engine.backMaps.rough.dispose();
      engine.renderer.dispose();
      engineRef.current = null;
    };
  }, [logoPath]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    let logo: HTMLImageElement | null = null;
    const image = new Image();
    image.onload = () => {
      if (engineRef.current !== engine) return;
      logo = image;
      drawCardArtwork(engine, member, logo);
    };
    image.onerror = (error) => {
      console.error('Could not refresh the studio logo on the 3D membership card.', error);
    };
    image.src = logoPath;
    drawCardArtwork(engine, member, logo);
  }, [member.fullName, member.title, member.role, member.memberId, member.city, member.approvedAt, member.expiryYear, member.expiresAt, member.status, logoPath]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const currentTurn = Math.round((engine.target.y + 0.35) / Math.PI);
    const currentSide = (currentTurn % 2 + 2) % 2;
    const desiredSide = flipped ? 1 : 0;
    const nextTurn = currentSide === desiredSide ? currentTurn : currentTurn + 1;
    engine.target.y = nextTurn * Math.PI - 0.35;
    engine.velocity.y = 0;
  }, [flipped]);

  return (
    <div className="member-card-scene" ref={containerRef}>
      <canvas ref={canvasRef} className="member-card-canvas" aria-label={label} />
      <span className="member-card-controls" aria-hidden="true">DRAG TO ROTATE <i /> DOUBLE-CLICK TO FLIP</span>
    </div>
  );
}
