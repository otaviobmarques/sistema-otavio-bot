import * as THREE from "three";
import type { DeskStatus } from "../building-view";
import { buildCharacter, disposeObject, orbHeight, setCharacterStatus, setHover, setSeated, type Character } from "./character";
import { RoomBuilder, SEAT_TOP, WALL_H, type RoomWords } from "./interior-room";
import { levelTag, STATUS_COLOR } from "./live-labels";
import type { LiveBot, LiveLayout } from "./live-model";
import { BOARD, ELEV, FLOOR_D, FLOOR_W, bubblesAt, carDirection, carLevel, doorOpen, poseAt, type World } from "./sim";
import * as tex from "./textures";

export interface InteriorWords extends RoomWords {
  status: (status: DeskStatus) => string;
  /** The hint under a hovered bot: what a click opens. */
  open: string;
}

export interface InteriorOptions {
  level: number;
  words: InteriorWords;
  onBotClick: (id: string) => void;
  onTableClick?: () => void;
  onAnchor?: (x: number, y: number) => void;
  /** The live clock, read at every frame: its time, and whether the scene holds still. */
  clock: () => { t: number; frozen: boolean };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One level's interior in three.js: the room, its furniture and its bots, drawn each frame from the live World. */
export class InteriorScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  private room = new THREE.Group();
  private chars = new Map<string, Character>();
  private layout: LiveLayout | null = null;
  private world: World | null = null;
  private builder: RoomBuilder;
  private botLabels = new Map<string, { el: HTMLDivElement; name: HTMLDivElement; tag: HTMLSpanElement; bubble: HTMLDivElement }>();
  private hoverCard: HTMLDivElement;
  private hoverInner: HTMLDivElement;
  private approvalsCount = -1;
  private raf = 0;
  private running = false;
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
  private shared = { glow: tex.glowTexture(), blob: tex.blobTexture(), ao: tex.aoStripTexture() };
  private drag: { x: number; y: number; moved: boolean; rotated: boolean; panX: number; panY: number } | null = null;

  constructor(private host: HTMLElement, private overlay: HTMLElement, private opts: InteriorOptions) {
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
    this.builder = new RoomBuilder(this.room, overlay, this.shared, opts.words);

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

  /** A new layout rebuilds the room only when it seats someone differently; statuses alone just repaint. */
  setScene(layout: LiveLayout, world: World, seating: string) {
    const changed = !this.layout || this.room.userData.seating !== seating;
    this.layout = layout;
    this.world = world;
    if (changed) {
      this.rebuild();
      this.room.userData.seating = seating;
    }
  }

  setApprovals(count: number) {
    const b = this.builder;
    if (count === this.approvalsCount || !b.approvalsMat) {
      this.approvalsCount = count;
      return;
    }
    this.approvalsCount = count;
    b.approvalsTex?.dispose();
    b.approvalsTex = tex.approvalsTexture(count, this.opts.words.approvals);
    b.approvalsMat.map = b.approvalsTex;
    b.approvalsMat.needsUpdate = true;
  }

  /** Frames are drawn only while running: a hidden window costs nothing. */
  setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    cancelAnimationFrame(this.raf);
    this.lastNow = 0;
    if (on) this.raf = requestAnimationFrame(this.frame);
  }

  /** Draws one frame now, for a scene that holds still (reduced motion) and only changes state. */
  renderOnce() {
    this.readClock();
    this.update(performance.now() / 1000, 0);
    this.renderer.render(this.scene, this.camera);
  }

  rotate(dir: 1 | -1) {
    this.yawTarget += (dir * Math.PI) / 2;
    if (!this.running) {
      this.yaw = this.yawTarget;
      this.placeCamera();
      this.renderOnce();
    }
  }

  zoomBy(f: number) {
    this.zoom = Math.min(3.2, Math.max(0.85, this.zoom * f));
    if (this.zoom <= 1.02) this.pan.set(0, 0);
    this.resize();
  }

