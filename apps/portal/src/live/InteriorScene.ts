import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { companies, outfitOf, statusLabel, type Bot, type Status } from "../data/mock";
import { palette, statusColor } from "../lib/colors";
import { buildCharacter, disposeObject, orbHeight, setCharacterStatus, setHover, setSeated, type Character } from "./character";
import {
  BOARD,
  COFFEE,
  ELEV,
  FLOOR_D,
  FLOOR_W,
  MEETING,
  PENTHOUSE,
  ZONES,
  boardSeat,
  bubblesAt,
  desksOf,
  doorOpen,
  carFloor,
  poseAt,
  statusAt,
  type World,
} from "./sim";
import * as tex from "./textures";

const WALL_H = 2.7;
const SEAT_TOP = 0.47;

export interface InteriorOptions {
  floor: number;
  onBotClick: (id: string) => void;
  onTableClick?: () => void;
  onAnchor?: (id: string, x: number, y: number, visible: boolean) => void;
}

interface Wall {
  mesh: THREE.Mesh;
  normal: THREE.Vector2;
  attachments: THREE.Object3D[];
  low: number;
}

interface Screen {
  mat: THREE.MeshBasicMaterial;
  spill: THREE.MeshBasicMaterial;
  botId?: string;
  phase: number;
}

interface Label {
  el: HTMLDivElement;
  anchor: () => THREE.Vector3 | null;
}

const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

