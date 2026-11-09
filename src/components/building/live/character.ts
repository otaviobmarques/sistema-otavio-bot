import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { FigurinhaPalette } from "@/lib/figurinha";
import type { FigurinhaHead, FigurinhaLook, FigurinhaMouth } from "../../../../shared/figurinha";
import type { DeskStatus } from "../building-view";
import { STATUS_COLOR } from "./live-labels";
import type { Outfit } from "./live-model";

type Status = DeskStatus;
type HeadShape = FigurinhaHead;

/** A figurinha as the 3D character wears it. */
export interface CharacterLook extends FigurinhaLook {
  palette: FigurinhaPalette;
  mouth: FigurinhaMouth;
}

const K = 0.021;
const INK = "#111827";

interface HeadDims {
  left: number;
  w: number;
  top: number;
  h: number;
  eyeY: number;
}

const HEAD: Record<HeadShape, HeadDims> = {
  rounded: { left: 12, w: 24, top: 15, h: 21, eyeY: 24.5 },
  square: { left: 12, w: 24, top: 15, h: 20, eyeY: 24 },
  round: { left: 12, w: 24, top: 13, h: 24, eyeY: 24.5 },
  tall: { left: 14, w: 20, top: 11, h: 26, eyeY: 23.5 },
  wide: { left: 9, w: 30, top: 17, h: 17, eyeY: 25 },
};

export const HIP = 0.26;
const HEAD_BASE = 0.48;

function headDepth(shape: HeadShape) {
  if (shape === "round") return 24 * K;
  if (shape === "tall") return 20 * K;
  if (shape === "wide") return 0.4;
  return 0.42;
}

