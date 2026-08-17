"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const MINT = new THREE.Color("#73f59a");
const MINT_SOFT = new THREE.Color("#a8ffbe");
const MINT_DEEP = new THREE.Color("#1d9956");

const RADIUS = 1.9;
const HOTSPOTS = 5;
const ARCS = 4;
const ARC_TRAIL = 16;
const RING_SPARKS = 3;

const QUALITY = {
  full: { nodes: 900, neighbours: 3, pulses: 64 },
  low: { nodes: 320, neighbours: 2, pulses: 24 },
} as const;

export type Density = keyof typeof QUALITY;
export type Variant = "hero" | "panel";

type Edge = { a: number; b: number };

/** Even point distribution on a sphere — no pole clustering, no duplicate vertices. */
function fibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * ring * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * ring * radius;
  }
  return positions;
}

/**
 * Links each node to its k nearest neighbours. Selection is a k-pass minimum scan
 * rather than a sort: at 900 nodes a full sort per node is the slowest thing on
 * the main thread during mount.
 */
function buildEdges(positions: Float32Array, count: number, k: number): Edge[] {
  const seen = new Set<number>();
  const edges: Edge[] = [];
  const best = new Int32Array(k);
  const bestDistance = new Float32Array(k);

  for (let i = 0; i < count; i += 1) {
    best.fill(-1);
    bestDistance.fill(Infinity);
    const ax = positions[i * 3];
    const ay = positions[i * 3 + 1];
    const az = positions[i * 3 + 2];

    for (let j = 0; j < count; j += 1) {
      if (j === i) continue;
      const dx = ax - positions[j * 3];
      const dy = ay - positions[j * 3 + 1];
      const dz = az - positions[j * 3 + 2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance >= bestDistance[k - 1]) continue;

      let slot = k - 1;
      while (slot > 0 && bestDistance[slot - 1] > distance) {
        bestDistance[slot] = bestDistance[slot - 1];
        best[slot] = best[slot - 1];
        slot -= 1;
      }
      bestDistance[slot] = distance;
      best[slot] = j;
    }

    for (let n = 0; n < k; n += 1) {
      const j = best[n];
      if (j < 0) continue;
      const key = i < j ? i * count + j : j * count + i;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: i, b: j });
    }
  }
  return edges;
}

/**
 * Shared by the node, pulse and edge shaders: how much a point on the lattice is
 * excited right now, from the pointer's focus, the roaming activity zones, and
 * any expanding click ripple. Zones breathe, so a busy region swells and settles
 * rather than holding one brightness.
 */
const excitement = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform vec3 uFocus;
  uniform float uFocusStrength;
  uniform vec4 uRipple;
  uniform vec3 uHotspots[${HOTSPOTS}];

  float excitementAt(vec3 p) {
    float boost = uFocusStrength * smoothstep(uRadius * 0.8, 0.0, distance(p, uFocus));

    for (int i = 0; i < ${HOTSPOTS}; i += 1) {
      float breath = 0.62 + 0.38 * sin(uTime * (0.9 + float(i) * 0.27) + float(i) * 1.7);
      float reach = uRadius * (0.42 + 0.26 * breath);
      float near = smoothstep(reach, 0.0, distance(p, uHotspots[i]));
      boost += 0.95 * near * (0.5 + 0.5 * sin(uTime * 3.4 + float(i) * 2.1));
    }

    // uRipple.w is the ripple's age, 0 to 1; negative means no ripple in flight.
    if (uRipple.w >= 0.0) {
      float front = uRipple.w * uRadius * 2.8;
      float band = smoothstep(0.34, 0.0, abs(distance(p, uRipple.xyz) - front));
      boost += band * (1.0 - uRipple.w) * 2.2;
    }

    return boost;
  }
