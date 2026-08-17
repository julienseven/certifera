"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const MINT = new THREE.Color("#73f59a");
const MINT_SOFT = new THREE.Color("#a8ffbe");
const MINT_DEEP = new THREE.Color("#1d9956");

const NEIGHBOURS = 2;
const RADIUS = 1.9;

const QUALITY = {
  full: { nodes: 420, pulses: 26 },
  low: { nodes: 190, pulses: 14 },
} as const;

export type Density = keyof typeof QUALITY;

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

/** Each node links to its k nearest neighbours; pairs are de-duplicated. */
function buildEdges(positions: Float32Array, count: number, k: number): Edge[] {
  const seen = new Set<number>();
  const edges: Edge[] = [];
  const candidates: { index: number; distance: number }[] = [];

  for (let i = 0; i < count; i += 1) {
    candidates.length = 0;
    const ax = positions[i * 3];
    const ay = positions[i * 3 + 1];
    const az = positions[i * 3 + 2];

    for (let j = 0; j < count; j += 1) {
      if (j === i) continue;
      const dx = ax - positions[j * 3];
      const dy = ay - positions[j * 3 + 1];
      const dz = az - positions[j * 3 + 2];
      candidates.push({ index: j, distance: dx * dx + dy * dy + dz * dz });
    }
    candidates.sort((left, right) => left.distance - right.distance);

    for (let n = 0; n < k; n += 1) {
      const j = candidates[n].index;
      const key = i < j ? i * count + j : j * count + i;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: i, b: j });
    }
  }
  return edges;
}

const nodeVertex = /* glsl */ `
  attribute float aScale;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uRadius;
  varying float vFade;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    // Depth is measured against the lattice centre, not the camera: view-space z is
    // always negative here, so fading on it directly would blank the whole field.
    float centreZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    float towardsCamera = viewPosition.z - centreZ;
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.15 + aPhase);
    // Nodes on the far side of the sphere recede instead of cluttering the field.
    vFade = twinkle * smoothstep(-uRadius * 1.15, uRadius * 0.45, towardsCamera);
    gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / max(0.001, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const nodeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, core * core * vFade * uOpacity);
  }
`;

function makeNodeMaterial(color: THREE.Color, size: number, opacity: number, pixelRatio: number) {
  return new THREE.ShaderMaterial({
    vertexShader: nodeVertex,
    fragmentShader: nodeFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: pixelRatio },
      uRadius: { value: RADIUS },
      uColor: { value: color },
      uOpacity: { value: opacity },
    },
  });
}

/**
 * The hero artwork: a lattice of relay nodes with verification pulses travelling
 * the edges. Rendered on a paused-by-default loop — it only runs while visible,
 * on a foreground tab, and never at all under prefers-reduced-motion (which gets
 * a single static frame instead).
 */
export default function HeroLattice({ density = "full" }: { density?: Density }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { nodes: NODE_COUNT, pulses: PULSE_COUNT } = QUALITY[density];

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
    camera.position.set(0, 0, 7.6);

    // The stage is nudged off-centre so the lattice sits clear of the headline.
    const stage = new THREE.Group();
    stage.position.set(0.6, 0.05, 0);
    scene.add(stage);

    const world = new THREE.Group();
    world.rotation.set(0.35, 0.6, 0.08);
    stage.add(world);

    // --- Nodes -------------------------------------------------------------
    const nodePositions = fibonacciSphere(NODE_COUNT, RADIUS);
    const scales = new Float32Array(NODE_COUNT);
    const phases = new Float32Array(NODE_COUNT);
    for (let i = 0; i < NODE_COUNT; i += 1) {
      scales[i] = 0.75 + Math.random() * 1.15;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
    nodeGeometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    nodeGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const nodeMaterial = makeNodeMaterial(MINT, 26, 0.9, pixelRatio);
    world.add(new THREE.Points(nodeGeometry, nodeMaterial));

    // --- Edges -------------------------------------------------------------
    const edges = buildEdges(nodePositions, NODE_COUNT, NEIGHBOURS);
    const edgePositions = new Float32Array(edges.length * 6);
    edges.forEach((edge, index) => {
      edgePositions.set(nodePositions.subarray(edge.a * 3, edge.a * 3 + 3), index * 6);
      edgePositions.set(nodePositions.subarray(edge.b * 3, edge.b * 3 + 3), index * 6 + 3);
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: MINT_DEEP, transparent: true, opacity: 0.34, depthWrite: false });
    world.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

    // --- Pulses: one travelling proof per edge, re-homed on arrival ---------
    const pulsePositions = new Float32Array(PULSE_COUNT * 3);
    const pulseScales = new Float32Array(PULSE_COUNT);
    const pulsePhases = new Float32Array(PULSE_COUNT);
    const pulseEdge = new Int32Array(PULSE_COUNT);
    const pulseT = new Float32Array(PULSE_COUNT);
    const pulseSpeed = new Float32Array(PULSE_COUNT);
    for (let i = 0; i < PULSE_COUNT; i += 1) {
      pulseEdge[i] = Math.floor(Math.random() * edges.length);
      pulseT[i] = Math.random();
      pulseSpeed[i] = 0.18 + Math.random() * 0.3;
      pulseScales[i] = 1.7 + Math.random() * 1.1;
      pulsePhases[i] = Math.random() * Math.PI * 2;
    }
    const pulseGeometry = new THREE.BufferGeometry();
    pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
    pulseGeometry.setAttribute("aScale", new THREE.BufferAttribute(pulseScales, 1));
    pulseGeometry.setAttribute("aPhase", new THREE.BufferAttribute(pulsePhases, 1));
    const pulseMaterial = makeNodeMaterial(MINT_SOFT, 30, 1, pixelRatio);
    world.add(new THREE.Points(pulseGeometry, pulseMaterial));

    // --- Orbit ring: the review window the whole lattice settles against ----
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS * 1.36, 0.005, 3, 220),
      new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.32 }),
    );
    ring.rotation.set(Math.PI / 2.35, 0.2, 0);
    stage.add(ring);

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

    // --- Interaction and loop ---------------------------------------------
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
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

      world.rotation.y += delta * 0.075;
      ring.rotation.z -= delta * 0.12;

      pointer.x += (pointer.targetX - pointer.x) * 0.05;
      pointer.y += (pointer.targetY - pointer.y) * 0.05;
      camera.position.x = pointer.x * 0.55;
      camera.position.y = -pointer.y * 0.4;
      camera.lookAt(0, 0, 0);

      for (let i = 0; i < PULSE_COUNT; i += 1) {
        pulseT[i] += delta * pulseSpeed[i];
        if (pulseT[i] >= 1) {
          pulseT[i] = 0;
          pulseEdge[i] = Math.floor(Math.random() * edges.length);
        }
      }
      writePulses();

      nodeMaterial.uniforms.uTime.value = elapsed;
      pulseMaterial.uniforms.uTime.value = elapsed * 2.4;
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
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderFrame();
    });
    resizeObserver.observe(host);

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!reduceMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

    renderFrame();
    host.dataset.ready = "true";

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
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
  }, [density]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="ease-out-expo h-full w-full opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-100"
    />
  );
}