function faceCanvas(f: CharacterLook) {
  const d = HEAD[f.head];
  const c = f.palette;
  const x0 = d.left - 1;
  const wB = d.w + 2;
  const y0 = d.eyeY - 8;
  const hB = wB * 0.8;
  const W = 256;
  const H = Math.round(W * 0.8);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const S = W / wB;
  ctx.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ey = d.eyeY;
  const ex1 = 19.5;
  const ex2 = 28.5;
  const left = d.left;
  const right = d.left + d.w;
  const dot = (x: number, y: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const rrect = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const stroke = (path: string, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(new Path2D(path));
  };
  switch (f.eyes) {
    case "bright":
      dot(ex1, ey, 2.6, INK);
      dot(ex2, ey, 2.6, INK);
      dot(ex1 + 0.9, ey - 0.9, 0.9, "#fff");
      dot(ex2 + 0.9, ey - 0.9, 0.9, "#fff");
      break;
    case "dots":
      dot(ex1, ey, 2, INK);
      dot(ex2, ey, 2, INK);
      break;
    case "visor":
      rrect(left + 2.5, ey - 3.2, right - left - 5, 6.4, 3.2, INK);
      rrect(ex1 - 2.6, ey - 1.3, 5.2, 2.6, 1.3, c.face);
      rrect(ex2 - 2.6, ey - 1.3, 5.2, 2.6, 1.3, c.face);
      break;
    case "glasses":
      stroke(`M${ex1 + 3.4} ${ey} L${ex2 - 3.4} ${ey}`, INK, 1.4);
      for (const ex of [ex1, ex2]) {
        dot(ex, ey, 3.4, "#f8fafc");
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(ex, ey, 3.4, 0, Math.PI * 2);
        ctx.stroke();
        dot(ex, ey, 1.4, INK);
      }
      break;
    case "happy":
      stroke(`M${ex1 - 2.3} ${ey + 0.8} Q${ex1} ${ey - 2.2} ${ex1 + 2.3} ${ey + 0.8}`, INK, 1.8);
      stroke(`M${ex2 - 2.3} ${ey + 0.8} Q${ex2} ${ey - 2.2} ${ex2 + 2.3} ${ey + 0.8}`, INK, 1.8);
      break;
    case "code":
      rrect(left + 3, ey - 4, right - left - 6, 8, 2, INK);
      stroke(`M19 ${ey - 2} L16.5 ${ey} L19 ${ey + 2}`, c.face, 1.4);
      stroke(`M29 ${ey - 2} L31.5 ${ey} L29 ${ey + 2}`, c.face, 1.4);
      stroke(`M25.2 ${ey - 2.4} L22.8 ${ey + 2.4}`, c.face, 1.4);
      break;
    case "chart":
      rrect(left + 2.5, ey - 5, right - left - 5, 7, 1.6, INK);
      stroke(`M${left + 4.5} ${ey} L19 ${ey - 2.5} L23 ${ey - 0.8} L27 ${ey - 3.6} L${right - 4.5} ${ey - 2}`, "#22c55e", 1.3);
      dot(ex1, ey + 4.2, 1.3, INK);
      dot(ex2, ey + 4.2, 1.3, INK);
      break;
  }
  const my = ey + 6 + (f.eyes === "chart" ? 1.5 : 0);
  switch (f.mouth) {
    case "smile":
      stroke(`M20.5 ${my - 0.5} Q24 ${my + 3} 27.5 ${my - 0.5}`, INK, 1.7);
      break;
    case "flat":
      stroke(`M21.5 ${my} L26.5 ${my}`, INK, 1.7);
      break;
    case "frown":
      stroke(`M20.5 ${my + 1.5} Q24 ${my - 1.5} 27.5 ${my + 1.5}`, INK, 1.7);
      break;
    case "open":
      ctx.beginPath();
      ctx.ellipse(24, my, 2.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      break;
  }
  return { canvas: cv, x0, y0, wB, hB };
}

function std(color: THREE.ColorRepresentation, roughness = 0.55, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function starShape(outer: number, inner: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export interface Character {
  id: string;
  root: THREE.Group;
  rig: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  orb: THREE.Group;
  orbMat: THREE.MeshBasicMaterial;
  haloMat: THREE.SpriteMaterial;
  ring: THREE.Mesh;
  hoverRing: THREE.Mesh;
  hit: THREE.Mesh;
  star?: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  headTop: number;
  seated: boolean;
  status: Status;
}

const shared = {
  legGeo: new RoundedBoxGeometry(0.12, 0.27, 0.14, 2, 0.04),
  armGeo: new THREE.CapsuleGeometry(0.052, 0.17, 4, 10),
  bodyGeo: new RoundedBoxGeometry(0.4, 0.44, 0.3, 3, 0.1),
  orbGeo: new THREE.SphereGeometry(0.07, 18, 12),
  ringGeo: new THREE.TorusGeometry(0.13, 0.012, 6, 40),
  hoverGeo: new THREE.RingGeometry(0.38, 0.47, 40),
  hitGeo: new THREE.BoxGeometry(0.8, 1.7, 0.8),
  hitMat: new THREE.MeshBasicMaterial({ visible: false }),
  blobGeo: new THREE.PlaneGeometry(0.9, 0.9),
};

export function buildCharacter(id: string, f: CharacterLook, outfit: Outfit, glow: THREE.Texture, blob: THREE.Texture): Character {
  const sw = f.palette;
  const d = HEAD[f.head];
  const face = new THREE.Color(sw.face);
  const accent = new THREE.Color(sw.accent);
  const bodyColor = new THREE.Color(outfit.color);
  const mats: THREE.MeshStandardMaterial[] = [];
  const m = (c: THREE.ColorRepresentation, r = 0.55) => {
    const mm = std(c, r);
    mats.push(mm);
    return mm;
  };
  const faceMat = m(face, 0.5);
  const bodyMat = m(bodyColor, 0.6);
  const accentMat = m(accent, 0.5);
  const inkMat = m(INK, 0.6);
  const pantsMat = m(outfit.pants ?? "#2a3142", 0.7);

  const root = new THREE.Group();
  root.name = `bot:${id}`;
  const rig = new THREE.Group();
  rig.position.y = HIP;
  root.add(rig);

  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  };

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [g, x] of [
    [legL, -0.1],
    [legR, 0.1],
  ] as const) {
    g.position.set(x, 0, 0);
    const leg = mk(shared.legGeo, pantsMat);
    leg.position.y = -0.13;
    g.add(leg);
    rig.add(g);
  }

  const body = mk(shared.bodyGeo, bodyMat);
  body.position.y = 0.22;
  rig.add(body);
  const front = 0.152;
  const shirt = new THREE.Color(outfit.color);
  const dark = shirt.clone().multiplyScalar(0.72);
  const tieMat = m(new THREE.Color(sw.accent).multiplyScalar(0.8), 0.45);
  const addTie = () => {
    const knot = mk(new THREE.BoxGeometry(0.05, 0.04, 0.02), tieMat);
    knot.position.set(0, 0.405, front + 0.012);
    const tie = mk(new THREE.BoxGeometry(0.045, 0.2, 0.012), tieMat);
    tie.position.set(0, 0.29, front + 0.012);
    rig.add(knot, tie);
  };
  const collar = (color: THREE.ColorRepresentation) => {
    const cm = m(color, 0.6);
    for (const s of [-1, 1]) {
      const c = mk(new THREE.BoxGeometry(0.1, 0.05, 0.02), cm);
      c.position.set(s * 0.055, 0.425, front + 0.006);
      c.rotation.z = s * -0.45;
      rig.add(c);
    }
  };
  switch (outfit.top) {
    case "shirt":
      collar("#ffffff");
      for (let i = 0; i < 3; i++) {
        const btn = mk(new THREE.BoxGeometry(0.018, 0.018, 0.01), m(dark, 0.5));
        btn.position.set(0.0, 0.33 - i * 0.08, front + 0.005);
        if (!outfit.tie) rig.add(btn);
      }
      if (outfit.tie) addTie();
      break;
    case "polo":
      collar(dark);
      {
        const placket = mk(new THREE.BoxGeometry(0.04, 0.12, 0.012), m(dark, 0.6));
        placket.position.set(0, 0.36, front + 0.004);
        rig.add(placket);
      }
      break;
    case "blazer": {
      const inner = mk(new THREE.BoxGeometry(0.14, 0.22, 0.012), m("#f8fafc", 0.6));
      inner.position.set(0, 0.33, front + 0.002);
      rig.add(inner);
      const lapelMat = m(dark, 0.55);
      for (const s of [-1, 1]) {
        const lapel = mk(new THREE.BoxGeometry(0.06, 0.24, 0.016), lapelMat);
        lapel.position.set(s * 0.075, 0.32, front + 0.01);
        lapel.rotation.z = s * 0.28;
        rig.add(lapel);
      }
      if (outfit.tie) addTie();
      break;
    }
    case "hoodie": {
      const hood = mk(new THREE.TorusGeometry(0.13, 0.055, 8, 20), bodyMat);
      hood.position.set(0, 0.44, -0.07);
      hood.rotation.x = Math.PI / 2.6;
      rig.add(hood);
      const pocket = mk(new RoundedBoxGeometry(0.26, 0.1, 0.02, 2, 0.01), m(dark, 0.65));
      pocket.position.set(0, 0.1, front + 0.004);
      rig.add(pocket);
      for (const s of [-1, 1]) {
        const cord = mk(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), m("#f1f5f9", 0.6));
        cord.position.set(s * 0.04, 0.36, front + 0.01);
        rig.add(cord);
      }
      break;
    }
    case "tee": {
      const neck = mk(new THREE.TorusGeometry(0.075, 0.016, 6, 18, Math.PI), m(dark, 0.6));
      neck.position.set(0, 0.44, front - 0.01);
      neck.rotation.z = Math.PI;
      rig.add(neck);
      const stripe = mk(new THREE.BoxGeometry(0.401, 0.035, 0.301), accentMat);
      stripe.position.set(0, 0.12, 0);
      rig.add(stripe);
      break;
    }
  }
  const badgeMat = m(sw.accent, 0.4);
  const badge = mk(new THREE.BoxGeometry(0.075, 0.09, 0.012), badgeMat);
  badge.position.set(outfit.top === "blazer" ? 0.11 : -0.1, 0.24, front + 0.012);
  rig.add(badge);
  const strapMat = m(sw.accent, 0.5);
  for (const s of [-1, 1]) {
    const strap = mk(new THREE.BoxGeometry(0.014, 0.2, 0.008), strapMat);
    strap.position.set(badge.position.x + s * 0.035, 0.34, front + 0.008);
    strap.rotation.z = s * 0.25;
    rig.add(strap);
  }

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  for (const [g, x] of [
    [armL, -0.245],
    [armR, 0.245],
  ] as const) {
    g.position.set(x, 0.38, 0);
    const arm = mk(shared.armGeo, bodyMat);
    arm.position.y = -0.12;
    g.add(arm);
    rig.add(g);
  }

  const head = new THREE.Group();
  head.position.y = HEAD_BASE;
  rig.add(head);
  const hw = d.w * K;
  const hh = d.h * K;
  const hd = headDepth(f.head);
  let headGeo: THREE.BufferGeometry;
  switch (f.head) {
    case "rounded":
      headGeo = new RoundedBoxGeometry(hw, hh, hd, 4, 8 * K);
      break;
    case "square":
      headGeo = new RoundedBoxGeometry(hw, hh, hd, 2, 3.5 * K);
      break;
    case "round":
      headGeo = new THREE.SphereGeometry(12 * K, 28, 20);
      break;
    case "tall":
      headGeo = new THREE.CapsuleGeometry(10 * K, 6 * K, 8, 20);
      break;
    case "wide":
      headGeo = new RoundedBoxGeometry(hw, hh, hd, 3, 5 * K);
      break;
  }
  const headMesh = mk(headGeo, faceMat);
  headMesh.position.y = hh / 2;
  head.add(headMesh);

  const fx = (x: number) => (x - 24) * K;
  const fy = (y: number) => hh - (y - d.top) * K;

  const fc = faceCanvas(f);
  const faceTex = new THREE.CanvasTexture(fc.canvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 8;
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(fc.wB * K, fc.hB * K),
    new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  decal.position.set(0, fy(fc.y0 + fc.hB / 2), hd / 2 + 0.004);
  head.add(decal);

  let star: THREE.Object3D | undefined;
  const top = d.top;
  const ey = d.eyeY;
  switch (f.accessory) {
    case "none":
      break;
    case "antenna": {
      const stick = mk(new THREE.CylinderGeometry(0.016, 0.016, 5 * K, 8), faceMat);
      stick.position.set(0, fy(top - 2.5), 0);
      const ball = mk(new THREE.SphereGeometry(2.4 * K, 14, 10), accentMat);
      ball.position.set(0, fy(top - 6), 0);
      head.add(stick, ball);
      break;
    }
    case "headset": {
      const half = (d.w + 1) / 2;
      const rad = Math.max(half, ey - (top - 3)) * K;
      const band = mk(new THREE.TorusGeometry(rad, 1.3 * K, 8, 28, Math.PI), accentMat);
      band.position.set(0, fy(ey), 0);
      head.add(band);
      for (const s of [-1, 1]) {
        const cup = mk(new THREE.CylinderGeometry(2.8 * K, 2.8 * K, 0.09, 16), accentMat);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(s * (rad + 0.01), fy(ey + 0.8), 0);
        head.add(cup);
      }
      const mic = mk(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), inkMat);
      mic.rotation.x = Math.PI / 2;
      mic.rotation.y = 0.5;
      mic.position.set(rad * 0.75, fy(ey + 6), hd * 0.4);
      head.add(mic);
      break;
    }
    case "beanie": {
      const r = (hw / 2) * 1.06;
      const cap = mk(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
      cap.scale.set(1, 0.62, (hd / hw) * 1.04);
      cap.position.y = hh - 0.07;
      const brim = mk(new THREE.TorusGeometry(r * 0.98, 0.03, 8, 28), accentMat);
      brim.rotation.x = Math.PI / 2;
      brim.scale.set(1, (hd / hw) * 1.02, 1);
      brim.position.y = hh - 0.07;
      const pom = mk(new THREE.SphereGeometry(0.05, 12, 8), faceMat);
      pom.position.y = hh - 0.07 + r * 0.62 + 0.03;
      head.add(cap, brim, pom);
      break;
    }
    case "cap": {
      const r = (hw / 2) * 1.04;
      const cap = mk(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
      cap.scale.set(1, 0.55, (hd / hw) * 1.02);
      cap.position.y = hh - 0.08;
      const visor = mk(new RoundedBoxGeometry(hw * 0.7, 0.03, 0.2, 2, 0.012), accentMat);
      visor.position.set(0, hh - 0.075, hd / 2 + 0.07);
      head.add(cap, visor);
      break;
    }
    case "star": {
      const geo = new THREE.ExtrudeGeometry(starShape(0.1, 0.045), { depth: 0.035, bevelEnabled: false });
      geo.center();
      const mat = new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#f59e0b", emissiveIntensity: 0.35, roughness: 0.4 });
      const s = new THREE.Mesh(geo, mat);
      s.castShadow = true;
      s.position.set(fx(37) + 0.04, fy(12.8) + 0.04, 0);
      head.add(s);
      star = s;
      break;
    }
    case "horns": {
      for (const s of [-1, 1]) {
        const horn = mk(new THREE.ConeGeometry(0.035, 0.15, 10), inkMat);
        horn.position.set(s * 7.5 * K, hh + 0.05, 0);
        horn.rotation.z = -s * 0.5;
        head.add(horn);
      }
      break;
    }
    case "tuft": {
      for (const [x, h, r] of [
        [-0.05, 0.11, 0.25],
        [0, 0.15, 0],
        [0.05, 0.11, -0.25],
      ] as const) {
        const tuft = mk(new THREE.ConeGeometry(0.045, h, 8), faceMat);
        tuft.position.set(x, hh + h / 2 - 0.02, 0.04);
        tuft.rotation.set(0.35, 0, r);
        head.add(tuft);
      }
      break;
    }
    case "bolt": {
      const bolt = mk(new THREE.CylinderGeometry(3 * K, 3 * K, 4.5 * K, 6), accentMat);
      bolt.position.y = hh + 2 * K;
      const capb = mk(new THREE.CylinderGeometry(4 * K, 4 * K, 1.2 * K, 16), accentMat);
      capb.position.y = hh + 4.6 * K;
      head.add(bolt, capb);
      break;
    }
    case "pencil": {
      const pencil = new THREE.Group();
      const wood = mk(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 8), m("#f59e0b", 0.5));
      const tip = mk(new THREE.ConeGeometry(0.026, 0.06, 8), m("#fde68a", 0.6));
      tip.position.y = -0.15;
      tip.rotation.z = Math.PI;
      const eraser = mk(new THREE.CylinderGeometry(0.027, 0.027, 0.04, 8), m("#f472b6", 0.6));
      eraser.position.y = 0.14;
      pencil.add(wood, tip, eraser);
      pencil.position.set(hw / 2 + 0.02, fy(ey + 2), 0.02);
      pencil.rotation.z = 0.75;
      head.add(pencil);
      break;
    }
  }

  const headTop = HEAD_BASE + hh + 0.02;

  const orb = new THREE.Group();
  const orbMat = new THREE.MeshBasicMaterial({ color: "#22c55e" });
  const orbMesh = new THREE.Mesh(shared.orbGeo, orbMat);
  orb.add(orbMesh);
  const haloMat = new THREE.SpriteMaterial({ map: glow, color: "#22c55e", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(0.5, 0.5, 1);
  orb.add(halo);
  const ring = new THREE.Mesh(shared.ringGeo, orbMat);
  ring.rotation.x = Math.PI / 2.4;
  orb.add(ring);
  root.add(orb);

  const hoverRing = new THREE.Mesh(
    shared.hoverGeo,
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.position.y = 0.025;
  hoverRing.visible = false;
  root.add(hoverRing);
  const shadow = new THREE.Mesh(
    shared.blobGeo,
    new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  const hit = new THREE.Mesh(shared.hitGeo, shared.hitMat);
  hit.position.y = 0.85;
  hit.userData.botId = id;
  root.add(hit);

  const ch: Character = {
    id,
    root,
    rig,
    legL,
    legR,
    armL,
    armR,
    head,
    orb,
    orbMat,
    haloMat,
    ring,
    hoverRing,
    hit,
    star,
    mats,
    headTop,
    seated: false,
    status: "working",
  };
  return ch;
}

export function setCharacterStatus(ch: Character, s: Status) {
  ch.status = s;
  const col = new THREE.Color(STATUS_COLOR[s]);
  ch.orbMat.color.copy(col);
  ch.haloMat.color.copy(col);
  ch.haloMat.opacity = s === "idle" ? 0.35 : 0.85;
}

export function setSeated(ch: Character, seated: boolean, seatTop = 0.46) {
  ch.seated = seated;
  ch.rig.position.y = seated ? seatTop : HIP;
  const legRot = seated ? -Math.PI / 2 : 0;
  ch.legL.rotation.x = legRot;
  ch.legR.rotation.x = legRot;
}

export function setHover(ch: Character, on: boolean) {
  ch.hoverRing.visible = on;
  for (const m of ch.mats) m.emissive.setRGB(on ? 0.16 : 0, on ? 0.18 : 0, on ? 0.22 : 0);
}

export function orbHeight(ch: Character) {
  return ch.rig.position.y + ch.headTop + 0.36;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (mesh.geometry && !Object.values(shared).includes(mesh.geometry as never)) mesh.geometry.dispose();
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const mm of list) {
      if (mm === shared.hitMat) continue;
      const map = (mm as THREE.MeshStandardMaterial).map;
      if (map && map.userData.owned !== false && map.userData.shared !== true) map.dispose();
      mm.dispose();
    }
  });
}