`;

const nodeVertex = /* glsl */ `
  ${excitement}
  attribute float aScale;
  attribute float aPhase;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTwinkleRate;
  uniform float uFlare;
  varying float vFade;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    // Depth is measured against the lattice centre, not the camera: view-space z is
    // always negative here, so fading on it directly would blank the whole field.
    float centreZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    float towardsCamera = viewPosition.z - centreZ;

    float boost = excitementAt(position);
    // A sharp power curve turns a slow sine into an occasional, brief flare, so
    // individual nodes verify and settle without any per-frame CPU bookkeeping.
    boost += uFlare * pow(max(0.0, sin(uTime * 0.55 + aPhase * 4.0)), 48.0) * 2.4;

    float twinkle = 0.6 + 0.4 * sin(uTime * uTwinkleRate + aPhase);
    // Nodes on the far side of the sphere recede instead of cluttering the field.
    vFade = twinkle * smoothstep(-uRadius * 1.15, uRadius * 0.45, towardsCamera) * (1.0 + boost * 1.6);

    gl_PointSize = uSize * aScale * uPixelRatio * (1.0 + boost * 1.25) * (1.0 / max(0.001, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const nodeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHotColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    // Excited nodes are pushed toward the lighter mint, not just made brighter.
    vec3 tint = mix(uColor, uHotColor, clamp(vFade - 1.0, 0.0, 1.0));
    gl_FragColor = vec4(tint, core * core * clamp(vFade, 0.0, 2.0) * uOpacity);
  }
`;

const edgeVertex = /* glsl */ `
  ${excitement}
  varying float vFade;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float centreZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    float towardsCamera = viewPosition.z - centreZ;

    float boost = excitementAt(position);
    vFade = smoothstep(-uRadius * 1.2, uRadius * 0.5, towardsCamera) * (0.55 + boost * 2.4);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const edgeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHotColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    vec3 tint = mix(uColor, uHotColor, clamp(vFade - 0.8, 0.0, 1.0));
    gl_FragColor = vec4(tint, clamp(vFade, 0.0, 1.6) * uOpacity);
  }
`;

/** Sparks live in their own transform (the ring's), so they skip the excitement field. */
const sparkVertex = /* glsl */ `
  attribute float aScale;
  uniform float uSize;
  uniform float uPixelRatio;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / max(0.001, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const sparkFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, core * core * uOpacity);
  }