export class InteriorScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  private host: HTMLElement;
  private overlay: HTMLElement;
  private opts: InteriorOptions;
  private room = new THREE.Group();
  private chars = new Map<string, Character>();
  private bots: Bot[] = [];
  private world: World | null = null;
  private walls: Wall[] = [];
  private screens: Screen[] = [];
  private labels: Label[] = [];
  private botLabels = new Map<string, { el: HTMLDivElement; name: HTMLDivElement; tag: HTMLSpanElement; bubble: HTMLDivElement }>();
  private hoverCard: HTMLDivElement;
  private hoverInner: HTMLDivElement;
  private doors: { l: THREE.Object3D; r: THREE.Object3D; carLight: THREE.MeshBasicMaterial; indicator: HTMLDivElement | null } | null = null;
  private tableHit: THREE.Mesh | null = null;
  private tableGlow: THREE.MeshBasicMaterial | null = null;
  private approvalsTex: THREE.CanvasTexture | null = null;
  private approvalsMat: THREE.MeshBasicMaterial | null = null;
  private approvalsCount = -1;
  private raf = 0;
  private yaw = Math.PI / 4;
  private yawTarget = Math.PI / 4;
  private zoom = 1;
  private pan = new THREE.Vector2(0, 0);
  private hovered: string | null = null;
  private labelHover: string | null = null;
  private hoverTable = false;
  private pointer = new THREE.Vector2(-9, -9);
  private raycaster = new THREE.Raycaster();
  private t = 0;
  private frozen = false;
  private lastNow = 0;
  private size = { w: 1, h: 1 };
  private ro: ResizeObserver;
  private shared = {
    glow: tex.glowTexture(),
    blob: tex.blobTexture(),
    ao: tex.aoStripTexture(),
  };
  private drag: { x: number; y: number; moved: boolean; rotated: boolean; panX: number; panY: number } | null = null;

  constructor(host: HTMLElement, overlay: HTMLElement, opts: InteriorOptions) {
    this.host = host;
    this.overlay = overlay;
    this.opts = opts;
    if (opts.floor === PENTHOUSE) this.zoom = 1.3;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);
    for (const k of Object.values(this.shared)) k.userData.shared = true;

    this.hoverCard = document.createElement("div");
    this.hoverCard.className = "iso-card";
    this.hoverCard.style.display = "none";
    this.hoverInner = document.createElement("div");
    this.hoverInner.className = "in";
    this.hoverCard.appendChild(this.hoverInner);
    overlay.appendChild(this.hoverCard);

    this.setupLights();
    this.scene.add(this.room);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();
    this.raf = requestAnimationFrame(this.frame);
  }

  private setupLights() {
    const hemi = new THREE.HemisphereLight("#fff4e2", "#3a4258", 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight("#ffe7c4", 2.1);
    sun.position.set(FLOOR_W / 2 - 9, 18, FLOOR_D / 2 + 12);
    sun.target.position.set(FLOOR_W / 2, 0, FLOOR_D / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -14;
    s.right = 14;
    s.top = 14;
    s.bottom = -14;
    s.near = 1;
    s.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight("#9fc2ff", 0.45);
    fill.position.set(FLOOR_W + 8, 10, -6);
    this.scene.add(fill);
  }

  setWorld(world: World, bots: Bot[]) {
    const key = (list: Bot[]) =>
      list
        .filter((b) => world.homes.has(b.id))
        .map((b) => `${b.id}:${b.hired}:${b.companyId}:${b.departmentId}`)
        .join("|");
    const changed = !this.world || key(this.bots) !== key(bots);
    this.world = world;
    this.bots = bots;
    if (changed) this.rebuild();
    for (const b of bots) {
      const ch = this.chars.get(b.id);
      if (ch) setCharacterStatus(ch, b.status);
    }
  }

  setApprovals(count: number) {
    if (count === this.approvalsCount || !this.approvalsMat) {
      this.approvalsCount = count;
      return;
    }
    this.approvalsCount = count;
    this.approvalsTex?.dispose();
    this.approvalsTex = tex.approvalsTexture(count);
    this.approvalsMat.map = this.approvalsTex;
    this.approvalsMat.needsUpdate = true;
  }

  setTime(t: number, frozen: boolean) {
    this.t = t;
    this.frozen = frozen;
  }

  rotate(dir: 1 | -1) {
    this.yawTarget += (dir * Math.PI) / 2;
  }
  zoomBy(f: number) {
    this.zoom = Math.min(3.2, Math.max(0.85, this.zoom * f));
    if (this.zoom <= 1.02) this.pan.set(0, 0);
    this.resize();
  }
  resetView() {
    this.zoom = 1;
    this.pan.set(0, 0);
    this.yawTarget = Math.round((this.yawTarget - Math.PI / 4) / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 4;
    this.resize();
  }

  private clearRoom() {
    disposeObject(this.room);
    this.room.clear();
    this.chars.clear();
    this.walls = [];
    this.screens = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    for (const l of this.botLabels.values()) l.el.remove();
    this.botLabels.clear();
    this.doors = null;
    this.tableHit = null;
    this.tableGlow = null;
    this.approvalsMat = null;
  }

  private rebuild() {
    this.clearRoom();
    const floor = this.opts.floor;
    const co = companies.find((c) => c.floor === floor);
    const accent = co ? palette[co.color].accent : "#3b82f6";
    const tint = co ? palette[co.color].face : "#93c5fd";
    this.buildShell(accent, tint, co ? co.name : "Presidência", co ? co.tagline : "Sala do conselho", floor === PENTHOUSE);
    this.buildElevator(accent);
    if (co) this.buildCompanyFloor(co.id, accent, tint);
    else this.buildPenthouse();
    this.buildCharacters();
    this.approvalsCount = -1;
  }

  private add<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
    o.traverse((x) => {
      if ((x as THREE.Mesh).isMesh) {
        x.castShadow = cast;
        x.receiveShadow = receive;
      }
    });
    this.room.add(o);
    return o;
  }

  private box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0) {
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return this.add(m);
  }

  private label(html: string, cls: string, anchor: () => THREE.Vector3 | null, onClick?: () => void) {
    const el = document.createElement("div");
    el.className = cls;
    const inner = document.createElement("div");
    inner.className = "in";
    inner.innerHTML = html;
    el.appendChild(inner);
    if (onClick) {
      el.style.pointerEvents = "auto";
      el.style.cursor = "pointer";
      el.addEventListener("click", onClick);
    }
    this.overlay.appendChild(el);
    this.labels.push({ el, anchor });
    return inner;
  }

  private buildShell(accent: string, tint: string, name: string, sub: string, penthouse: boolean) {
    const W = FLOOR_W;
    const D = FLOOR_D;
    const slab = this.box(W + 0.5, 0.4, D + 0.5, std("#1c2436", 0.9), W / 2, -0.2, D / 2);
    slab.castShadow = false;
    const edge = this.box(W + 0.52, 0.07, D + 0.52, new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55 }), W / 2, -0.06, D / 2);
    edge.castShadow = false;
    const planks = tex.plankTexture();
    planks.repeat.set(W / 3.2, D / 3.2);
    const floorMat = new THREE.MeshStandardMaterial({ map: planks, color: penthouse ? "#c9a27a" : "#e9d2b4", roughness: 0.75 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0.001, D / 2);
    this.add(floor, false, true);

    const wallMat = std("#f3efe8", 0.85);
    const capMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
    const mkWall = (len: number, along: "x" | "z", x: number, z: number, normal: [number, number], low: number) => {
      const geo = new THREE.BoxGeometry(along === "x" ? len : 0.16, WALL_H, along === "x" ? 0.16 : len);
      geo.translate(0, WALL_H / 2, 0);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, 0, z);
      this.add(mesh);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? len + 0.02 : 0.18, 0.08, along === "x" ? 0.18 : len + 0.02), capMat);
      cap.position.y = WALL_H;
      mesh.add(cap);
      const wall: Wall = { mesh, normal: new THREE.Vector2(normal[0], normal[1]), attachments: [], low };
      this.walls.push(wall);
      return wall;
    };
    const back = mkWall(W + 0.16, "x", W / 2, -0.08, [0, -1], 0.06);
    const left = mkWall(D + 0.16, "z", -0.08, D / 2, [-1, 0], 0.06);
    mkWall(W + 0.16, "x", W / 2, D + 0.08, [0, 1], 0.05);
    mkWall(D + 0.16, "z", W + 0.08, D / 2, [1, 0], 0.05);

    const band = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.12), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.8 }));
    band.position.set(W / 2, 0.9, 0.002);
    this.add(band, false);
    back.attachments.push(band);
    const bandL = new THREE.Mesh(new THREE.PlaneGeometry(D, 0.12), band.material);
    bandL.rotation.y = Math.PI / 2;
    bandL.position.set(0.002, 0.9, D / 2);
    this.add(bandL, false);
    left.attachments.push(bandL);
    const aoMat = new THREE.MeshBasicMaterial({ map: this.shared.ao, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const aoBack = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.6), aoMat);
    aoBack.rotation.x = -Math.PI / 2;
    aoBack.position.set(W / 2, 0.004, 0.3);
    this.add(aoBack, false, false);
    const aoLeft = new THREE.Mesh(new THREE.PlaneGeometry(D, 0.6), aoMat);
    aoLeft.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    aoLeft.position.set(0.3, 0.004, D / 2);
    this.add(aoLeft, false, false);

    const glass = new THREE.MeshBasicMaterial({ map: cityTexture(), color: "#ffffff" });
    const frameMat = std("#3a4357", 0.5, 0.3);
    for (const zc of [5.0, 7.4, 9.8]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), glass);
      win.rotation.y = Math.PI / 2;
      win.position.set(0.03, 1.55, zc);
      this.add(win, false, false);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.37, 2.12), frameMat);
      fr.position.set(-0.02, 1.55, zc);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.25, 0.05), frameMat);
      inner.position.set(0.02, 1.55, zc);
      this.add(fr, false);
      this.add(inner, false);
      left.attachments.push(win, fr, inner);
    }

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.25), new THREE.MeshBasicMaterial({ map: tex.signTexture(name, sub, accent), transparent: true }));
    sign.position.set(5.9, 1.75, 0.012);
    this.add(sign, false, false);
    back.attachments.push(sign);
  }

  private buildElevator(accent: string) {
    const steel = std("#9aa5b8", 0.35, 0.7);
    const frame = new THREE.Group();
    const cx = (ELEV.x0 + ELEV.x1) / 2;
    const w = ELEV.x1 - ELEV.x0;
    const post = new THREE.BoxGeometry(0.14, 2.3, 0.2);
    for (const x of [ELEV.x0 - 0.07, ELEV.x1 + 0.07]) {
      const p = new THREE.Mesh(post, steel);
      p.position.set(x, 1.15, 0.05);
      frame.add(p);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, 0.3, 0.2), steel);
    head.position.set(cx, 2.45, 0.05);
    frame.add(head);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: accent }));
    lamp.position.set(cx, 2.45, 0.16);
    frame.add(lamp);
    this.add(frame);
    const carLight = new THREE.MeshBasicMaterial({ color: "#fdf2d8" });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w, 2.3, 1.4), new THREE.MeshStandardMaterial({ color: "#d9dde6", side: THREE.BackSide, roughness: 0.5 }));
    cab.position.set(cx, 1.15, -0.85);
    this.add(cab, false, true);
    const cabLamp = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.9), carLight);
    cabLamp.rotation.x = Math.PI / 2;
    cabLamp.position.set(cx, 2.28, -0.85);
    this.add(cabLamp, false, false);
    const doorMat = std("#b8c1d1", 0.28, 0.85);
    const mkDoor = () => {
      const g = new THREE.Group();
      const d = new THREE.Mesh(new THREE.BoxGeometry(w / 2, 2.28, 0.05), doorMat);
      d.position.y = 1.14;
      g.add(d);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.28, 0.052), std("#7b8698", 0.4, 0.6));
      strip.position.y = 1.14;
      g.add(strip);
      this.add(g);
      return g;
    };
    const l = mkDoor();
    const r = mkDoor();
    l.position.set(cx - w / 4, 0, 0.06);
    r.position.set(cx + w / 4, 0, 0.06);
    const indicator = this.label("", "iso-elev", () => new THREE.Vector3(cx, 2.85, 0.1));
    this.doors = { l, r, carLight, indicator };
  }

  private furniture() {
    const wood = std("#c49a6c", 0.6);
    const darkWood = std("#6b4a33", 0.6);
    const metal = std("#3b4252", 0.45, 0.4);
    const chairMat = std("#2f3546", 0.7);
    const leaf = std("#3f9b5a", 0.8);
    const leaf2 = std("#57b56d", 0.8);
    const pot = std("#c0693b", 0.8);
    const blobMat = new THREE.MeshBasicMaterial({ map: this.shared.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    return { wood, darkWood, metal, chairMat, leaf, leaf2, pot, blobMat };
  }

  private blob(x: number, z: number, sx: number, sz: number, mat: THREE.Material) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    b.rotation.x = -Math.PI / 2;
    b.position.set(x, 0.006, z);
    this.add(b, false, false);
  }

  private plant(x: number, z: number, big = false) {
    const f = this.furniture();
    const s = big ? 1.3 : 1;
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.36 * s, 14), f.pot);
    p.position.y = 0.18 * s;
    g.add(p);
    const blobs: [number, number, number, number, THREE.Material][] = [
      [0, 0.62, 0, 0.3, f.leaf],
      [0.13, 0.78, 0.05, 0.22, f.leaf2],
      [-0.12, 0.84, -0.05, 0.2, f.leaf2],
      [0.02, 1.0, 0.02, 0.17, f.leaf],
    ];
    for (const [bx, by, bz, br, m] of blobs) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(br * s, 0), m);
      b.position.set(bx * s, by * s, bz * s);
      b.rotation.set(bx * 3, by * 2, bz);
      g.add(b);
    }
    g.position.set(x, 0, z);
    this.add(g);
    this.blob(x, z, 0.8 * s, 0.8 * s, f.blobMat);
  }

  private chair(x: number, z: number, facing: number, exec = false, color?: string) {
    const f = this.furniture();
    const g = new THREE.Group();
    const seatMat = color ? std(color, 0.6) : f.chairMat;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(exec ? 0.6 : 0.5, 0.09, exec ? 0.56 : 0.48, 2, 0.04), seatMat);
    seat.position.y = SEAT_TOP - 0.045;
    g.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(exec ? 0.6 : 0.48, exec ? 0.95 : 0.55, 0.08, 2, 0.04), seatMat);
    back.position.set(0, SEAT_TOP + (exec ? 0.5 : 0.3), -0.26);
    back.rotation.x = -0.08;
    g.add(back);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, SEAT_TOP - 0.1, 8), f.metal);
    stem.position.y = (SEAT_TOP - 0.1) / 2 + 0.05;
    g.add(stem);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 5), f.metal);
    base.position.y = 0.04;
    g.add(base);
    if (exec) {
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.06, 0.42, 2, 0.02), seatMat);
        arm.position.set(s * 0.32, SEAT_TOP + 0.2, -0.02);
        g.add(arm);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    this.add(g);
    return g;
  }

  private desk(x: number, z: number, botId: string | undefined, seed: number) {
    const f = this.furniture();
    const g = new THREE.Group();
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.06, 0.72, 2, 0.02), f.wood);
    top.position.y = 0.74;
    g.add(top);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.62), f.metal);
      leg.position.set(s * 0.62, 0.36, 0);
      g.add(leg);
    }
    const modesty = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.03), f.metal);
    modesty.position.set(0, 0.52, 0.3);
    g.add(modesty);
    const mon = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.42, 0.045, 2, 0.015), std("#1c2130", 0.5));
    mon.position.set(0, 1.12, 0.16);
    g.add(mon);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.04), f.metal);
    stand.position.set(0, 0.86, 0.19);
    g.add(stand);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.16), f.metal);
    foot.position.set(0, 0.775, 0.18);
    g.add(foot);
    const screenMat = new THREE.MeshBasicMaterial({ map: tex.screenTexture(seed), color: "#7fb4ff" });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), screenMat);
    screen.rotation.y = Math.PI;
    screen.position.set(0, 1.12, 0.136);
    g.add(screen);
    const spill = new THREE.MeshBasicMaterial({ map: this.shared.glow, color: "#60a5fa", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const spillMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), spill);
    spillMesh.rotation.x = -Math.PI / 2;
    spillMesh.position.set(0, 0.776, -0.06);
    g.add(spillMesh);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.7), spill);
    back.position.set(0, 1.14, 0.2);
    g.add(back);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.15), std("#2b3142", 0.6));
    kb.position.set(0, 0.78, -0.12);
    g.add(kb);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), std(["#f8fafc", "#fca5a5", "#93c5fd", "#fde68a"][seed % 4]!, 0.5));
    mug.position.set(0.5, 0.82, -0.15);
    g.add(mug);
    if (seed % 3 === 0) {
      const papers = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.2), std("#f1f5f9", 0.9));
      papers.position.set(-0.46, 0.79, -0.08);
      papers.rotation.y = 0.2;
      g.add(papers);
    }
    g.position.set(x, 0, z);
    this.add(g);
    spillMesh.castShadow = false;
    back.castShadow = false;
    screen.castShadow = false;
    this.blob(x, z, 1.8, 1.1, f.blobMat);
    this.screens.push({ mat: screenMat, spill, botId, phase: seed * 1.7 });
  }

  private buildCompanyFloor(companyId: string, accent: string, tint: string) {
    const f = this.furniture();
    const groups = desksOf(companyId, this.bots);
    let seed = 1;
    groups.forEach((g, zi) => {
      const zone = ZONES[zi]!;
      const rugW = zone.x1 - zone.x0;
      const rugD = zi === 2 ? 3.3 : 3.4;
      const rugZ = zone.deskZ - 0.3;
      const rug = new THREE.Mesh(new RoundedBoxGeometry(rugW, 0.02, rugD, 2, 0.01), std(new THREE.Color(tint).lerp(new THREE.Color("#3a4358"), 0.55), 0.95));
      rug.position.set((zone.x0 + zone.x1) / 2, 0.012, rugZ);
      this.add(rug, false, true);
      for (const d of g.desks) {
        this.desk(d.x, d.z, d.botId, seed++);
        this.chair(d.x, zone.seatZ - 0.08, 0);
      }
      this.label(`<span class="dot" style="background:${accent}"></span>${g.dept.name}`, "iso-zone", () => new THREE.Vector3(zone.cx, 0.05, rugZ + rugD / 2 - 0.1));
    });

    const counter = this.box(1.9, 0.92, 0.6, std("#f8fafc", 0.6), COFFEE.x, 0.46, 0.38, 0.03);
    counter.castShadow = true;
    this.box(1.94, 0.05, 0.64, f.darkWood, COFFEE.x, 0.94, 0.38);
    this.box(0.36, 0.42, 0.32, std("#111827", 0.4, 0.3), COFFEE.x - 0.45, 1.17, 0.3, 0.03);
    this.box(0.12, 0.04, 0.12, new THREE.MeshBasicMaterial({ color: "#ef4444" }), COFFEE.x - 0.45, 1.25, 0.47);
    for (let i = 0; i < 3; i++) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 10), std("#f8fafc", 0.5));
      cup.position.set(COFFEE.x + 0.1 + i * 0.16, 1.02, 0.42);
      this.add(cup);
    }
    this.box(0.62, 1.7, 0.6, std("#cbd5e1", 0.4, 0.4), COFFEE.x + 1.35, 0.85, 0.36, 0.04);
    this.label("Café", "iso-zone small", () => new THREE.Vector3(COFFEE.x, 0.05, 1.0));

    const shelf = this.box(0.42, 1.8, 1.9, f.darkWood, 0.26, 0.9, 2.4);
    shelf.castShadow = true;
    const r = tex.rng(companyId.length * 13);
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 6; i++) {
        const h = 0.22 + r() * 0.12;
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.12), std(["#ef4444", "#3b82f6", "#f59e0b", "#10b981", accent, "#e5e7eb"][(i + row) % 6]!, 0.7));
        book.position.set(0.5, 0.3 + row * 0.56 + h / 2, 1.62 + i * 0.27);
        this.add(book);
      }

    const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshStandardMaterial({ map: tex.whiteboardTexture(accent, companyId.length), roughness: 0.4 }));
    wb.position.set(11.3, 1.55, 0.012);
    this.add(wb, false, true);
    this.walls[0]?.attachments.push(wb);

    const glassMat = new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const mullion = std("#9aa5b8", 0.35, 0.6);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(MEETING.x1 - MEETING.x0, MEETING.z1 - MEETING.z0), std(new THREE.Color(accent).lerp(new THREE.Color("#1f2937"), 0.7), 0.95));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set((MEETING.x0 + MEETING.x1) / 2, 0.008, (MEETING.z0 + MEETING.z1) / 2);
    this.add(carpet, false, true);
    const gH = 2.2;
    const pane = (x: number, z: number, w: number, along: "x" | "z") => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? w : 0.03, gH, along === "x" ? 0.03 : w), glassMat);
      p.position.set(x, gH / 2, z);
      this.add(p, false, false);
      const top = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? w : 0.07, 0.06, along === "x" ? 0.07 : w), mullion);
      top.position.set(x, gH, z);
      const bottom = top.clone();
      bottom.position.y = 0.03;
      this.add(top);
      this.add(bottom, false);
    };
    pane((MEETING.x0 + MEETING.x1) / 2, MEETING.z1, MEETING.x1 - MEETING.x0, "x");
    pane(MEETING.x0, (MEETING.z0 + MEETING.door.z - 0.55) / 2, MEETING.door.z - 0.55 - MEETING.z0, "z");
    pane(MEETING.x0, (MEETING.door.z + 0.55 + MEETING.z1) / 2, MEETING.z1 - MEETING.door.z - 0.55, "z");
    for (const [x, z] of [
      [MEETING.x0, MEETING.z1],
      [MEETING.x0, MEETING.door.z - 0.55],
      [MEETING.x0, MEETING.door.z + 0.55],
      [MEETING.x1, MEETING.z1],
    ] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, gH, 0.07), mullion);
      post.position.set(x, gH / 2, z);
      this.add(post);
    }
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.07, 40), f.darkWood);
    table.scale.set(1.35, 1, 0.9);
    table.position.set(MEETING.table.x, 0.74, MEETING.table.z);
    this.add(table);
    const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.72, 12), f.metal);
    tLeg.position.set(MEETING.table.x, 0.36, MEETING.table.z);
    this.add(tLeg);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = MEETING.table.x + Math.sin(a) * 1.9;
      const z = MEETING.table.z + Math.cos(a) * 1.3;
      this.chair(x, z, Math.atan2(MEETING.table.x - x, MEETING.table.z - z), false, accent);
    }
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshBasicMaterial({ map: tex.screenTexture(99), color: "#9cc8ff" }));
    tv.position.set(MEETING.table.x, 1.6, 0.012);
    this.add(tv, false, false);
    this.walls[0]?.attachments.push(tv);
    this.label("Sala de reunião", "iso-zone small", () => new THREE.Vector3(MEETING.table.x, 0.05, MEETING.z1 - 0.35));

    for (const [x, z, big] of [
      [0.55, 10.35, true],
      [17.4, 10.4, true],
      [8.05, 9.9, false],
      [12.35, 10.3, false],
      [11.0, 0.5, false],
      [17.3, 0.75, false],
      [3.4, 0.5, false],
    ] as const)
      this.plant(x, z, big);
  }

  private buildPenthouse() {
    const f = this.furniture();
    const T = BOARD.table;
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.radius + 1.6, BOARD.radius + 1.6, 0.02, 64), std("#2a2f45", 0.95));
    rug.position.set(T.x, 0.011, T.z);
    this.add(rug, false, true);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BOARD.radius + 1.45, 0.04, 6, 80), new THREE.MeshBasicMaterial({ color: "#f59e0b" }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(T.x, 0.03, T.z);
    this.add(ring, false, false);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.radius, BOARD.radius, 0.09, 72), std("#4a3121", 0.45));
    top.position.set(T.x, 0.76, T.z);
    this.add(top);
    const inlay = new THREE.Mesh(new THREE.RingGeometry(BOARD.radius - 0.22, BOARD.radius - 0.16, 72), new THREE.MeshStandardMaterial({ color: "#d4a24c", metalness: 0.7, roughness: 0.3 }));
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(T.x, 0.806, T.z);
    this.add(inlay, false, false);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 0.72, 24), std("#2c1d14", 0.5));
    base.position.set(T.x, 0.36, T.z);
    this.add(base);
    this.tableGlow = new THREE.MeshBasicMaterial({ map: this.shared.glow, color: "#f59e0b", transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), this.tableGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(T.x, 0.81, T.z);
    this.add(glow, false, false);
    const folder = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.44), std("#f59e0b", 0.5));
    folder.position.set(T.x, 0.83, T.z);
    folder.rotation.y = 0.3;
    this.add(folder);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.36), std("#f8fafc", 0.8));
    paper.position.set(T.x + 0.02, 0.852, T.z - 0.01);
    paper.rotation.y = 0.22;
    this.add(paper);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.radius, BOARD.radius, 1, 24), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(T.x, 0.5, T.z);
    this.room.add(hit);
    this.tableHit = hit;
    for (const id of ["tavinho", "rafa", "vera", "dante", "fabio", "voce"]) {
      const s = boardSeat(id)!;
      const back = 0.12;
      this.chair(s.x - Math.sin(s.facing) * back, s.z - Math.cos(s.facing) * back, s.facing, true, id === "voce" ? "#1e3a8a" : "#1f1a17");
      if (id !== "voce") {
        const px = s.x + Math.sin(s.facing) * 0.75;
        const pz = s.z + Math.cos(s.facing) * 0.75;
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.22), std("#e2e8f0", 0.8));
        pad.position.set(px, 0.815, pz);
        pad.rotation.y = s.facing;
        this.add(pad);
      }
    }
    const you = boardSeat("voce")!;
    const youOrb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshBasicMaterial({ color: "#3b82f6" }));
    youOrb.position.set(you.x, 1.45, you.z);
    this.room.add(youOrb);
    const youHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.shared.glow, color: "#3b82f6", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    youHalo.scale.set(0.9, 0.9, 1);
    youHalo.position.copy(youOrb.position);
    this.room.add(youHalo);
    this.label(`<strong>você</strong>`, "iso-name you", () => new THREE.Vector3(you.x, 1.85, you.z));

    this.approvalsMat = new THREE.MeshBasicMaterial({ map: tex.approvalsTexture(0) });
    this.approvalsTex = this.approvalsMat.map as THREE.CanvasTexture;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.125), this.approvalsMat);
    screen.position.set(12.2, 1.6, 0.012);
    this.add(screen, false, false);
    this.walls[0]?.attachments.push(screen);
    this.box(3.2, 0.7, 0.5, f.darkWood, 15.6, 0.35, 0.35, 0.03);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.66), new THREE.MeshBasicMaterial({ map: tex.logoTexture("OTÁVIO BOT"), transparent: true }));
    logo.position.set(15.6, 1.75, 0.012);
    this.add(logo, false, false);
    this.walls[0]?.attachments.push(logo);
    for (const [x, z] of [
      [16.2, 8.6],
      [3.6, 8.8],
    ] as const) {
      this.box(2.2, 0.42, 0.85, std("#334155", 0.8), x, 0.21, z, 0.08);
      this.box(2.2, 0.55, 0.2, std("#334155", 0.8), x, 0.55, z - 0.36, 0.06);
    }
    for (const [x, z, big] of [
      [0.6, 10.3, true],
      [17.4, 10.3, true],
      [17.3, 0.7, false],
      [6.9, 0.55, false],
      [13.7, 0.6, false],
    ] as const)
      this.plant(x, z, big);
    this.label(`Mesa do conselho`, "iso-zone", () => new THREE.Vector3(T.x, 0.05, T.z + BOARD.radius + 1.75));
  }

  private buildCharacters() {
    if (!this.world) return;
    for (const b of this.bots) {
      if (!this.world.homes.has(b.id)) continue;
      const ch = buildCharacter(b.id, b.figurinha, outfitOf(b), this.shared.glow, this.shared.blob);
      setCharacterStatus(ch, b.status);
      ch.root.visible = false;
      this.room.add(ch.root);
      this.chars.set(b.id, ch);
      const el = document.createElement("div");
      el.className = "iso-bot";
      const bubble = document.createElement("div");
      bubble.className = "iso-bubble";
      const tag = document.createElement("span");
      tag.className = "iso-tag";
      const name = document.createElement("div");
      name.className = "iso-name";
      name.textContent = b.name;
      name.style.pointerEvents = "auto";
      name.addEventListener("click", () => this.opts.onBotClick(b.id));
      name.addEventListener("mouseenter", () => (this.labelHover = b.id));
      name.addEventListener("mouseleave", () => (this.labelHover = null));
      el.append(bubble, tag, name);
      this.overlay.appendChild(el);
      this.botLabels.set(b.id, { el, name, tag, bubble });
    }
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.placeCamera();
  }

  private placeCamera() {
    const pitch = 0.6;
    const target = new THREE.Vector3(FLOOR_W / 2, 0.9, FLOOR_D / 2);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
    this.camera.position.copy(target).addScaledVector(dir, 60);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const x of [-0.3, FLOOR_W + 0.3])
      for (const y of [-0.4, WALL_H + 0.3])
        for (const z of [-0.3, FLOOR_D + 0.3]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
    const aspect = this.size.w / this.size.h;
    let hw = (maxX - minX) / 2;
    let hh = (maxY - minY) / 2;
    if (hw / hh > aspect) hh = hw / aspect;
    else hw = hh * aspect;
    const m = 1.06;
    const cx = (minX + maxX) / 2 + this.pan.x;
    const cy = (minY + maxY) / 2 + this.pan.y;
    this.camera.left = cx - hw * m;
    this.camera.right = cx + hw * m;
    this.camera.top = cy + hh * m;
    this.camera.bottom = cy - hh * m;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onLeave = () => {
    this.pointer.set(-9, -9);
  };

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
    if (this.zoom > 1.02) {
      const unitsPerPx = (this.camera.right - this.camera.left) / this.camera.zoom / this.size.w;
      this.pan.set(this.drag.panX - dx * unitsPerPx, this.drag.panY + dy * unitsPerPx);
      this.placeCamera();
    } else if (!this.drag.rotated && Math.abs(dx) > 70) {
      this.rotate(dx > 0 ? -1 : 1);
      this.drag.rotated = true;
    }
  };

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: false, rotated: false, panX: this.pan.x, panY: this.pan.y };
    this.onMove(e);
  };

  private onUp = () => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved) return;
    if (this.hovered) this.opts.onBotClick(this.hovered);
    else if (this.hoverTable) this.opts.onTableClick?.();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.size.w, y: ((1 - p.y) / 2) * this.size.h, inside: p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1 };
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (Math.abs(this.yaw - this.yawTarget) > 0.0005) {
      this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 7);
      this.placeCamera();
    }
    this.update(now / 1000, dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(real: number, dt: number) {
    const w = this.world;
    if (!w) return;
    const t = this.t;
    const floor = this.opts.floor;
    const frozen = this.frozen;
    const live = frozen ? 0 : 1;

    const cam = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    for (const wall of this.walls) {
      const target = wall.normal.dot(cam) > 0.15 ? wall.low / WALL_H : 1;
      wall.mesh.scale.y += (target - wall.mesh.scale.y) * Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));
      const show = wall.mesh.scale.y > 0.6;
      for (const a of wall.attachments) a.visible = show;
    }

    if (this.doors) {
      const open = frozen ? 0 : doorOpen(w, floor, t);
      const cx = (ELEV.x0 + ELEV.x1) / 2;
      const half = (ELEV.x1 - ELEV.x0) / 4;
      this.doors.l.position.x = cx - half - open * half * 1.85;
      this.doors.r.position.x = cx + half + open * half * 1.85;
      const cy = carFloor(w, t);
      if (this.doors.indicator) {
        const fl = Math.round(cy);
        const moving = Math.abs(cy - fl) > 0.02;
        const lbl = fl === 0 ? "T" : fl === PENTHOUSE ? "C" : `${fl}º`;
        const arrow = moving ? (w.car.some((m) => m.to > m.from && cy > m.from && cy < m.to) ? "▲" : "▼") : "";
        this.doors.indicator.textContent = `${arrow} ${lbl}`.trim();
        this.doors.indicator.classList.toggle("here", !moving && fl === floor);
      }
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = [...this.chars.values()].filter((c) => c.root.visible).map((c) => c.hit);
    const inter = this.raycaster.intersectObjects(hits, false)[0];
    const pickedBot = inter ? (inter.object.userData.botId as string) : null;
    const hoverBot = pickedBot ?? this.labelHover;
    this.hovered = hoverBot;
    this.hoverTable = !hoverBot && !!this.tableHit && this.raycaster.intersectObject(this.tableHit, false).length > 0;
    this.renderer.domElement.style.cursor = hoverBot || this.hoverTable ? "pointer" : this.zoom > 1.02 ? "grab" : "default";
    if (this.tableGlow) this.tableGlow.opacity = (this.approvalsCount > 0 ? 0.55 + 0.3 * Math.sin(real * 3) * live : 0.15) + (this.hoverTable ? 0.3 : 0);

    const statusOf = new Map<string, Status>();
    for (const b of this.bots) statusOf.set(b.id, statusAt(w, b, t));
    for (const s of this.screens) {
      const st = s.botId ? statusOf.get(s.botId) : undefined;
      const pose = s.botId ? poseAt(w, s.botId, t, frozen) : undefined;
      const away = !pose || pose.mode !== "sentado";
      let col = "#1e293b";
      let k = 1;
      if (st && !away) {
        if (st === "trabalhando") {
          col = "#7fb4ff";
          k = 0.85 + 0.15 * Math.sin(real * 9 + s.phase) * live + 0.08 * Math.sin(real * 23 + s.phase) * live;
        } else if (st === "esperando") {
          col = "#fbbf24";
          k = 0.75 + 0.25 * Math.sin(real * 3) * live;
        } else if (st === "bloqueado") {
          col = "#f87171";
          k = 0.8 + 0.2 * Math.sin(real * 5) * live;
        } else col = "#334155";
      } else if (st) col = "#3b5998";
      s.mat.color.set(col).multiplyScalar(k);
      s.spill.color.set(col);
      s.spill.opacity = st && !away && st !== "ocioso" ? 0.32 * k : 0.06;
    }

    const bubbles = new Map(bubblesAt(w, t).map((b) => [b.bot, b.text]));
    for (const b of this.bots) {
      const ch = this.chars.get(b.id);
      const lab = this.botLabels.get(b.id);
      if (!ch || !lab) continue;
      const pose = poseAt(w, b.id, t, frozen);
      const here = !!pose && pose.floor === floor && pose.mode !== "elevador" && Math.abs(pose.floorY - floor) < 0.01 && !(pose.z < -0.1 && doorOpen(w, floor, t) < 0.3);
      ch.root.visible = here;
      if (!pose || !here) {
        lab.el.style.display = "none";
        continue;
      }
      const st = statusOf.get(b.id) ?? b.status;
      if (st !== ch.status) setCharacterStatus(ch, st);
      const seated = pose.mode === "sentado";
      if (seated !== ch.seated) setSeated(ch, seated, SEAT_TOP);
      ch.root.position.set(pose.x, 0, pose.z);
      ch.root.rotation.y = pose.facing;
      const rig = ch.rig;
      rig.rotation.set(0, 0, 0);
      ch.head.rotation.set(0, 0, 0);
      ch.legL.rotation.x = seated ? -Math.PI / 2 : 0;
      ch.legR.rotation.x = seated ? -Math.PI / 2 : 0;
      ch.armL.rotation.set(0, 0, 0.08);
      ch.armR.rotation.set(0, 0, -0.08);
      const ph = b.id.length * 1.3 + b.name.charCodeAt(0);
      if (pose.mode === "andando") {
        const s = Math.sin(pose.stride);
        ch.legL.rotation.x = s * 0.6;
        ch.legR.rotation.x = -s * 0.6;
        ch.armL.rotation.x = -s * 0.5;
        ch.armR.rotation.x = s * 0.5;
        rig.position.y = 0.26 + Math.abs(Math.cos(pose.stride)) * 0.035;
      } else if (pose.mode === "parado") {
        rig.position.y = 0.26;
        const talking = bubbles.has(b.id);
        if (talking) ch.armR.rotation.x = -0.9 + 0.25 * Math.sin(real * 6) * live;
        ch.head.rotation.z = 0.05 * Math.sin(real * 2 + ph) * live;
      } else if (seated) {
        const talking = bubbles.has(b.id);
        if (st === "trabalhando") {
          ch.armL.rotation.x = -1.15 + 0.12 * Math.sin(real * 16 + ph) * live;
          ch.armR.rotation.x = -1.15 + 0.12 * Math.sin(real * 16 + ph + 2) * live;
          rig.position.y = SEAT_TOP + 0.01 * Math.sin(real * 8 + ph) * live;
          ch.head.rotation.x = 0.08;
        } else if (st === "esperando") {
          ch.armL.rotation.x = -1.0;
          ch.armR.rotation.x = -1.0;
          ch.head.rotation.z = 0.12 * Math.sin(real * 1.5 + ph) * live;
        } else if (st === "bloqueado") {
          ch.armL.rotation.set(-2.4, 0, 0.5);
          ch.armR.rotation.set(-2.4, 0, -0.5);
          ch.head.rotation.y = 0.18 * Math.sin(real * 7) * live;
        } else {
          rig.rotation.x = -0.26;
          ch.armL.rotation.set(-0.3, 0, 0.35);
          ch.armR.rotation.set(-0.3, 0, -0.35);
          ch.head.rotation.x = -0.12;
        }
        if (talking && st !== "trabalhando") ch.armR.rotation.x = -1.3 + 0.2 * Math.sin(real * 6) * live;
      }
      if (ch.star) ch.star.rotation.y = real * 1.5 * live;
      const oy = orbHeight(ch) + (seated && st === "ocioso" ? -0.05 : 0);
      ch.orb.position.y = oy + 0.04 * Math.sin(real * 2.2 + ph) * live;
      ch.ring.rotation.z = real * 1.4 * live;
      const pulse = st === "esperando" ? 1 + 0.25 * Math.sin(real * 5) * live : st === "bloqueado" ? 1 + 0.15 * Math.sin(real * 9) * live : 1;
      ch.orb.scale.setScalar(pulse);
      setHover(ch, hoverBot === b.id);

      const world = new THREE.Vector3(pose.x, oy + 0.22, pose.z);
      const p = this.project(world);
      lab.el.style.display = p.inside ? "" : "none";
      lab.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      lab.el.classList.toggle("hover", hoverBot === b.id);
      const tagText = st === "esperando" ? "!" : st === "bloqueado" ? "2FA" : st === "ocioso" ? "zz" : "";
      if (lab.tag.textContent !== tagText) lab.tag.textContent = tagText;
      lab.tag.className = `iso-tag ${st}`;
      lab.tag.style.display = tagText ? "" : "none";
      const text = bubbles.get(b.id) ?? "";
      if (lab.bubble.textContent !== text) lab.bubble.textContent = text;
      lab.bubble.style.display = text ? "" : "none";
      lab.el.style.zIndex = hoverBot === b.id ? "4" : text ? "3" : "1";
    }

    if (hoverBot) {
      const b = this.bots.find((x) => x.id === hoverBot);
      const ch = this.chars.get(hoverBot);
      if (b && ch) {
        const st = statusOf.get(b.id) ?? b.status;
        const p = this.project(new THREE.Vector3(ch.root.position.x, 0, ch.root.position.z));
        this.hoverCard.style.display = "";
        this.hoverCard.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + 14).toFixed(1)}px, 0)`;
        const html = `<div class="t">${esc(b.name)} · ${esc(b.role)}</div><div class="s"><span class="dot" style="background:${statusColor[st]}"></span>${esc(statusLabel[st])}</div><div class="a">${esc(b.activity)}</div><div class="h">clique para abrir ${st === "bloqueado" ? "o computador" : "o chat"}</div>`;
        if (this.hoverCard.dataset.key !== `${b.id}:${st}`) {
          this.hoverInner.innerHTML = html;
          this.hoverCard.dataset.key = `${b.id}:${st}`;
        }
      }
    } else this.hoverCard.style.display = "none";

    for (const l of this.labels) {
      const a = l.anchor();
      if (!a) continue;
      const p = this.project(a);
      l.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    }
    if (this.opts.onAnchor && floor === PENTHOUSE) {
      const p = this.project(new THREE.Vector3(BOARD.table.x, 0.85, BOARD.table.z));
      this.opts.onAnchor("mesa", p.x, p.y, true);
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointerleave", this.onLeave);
    el.removeEventListener("wheel", this.onWheel);
    this.clearRoom();
    for (const k of Object.values(this.shared)) k.dispose();
    this.hoverCard.remove();
    this.renderer.dispose();
    el.remove();
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function cityTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, "#0b1430");
  g.addColorStop(1, "#24345e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 160);
  const r = tex.rng(5);
  for (let i = 0; i < 14; i++) {
    const w = 14 + r() * 26;
    const h = 40 + r() * 100;
    const x = i * 19 - 6;
    ctx.fillStyle = "#0a1022";
    ctx.fillRect(x, 160 - h, w, h);
    for (let y = 160 - h + 6; y < 156; y += 9)
      for (let xx = x + 3; xx < x + w - 3; xx += 6) if (r() > 0.55) {
        ctx.fillStyle = r() > 0.3 ? "#fcd34d" : "#93c5fd";
        ctx.fillRect(xx, y, 3, 4);
      }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