  resetView() {
    this.zoom = this.layout && this.opts.level === this.layout.penthouse ? 1.3 : 1;
    this.pan.set(0, 0);
    this.yawTarget = Math.round((this.yawTarget - Math.PI / 4) / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 4;
    this.resize();
  }

  private clearRoom() {
    disposeObject(this.room);
    this.room.clear();
    this.chars.clear();
    for (const l of this.builder.labels) l.el.remove();
    for (const l of this.botLabels.values()) l.el.remove();
    this.botLabels.clear();
    this.builder = new RoomBuilder(this.room, this.overlay, this.shared, this.opts.words);
  }

  private rebuild() {
    this.clearRoom();
    const layout = this.layout!;
    const level = layout.levels[this.opts.level];
    if (!level) return;
    const penthouse = level.kind === "penthouse";
    if (penthouse && this.zoom === 1) this.zoom = 1.3;
    const b = this.builder;
    b.buildShell(level.accent, level.face, level.name, level.sub, penthouse);
    b.buildElevator(level.accent);
    if (penthouse) b.buildPenthouse(layout.bots.filter((bot) => bot.level === level.level).length);
    else b.buildOffice(layout, level.level, level.accent, level.face);
    this.buildCharacters(layout.bots);
    this.approvalsCount = -1;
    this.resize();
  }

  private buildCharacters(bots: LiveBot[]) {
    for (const b of bots) {
      const ch = buildCharacter(b.id, { ...b.look, palette: b.palette, mouth: "smile" }, b.outfit, this.shared.glow, this.shared.blob);
      setCharacterStatus(ch, b.status);
      ch.root.visible = false;
      this.room.add(ch.root);
      this.chars.set(b.id, ch);
      const el = document.createElement("div");
      el.className = "iso-bot";
      el.dataset.liveBot = b.id;
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
    if (!this.running) this.renderOnce();
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
    if (!this.running) this.renderOnce();
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
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (Math.abs(this.yaw - this.yawTarget) > 0.0005) {
      this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 7);
      this.placeCamera();
    }
    this.readClock();
    this.update(now / 1000, dt);
    this.renderer.render(this.scene, this.camera);
  };

  private readClock() {
    const clock = this.opts.clock();
    this.t = clock.t;
    this.frozen = clock.frozen;
  }

  private updateWalls(dt: number) {
    const cam = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
    for (const wall of this.builder.walls) {
      const target = wall.normal.dot(cam) > 0.15 ? wall.low / WALL_H : 1;
      wall.mesh.scale.y += (target - wall.mesh.scale.y) * Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));
      const show = wall.mesh.scale.y > 0.6;
      for (const a of wall.attachments) a.visible = show;
    }
  }

  private updateLift(w: World, layout: LiveLayout, t: number) {
    const doors = this.builder.doors;
    if (!doors) return;
    const level = this.opts.level;
    const open = this.frozen ? 0 : doorOpen(w, level, t);
    const cx = (ELEV.x0 + ELEV.x1) / 2;
    const half = (ELEV.x1 - ELEV.x0) / 4;
    doors.l.position.x = cx - half - open * half * 1.85;
    doors.r.position.x = cx + half + open * half * 1.85;
    if (!doors.indicator) return;
    const cy = carLevel(w, t);
    const fl = Math.round(cy);
    const moving = Math.abs(cy - fl) > 0.02;
    const dir = carDirection(w, t);
    const arrow = moving ? (dir > 0 ? "▲" : "▼") : "";
    doors.indicator.textContent = `${arrow} ${levelTag(fl, layout.penthouse)}`.trim();
    doors.indicator.classList.toggle("here", !moving && fl === level);
  }

  private updateScreens(w: World, byId: Map<string, LiveBot>, t: number, real: number, live: number) {
    for (const s of this.builder.screens) {
      const st = s.botId ? byId.get(s.botId)?.status : undefined;
      const pose = s.botId ? poseAt(w, s.botId, t) : undefined;
      const away = !pose || pose.mode !== "seated";
      let col = "#1e293b";
      let k = 1;
      if (st && !away) {
        if (st === "working") {
          col = "#7fb4ff";
          k = 0.85 + 0.15 * Math.sin(real * 9 + s.phase) * live + 0.08 * Math.sin(real * 23 + s.phase) * live;
        } else if (st === "waiting") {
          col = "#fbbf24";
          k = 0.75 + 0.25 * Math.sin(real * 3) * live;
        } else if (st === "blocked") {
          col = "#f87171";
          k = 0.8 + 0.2 * Math.sin(real * 5) * live;
        } else col = "#334155";
      } else if (st) col = "#3b5998";
      s.mat.color.set(col).multiplyScalar(k);
      s.spill.color.set(col);
      s.spill.opacity = st && !away && st !== "idle" ? 0.32 * k : 0.06;
    }
  }

  private update(real: number, dt: number) {
    const w = this.world;
    const layout = this.layout;
    if (!w || !layout) return;
    const t = this.t;
    const level = this.opts.level;
    const live = this.frozen ? 0 : 1;
    const byId = new Map(layout.bots.map((b) => [b.id, b]));

    this.updateWalls(dt);
    this.updateLift(w, layout, t);

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = [...this.chars.values()].filter((c) => c.root.visible).map((c) => c.hit);
    const inter = this.raycaster.intersectObjects(hits, false)[0];
    const pickedBot = inter ? (inter.object.userData.botId as string) : null;
    const hoverBot = pickedBot ?? this.labelHover;
    this.hovered = hoverBot;
    const tableHit = this.builder.tableHit;
    this.hoverTable = !hoverBot && !!tableHit && this.raycaster.intersectObject(tableHit, false).length > 0;
    this.renderer.domElement.style.cursor = hoverBot || this.hoverTable ? "pointer" : this.zoom > 1.02 ? "grab" : "default";
    const glow = this.builder.tableGlow;
    if (glow) glow.opacity = (this.approvalsCount > 0 ? 0.55 + 0.3 * Math.sin(real * 3) * live : 0.15) + (this.hoverTable ? 0.3 : 0);

    this.updateScreens(w, byId, t, real, live);

    const bubbles = bubblesAt(w, t);
    for (const b of layout.bots) {
      const ch = this.chars.get(b.id);
      const lab = this.botLabels.get(b.id);
      if (!ch || !lab) continue;
      const pose = poseAt(w, b.id, t);
      const here = !!pose && pose.level === level && pose.mode !== "riding" && Math.abs(pose.levelY - level) < 0.01 && !(pose.z < -0.1 && doorOpen(w, level, t) < 0.3);
      ch.root.visible = here;
      if (!pose || !here) {
        lab.el.style.display = "none";
        continue;
      }
      const st = b.status;
      if (st !== ch.status) setCharacterStatus(ch, st);
      const seated = pose.mode === "seated";
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
      const said = bubbles.get(b.id);
      if (pose.mode === "walking") {
        const s = Math.sin(pose.stride);
        ch.legL.rotation.x = s * 0.6;
        ch.legR.rotation.x = -s * 0.6;
        ch.armL.rotation.x = -s * 0.5;
        ch.armR.rotation.x = s * 0.5;
        rig.position.y = 0.26 + Math.abs(Math.cos(pose.stride)) * 0.035;
      } else if (pose.mode === "standing") {
        rig.position.y = 0.26;
        if (said) ch.armR.rotation.x = -0.9 + 0.25 * Math.sin(real * 6) * live;
        ch.head.rotation.z = 0.05 * Math.sin(real * 2 + ph) * live;
      } else if (seated) {
        if (st === "working") {
          ch.armL.rotation.x = -1.15 + 0.12 * Math.sin(real * 16 + ph) * live;
          ch.armR.rotation.x = -1.15 + 0.12 * Math.sin(real * 16 + ph + 2) * live;
          rig.position.y = SEAT_TOP + 0.01 * Math.sin(real * 8 + ph) * live;
          ch.head.rotation.x = 0.08;
        } else if (st === "waiting") {
          ch.armL.rotation.x = -1.0;
          ch.armR.rotation.x = -1.0;
          ch.head.rotation.z = 0.12 * Math.sin(real * 1.5 + ph) * live;
        } else if (st === "blocked") {
          ch.armL.rotation.set(-2.4, 0, 0.5);
          ch.armR.rotation.set(-2.4, 0, -0.5);
          ch.head.rotation.y = 0.18 * Math.sin(real * 7) * live;
        } else {
          rig.rotation.x = -0.26;
          ch.armL.rotation.set(-0.3, 0, 0.35);
          ch.armR.rotation.set(-0.3, 0, -0.35);
          ch.head.rotation.x = -0.12;
        }
        if (said && st !== "working") ch.armR.rotation.x = -1.3 + 0.2 * Math.sin(real * 6) * live;
      }
      if (ch.star) ch.star.rotation.y = real * 1.5 * live;
      const oy = orbHeight(ch) + (seated && st === "idle" ? -0.05 : 0);
      ch.orb.position.y = oy + 0.04 * Math.sin(real * 2.2 + ph) * live;
      ch.ring.rotation.z = real * 1.4 * live;
      const pulse = st === "waiting" ? 1 + 0.25 * Math.sin(real * 5) * live : st === "blocked" ? 1 + 0.15 * Math.sin(real * 9) * live : 1;
      ch.orb.scale.setScalar(pulse);
      setHover(ch, hoverBot === b.id);

      const p = this.project(new THREE.Vector3(pose.x, oy + 0.22, pose.z));
      lab.el.style.display = p.inside ? "" : "none";
      lab.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      lab.el.classList.toggle("hover", hoverBot === b.id);
      const tagText = st === "waiting" ? "!" : st === "blocked" ? "×" : st === "idle" ? "zz" : "";
      if (lab.tag.textContent !== tagText) lab.tag.textContent = tagText;
      lab.tag.className = `iso-tag ${st}`;
      lab.tag.style.display = tagText ? "" : "none";
      const text = said ?? (seated && st === "working" && b.line ? b.line : "");
      if (lab.bubble.textContent !== text) lab.bubble.textContent = text;
      lab.bubble.style.display = text ? "" : "none";
      lab.bubble.classList.toggle("desk", !said);
      lab.el.style.zIndex = hoverBot === b.id ? "4" : said ? "3" : "1";
    }

    if (hoverBot) {
      const b = byId.get(hoverBot);
      const ch = this.chars.get(hoverBot);
      if (b && ch) {
        const p = this.project(new THREE.Vector3(ch.root.position.x, 0, ch.root.position.z));
        this.hoverCard.style.display = "";
        this.hoverCard.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + 14).toFixed(1)}px, 0)`;
        const key = `${b.id}:${b.status}:${b.line ?? ""}`;
        if (this.hoverCard.dataset.key !== key) {
          const title = b.role ? `${esc(b.name)} · ${esc(b.role)}` : esc(b.name);
          this.hoverInner.innerHTML = `<div class="t">${title}</div><div class="s"><span class="dot" style="background:${STATUS_COLOR[b.status]}"></span>${esc(this.opts.words.status(b.status))}</div>${b.line ? `<div class="a">${esc(b.line)}</div>` : ""}<div class="h">${esc(this.opts.words.open)}</div>`;
          this.hoverCard.dataset.key = key;
        }
      }
    } else this.hoverCard.style.display = "none";

    for (const l of this.builder.labels) {
      const a = l.anchor();
      if (!a) continue;
      const p = this.project(a);
      l.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    }
    if (this.opts.onAnchor && level === layout.penthouse) {
      const p = this.project(new THREE.Vector3(BOARD.table.x, 0.85, BOARD.table.z));
      this.opts.onAnchor(p.x, p.y);
    }
  }

  dispose() {
    this.running = false;
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