`;

/**
 * A lattice of relay nodes with verification traffic running over it: pulses along
 * the edges, long-haul dispatch arcs between distant nodes, flaring individual
 * nodes, roaming activity zones, and sparks orbiting the settlement ring. It
 * answers the pointer and ripples outward on a click.
 *
 * The render loop is paused by default — it runs only while the canvas is visible,
 * on a foreground tab, and never at all under prefers-reduced-motion, which gets a
 * single static frame instead.
 */
export default function LatticeScene({ density = "full", variant = "hero" }: { density?: Density; variant?: Variant }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { nodes: NODE_COUNT, neighbours: NEIGHBOURS, pulses: PULSE_COUNT } = QUALITY[density];
    // Behind a sign-in card the lattice has to stay furniture: slower, dimmer, centred.
    const panel = variant === "panel";

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return; // No WebGL: the CSS gradient behind this layer stands on its own.
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 100);

    const stage = new THREE.Group();
    scene.add(stage);

    /**
     * Frames the lattice against whichever field of view is tighter. A phone gives
     * this canvas a tall, narrow box, where a fixed camera distance would push the
     * sphere straight out through the left and right edges.
     */
    const fitCamera = () => {
      const halfVertical = THREE.MathUtils.degToRad(camera.fov) / 2;
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
      const extent = RADIUS * (panel ? 1.72 : 1.5); // The orbit ring, not just the node sphere.
      camera.position.z = Math.max(extent / Math.tan(halfVertical), extent / Math.tan(halfHorizontal));
      // Only a landscape hero has room to nudge the lattice clear of the headline.
      stage.position.set(!panel && camera.aspect > 1 ? 0.6 : 0, 0.05, 0);
      camera.updateProjectionMatrix();
    };
    fitCamera();

    const world = new THREE.Group();
    world.rotation.set(0.35, 0.6, 0.08);
    stage.add(world);

    // --- Shared excitement uniforms ---------------------------------------
    // One object per uniform, reused across all the lattice materials, so a single
    // per-frame write updates the nodes, the pulses and the edges together.
    const shared = {
      uTime: { value: 0 },
      uRadius: { value: RADIUS },
      uFocus: { value: new THREE.Vector3(0, 0, RADIUS) },
      uFocusStrength: { value: 0 },
      uRipple: { value: new THREE.Vector4(0, 0, 0, -1) },
      uHotspots: { value: Array.from({ length: HOTSPOTS }, () => new THREE.Vector3()) },
    };

    const makePointMaterial = (color: THREE.Color, size: number, opacity: number, twinkleRate: number, flare = 0) =>
      new THREE.ShaderMaterial({
        vertexShader: nodeVertex,
        fragmentShader: nodeFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          ...shared,
          uSize: { value: size },
          uPixelRatio: { value: pixelRatio },
          uTwinkleRate: { value: twinkleRate },
          uFlare: { value: flare },
          uColor: { value: color },
          uHotColor: { value: MINT_SOFT },
          uOpacity: { value: opacity },
        },
      });

    // --- Nodes -------------------------------------------------------------
    const nodePositions = fibonacciSphere(NODE_COUNT, RADIUS);
    const scales = new Float32Array(NODE_COUNT);
    const phases = new Float32Array(NODE_COUNT);
    for (let i = 0; i < NODE_COUNT; i += 1) {
      scales[i] = 0.7 + Math.random() * 1.05;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    nodeGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const nodeMaterial = makePointMaterial(MINT, 24, panel ? 0.75 : 0.9, 1.15, 1);
    world.add(new THREE.Points(nodeGeometry, nodeMaterial));

    // --- Edges -------------------------------------------------------------
    const edges = buildEdges(nodePositions, NODE_COUNT, NEIGHBOURS);
    const edgePositions = new Float32Array(edges.length * 6);
    const edgeMidpoints = new Float32Array(edges.length * 3);
    edges.forEach((edge, index) => {
      edgePositions.set(nodePositions.subarray(edge.a * 3, edge.a * 3 + 3), index * 6);
      edgePositions.set(nodePositions.subarray(edge.b * 3, edge.b * 3 + 3), index * 6 + 3);
      for (let axis = 0; axis < 3; axis += 1) {
        edgeMidpoints[index * 3 + axis] = (nodePositions[edge.a * 3 + axis] + nodePositions[edge.b * 3 + axis]) * 0.5;
      }
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    const edgeMaterial = new THREE.ShaderMaterial({
      vertexShader: edgeVertex,
      fragmentShader: edgeFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...shared,
        uColor: { value: MINT_DEEP },
        uHotColor: { value: MINT },
        uOpacity: { value: panel ? 0.3 : 0.42 },
      },
    });
    world.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

    // --- Pulses: one travelling proof per edge, re-homed on arrival ---------
    const pulsePositions = new Float32Array(PULSE_COUNT * 3);
    const pulseScales = new Float32Array(PULSE_COUNT);
    const pulsePhases = new Float32Array(PULSE_COUNT);
    const pulseEdge = new Int32Array(PULSE_COUNT);
    const pulseT = new Float32Array(PULSE_COUNT);
    const pulseSpeed = new Float32Array(PULSE_COUNT);

    /**
     * Most pulses re-home near an activity zone, which is what makes those regions
     * read as busy rather than merely bright.
     */
    const pickEdge = () => {
      if (Math.random() > 0.65) return Math.floor(Math.random() * edges.length);
      const hotspot = shared.uHotspots.value[Math.floor(Math.random() * HOTSPOTS)];
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = Math.floor(Math.random() * edges.length);
        const dx = edgeMidpoints[candidate * 3] - hotspot.x;
        const dy = edgeMidpoints[candidate * 3 + 1] - hotspot.y;
        const dz = edgeMidpoints[candidate * 3 + 2] - hotspot.z;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = candidate;
        }
      }
      return bestIndex;
    };

    for (let i = 0; i < PULSE_COUNT; i += 1) {
      pulseEdge[i] = Math.floor(Math.random() * edges.length);
      pulseT[i] = Math.random();
      pulseSpeed[i] = (panel ? 0.16 : 0.22) + Math.random() * 0.4;
      pulseScales[i] = 1.6 + Math.random() * 1.1;
      pulsePhases[i] = Math.random() * Math.PI * 2;
    }
    const pulseGeometry = new THREE.BufferGeometry();
    pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
    pulseGeometry.setAttribute("aScale", new THREE.BufferAttribute(pulseScales, 1));
    pulseGeometry.setAttribute("aPhase", new THREE.BufferAttribute(pulsePhases, 1));
    const pulseMaterial = makePointMaterial(MINT_SOFT, 28, 1, 2.8);
    world.add(new THREE.Points(pulseGeometry, pulseMaterial));

    // --- Dispatch arcs: long-haul traffic between distant nodes -------------
    // Each arc is a comet: a head slerping along a great circle with a fading trail.
    const arcPositions = new Float32Array(ARCS * ARC_TRAIL * 3);
    const arcScales = new Float32Array(ARCS * ARC_TRAIL);
    const arcPhases = new Float32Array(ARCS * ARC_TRAIL);
    for (let a = 0; a < ARCS; a += 1) {
      for (let t = 0; t < ARC_TRAIL; t += 1) {
        // Index 0 is the head; the tail thins out behind it.
        arcScales[a * ARC_TRAIL + t] = 2.6 * (1 - t / ARC_TRAIL) ** 1.6;
        arcPhases[a * ARC_TRAIL + t] = Math.random() * Math.PI * 2;
      }
    }
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute("position", new THREE.BufferAttribute(arcPositions, 3));
    arcGeometry.setAttribute("aScale", new THREE.BufferAttribute(arcScales, 1));
    arcGeometry.setAttribute("aPhase", new THREE.BufferAttribute(arcPhases, 1));
    const arcMaterial = makePointMaterial(MINT_SOFT, 30, 1, 3.2);
    world.add(new THREE.Points(arcGeometry, arcMaterial));

    const arcs = Array.from({ length: ARCS }, () => ({
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      omega: 1,
      t: Math.random(),
      speed: 0.22 + Math.random() * 0.2,
    }));

    const scratch = new THREE.Vector3();
    const scratchB = new THREE.Vector3();

    /** Endpoints are drawn far apart, so an arc reads as a hop across the network. */
    const respawnArc = (arc: (typeof arcs)[number]) => {
      const first = Math.floor(Math.random() * NODE_COUNT);
      arc.from.fromArray(nodePositions, first * 3).normalize();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const second = Math.floor(Math.random() * NODE_COUNT);
        scratch.fromArray(nodePositions, second * 3).normalize();
        if (arc.from.dot(scratch) < 0.15) break;
      }
      arc.to.copy(scratch);
      arc.omega = Math.acos(THREE.MathUtils.clamp(arc.from.dot(arc.to), -1, 1));
      arc.t = 0;
      arc.speed = 0.22 + Math.random() * 0.2;
    };
    arcs.forEach(respawnArc);

    const writeArcs = () => {
      for (let a = 0; a < ARCS; a += 1) {
        const arc = arcs[a];
        const sinOmega = Math.sin(arc.omega) || 1;
        for (let t = 0; t < ARC_TRAIL; t += 1) {
          const along = THREE.MathUtils.clamp(arc.t - t * 0.018, 0, 1);
          scratch.copy(arc.from).multiplyScalar(Math.sin((1 - along) * arc.omega) / sinOmega);
          scratchB.copy(arc.to).multiplyScalar(Math.sin(along * arc.omega) / sinOmega);
          // Lifted just off the surface so arcs read above the lattice, not through it.
          scratch.add(scratchB).multiplyScalar(RADIUS * 1.07);
          scratch.toArray(arcPositions, (a * ARC_TRAIL + t) * 3);
        }
      }
      arcGeometry.attributes.position.needsUpdate = true;
    };
    writeArcs();

    // --- Orbit ring: the review window the whole lattice settles against ----
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS * 1.36, 0.005, 3, 220),
      new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: panel ? 0.22 : 0.32 }),
    );
    ring.rotation.set(Math.PI / 2.35, 0.2, 0);
    stage.add(ring);

    // Sparks ride the ring itself, so the settlement orbit is never a static circle.
    const sparkPositions = new Float32Array(RING_SPARKS * 3);
    const sparkScales = new Float32Array(RING_SPARKS).fill(2.2);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.setAttribute("aScale", new THREE.BufferAttribute(sparkScales, 1));
    const sparkMaterial = new THREE.ShaderMaterial({
      vertexShader: sparkVertex,
      fragmentShader: sparkFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: 30 },
        uPixelRatio: { value: pixelRatio },
        uColor: { value: MINT_SOFT },
        uOpacity: { value: panel ? 0.7 : 1 },
      },
    });
    ring.add(new THREE.Points(sparkGeometry, sparkMaterial));
    const sparkAngles = Array.from({ length: RING_SPARKS }, (_, i) => (i / RING_SPARKS) * Math.PI * 2);
    const sparkSpeeds = Array.from({ length: RING_SPARKS }, () => 0.5 + Math.random() * 0.55);

    const writePulses = () => {
      for (let i = 0; i < PULSE_COUNT; i += 1) {
        const edge = edges[pulseEdge[i]];
        const t = pulseT[i];
        for (let axis = 0; axis < 3; axis += 1) {
          const from = nodePositions[edge.a * 3 + axis];
          const to = nodePositions[edge.b * 3 + axis];
          pulsePositions[i * 3 + axis] = from + (to - from) * t;
        }
      }
      pulseGeometry.attributes.position.needsUpdate = true;
    };
    writePulses();

    // --- Activity zones: hotspots drifting along their own great circles ----
    const zones = Array.from({ length: HOTSPOTS }, (_, i) => ({
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      seed: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(RADIUS),
      speed: 0.14 + i * 0.07 + Math.random() * 0.1,
      angle: Math.random() * Math.PI * 2,
    }));

    // --- Pointer interaction ----------------------------------------------
    // The canvas stays pointer-events:none so the page's own controls keep working;
    // the pointer is tracked on the window and ray-projected onto the lattice instead.
    const raycaster = new THREE.Raycaster();
    const pickTarget = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 24, 16), new THREE.MeshBasicMaterial());
    pickTarget.visible = false;
    stage.add(pickTarget);

    const ndc = new THREE.Vector2();
    const focusTarget = new THREE.Vector3(0, 0, RADIUS);
    const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let focusStrengthTarget = 0;
    let spin = 0;
    let rippleAge = -1;
    let lastPointer = { x: 0, y: 0, time: 0 };

    const projectPointer = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(pickTarget, false)[0];
      if (!hit) return null;
      return world.worldToLocal(hit.point.clone());
    };

    const onPointerMove = (event: PointerEvent) => {
      parallax.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      parallax.targetY = (event.clientY / window.innerHeight - 0.5) * 2;

      const now = performance.now();
      const elapsed = Math.max(1, now - lastPointer.time);
      const velocity = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) / elapsed;
      lastPointer = { x: event.clientX, y: event.clientY, time: now };
      // A fast sweep across the page spins the lattice; it bleeds off by friction.
      spin = Math.min(spin + velocity * (panel ? 0.003 : 0.006), panel ? 0.8 : 1.6);

      const local = projectPointer(event.clientX, event.clientY);
      if (local) {
        focusTarget.copy(local);
        focusStrengthTarget = 1;
      } else {
        focusStrengthTarget = 0;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const local = projectPointer(event.clientX, event.clientY);
      if (!local) return;
      shared.uRipple.value.set(local.x, local.y, local.z, 0);
      rippleAge = 0;
    };

    const onPointerLeave = () => {
      focusStrengthTarget = 0;
    };

    const clock = new THREE.Clock();
    let frame = 0;
    let visible = true;

    const renderFrame = () => {
      renderer.render(scene, camera);
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      spin *= 1 - Math.min(1, delta * 1.6);
      world.rotation.y += delta * ((panel ? 0.045 : 0.075) + spin);
      ring.rotation.z -= delta * (0.12 + spin * 0.4);

      parallax.x += (parallax.targetX - parallax.x) * 0.05;
      parallax.y += (parallax.targetY - parallax.y) * 0.05;
      camera.position.x = parallax.x * (panel ? 0.3 : 0.55);
      camera.position.y = -parallax.y * (panel ? 0.22 : 0.4);
      camera.lookAt(0, 0, 0);

      // Hotspots orbit their own axis, so the busy regions keep moving.
      zones.forEach((zone, index) => {
        zone.angle += delta * zone.speed;
        shared.uHotspots.value[index].copy(zone.seed).applyAxisAngle(zone.axis, zone.angle);
      });

      shared.uFocus.value.lerp(focusTarget, Math.min(1, delta * 6));
      shared.uFocusStrength.value += (focusStrengthTarget - shared.uFocusStrength.value) * Math.min(1, delta * 4);

      if (rippleAge >= 0) {
        rippleAge += delta * 0.7;
        shared.uRipple.value.w = rippleAge <= 1 ? rippleAge : -1;
        if (rippleAge > 1) rippleAge = -1;
      }

      for (let i = 0; i < PULSE_COUNT; i += 1) {
        pulseT[i] += delta * pulseSpeed[i];
        if (pulseT[i] >= 1) {
          pulseT[i] = 0;
          pulseEdge[i] = pickEdge();
        }
      }
      writePulses();

      for (const arc of arcs) {
        arc.t += delta * arc.speed;
        // The tail needs time to clear the destination before the arc is recycled.
        if (arc.t > 1.35) respawnArc(arc);
      }
      writeArcs();

      for (let i = 0; i < RING_SPARKS; i += 1) {
        sparkAngles[i] += delta * sparkSpeeds[i];
        sparkPositions[i * 3] = Math.cos(sparkAngles[i]) * RADIUS * 1.36;
        sparkPositions[i * 3 + 1] = Math.sin(sparkAngles[i]) * RADIUS * 1.36;
      }
      sparkGeometry.attributes.position.needsUpdate = true;

      shared.uTime.value = elapsed;
      renderFrame();
    };

    const start = () => {
      if (reduceMotion || frame) return;
      clock.getDelta(); // Drop the time accumulated while paused.
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onVisibilityChange = () => (document.hidden || !visible ? stop() : start());
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        onVisibilityChange();
      },
      { threshold: 0 },
    );
    observer.observe(host);

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      fitCamera();
      renderer.setSize(width, height, false);
      renderFrame();
    });
    resizeObserver.observe(host);

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
    }

    // Zones need one placement before the first frame or every pulse homes to origin.
    zones.forEach((zone, index) => shared.uHotspots.value[index].copy(zone.seed));
    renderFrame();
    host.dataset.ready = "true";

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      scene.traverse((object) => {
        if (object instanceof THREE.Points || object instanceof THREE.LineSegments || object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [density, variant]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="ease-out-expo h-full w-full opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-100"
    />
  );
}
