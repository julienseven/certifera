"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { handoff } from "@/content/landing";

const MINT = new THREE.Color("#73f59a");
const MINT_SOFT = new THREE.Color("#a8ffbe");

/**
 * These four have to agree with `--loop` and the `packet-travel` keyframes in
 * globals.css, because the scene and the CSS labels are two renderings of one
 * timeline: the packet is a WebGL comet, the pill riding it is DOM text.
 */
const LOOP = 16;
const TRAVEL = LOOP * 0.12;
const FADE_IN = 1 / 3;
const FADE_OUT = 0.708;

const TRAIL = 30;
const TRAIL_GAP = 0.018;
/** Trail points plus one wide, dim head glow that spills past the DOM pill. */
const PER_PACKET = TRAIL + 1;

type Anchored = { ax: number; ay: number; bx: number; by: number; length: number; vertical: boolean };
type Packet = { at: number; rail: string; forward: boolean; tone: number };

const RAILS = ["outbound", "inbound"] as const;

/** One flat timeline out of the content module, so copy and motion cannot drift. */
const PACKETS: Packet[] = [
  ...handoff.lanes.flatMap((lane, index) =>
    lane.packets.map((packet) => ({
      at: packet.at,
      rail: RAILS[index] as string,
      forward: packet.dir === "right",
      tone: packet.kind === "money" ? 1 : 0,
    })),
  ),
  { at: handoff.fee.at, rail: "fee", forward: true, tone: 1 },
];

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** The opacity ramp of `packet-travel`, as a function of progress along the rail. */
const packetFade = (u: number) => clamp01(u / FADE_IN) * (1 - clamp01((u - FADE_OUT) / (1 - FADE_OUT)));

/** `node-live`, in seconds since the beat: a rise, a hold, and a slower release. */
const nodeFade = (age: number) => {
  if (age < 0 || age > 2.88) return 0;
  if (age < 0.48) return age / 0.48;
  if (age < 2.08) return 1;
  return 1 - (age - 2.08) / 0.8;
};

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    float glow = pow(max(0.0, 1.0 - d), 2.6);
    gl_FragColor = vec4(uColor, glow * uStrength);
  }
`;

const burstFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    float ring = smoothstep(0.09, 0.0, abs(d - uRadius));
    gl_FragColor = vec4(uColor, ring * uStrength * smoothstep(1.0, 0.2, d));
  }
`;

const pointVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute float aTone;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vTone;
  void main() {
    vAlpha = aAlpha;
    vTone = aTone;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const pointFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHotColor;
  varying float vAlpha;
  varying float vTone;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(mix(uColor, uHotColor, vTone), core * core * vAlpha);
  }
`;

/**
 * The handoff diagram's motion layer, in WebGL.
 *
 * The camera is orthographic and one world unit is one CSS pixel, so the scene can
 * anchor itself to the diagram's own DOM: it measures the rail and card elements and
 * draws over exactly those boxes at any width. The clock is `document.timeline`, the
 * same origin CSS animations run on, so a comet and the labelled pill riding it stay
 * in phase without either driving the other.
 *
 * It sits behind the cards, which are opaque, so a packet slipping under one reads as
 * entering it. The CSS diagram underneath stays authoritative: this layer only takes
 * over the rails once it is running, and never renders at all under reduced motion,
 * below `lg`, or without a WebGL context.
 */
export default function HandoffScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const root = host?.closest<HTMLElement>(".handoff");
    if (!host || !root) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return; // No context: the CSS rails below are already the whole diagram.
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Pixel space: x runs right, y runs down as negative, so DOM coordinates map in
    // with a single sign flip and nothing has to be scaled.
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);

    // Rails are not drawn here. The CSS hairlines are already pixel-exact, so this
    // layer only measures them and runs traffic along them.
    const rails = new Map<string, Anchored>();

    // --- Node halos ----------------------------------------------------------
    const haloMaterial = () =>
      new THREE.ShaderMaterial({
        vertexShader: quadVertex,
        fragmentShader: haloFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: MINT }, uStrength: { value: 0 } },
      });
    const halos = new Map<string, { mesh: THREE.Mesh; at: number }>();

    // --- Settlement burst ----------------------------------------------------
    const burstMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: burstFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: MINT_SOFT }, uStrength: { value: 0 }, uRadius: { value: 0 } },
    });
    const burst = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), burstMaterial);
    burst.visible = false;
    scene.add(burst);

    // --- Packets: a comet per step, all in one buffer -------------------------
    const total = PACKETS.length * PER_PACKET;
    const positions = new Float32Array(total * 3);
    const alphas = new Float32Array(total);
    const sizes = new Float32Array(total);
    const tones = new Float32Array(total);

    PACKETS.forEach((packet, index) => {
      for (let t = 0; t < PER_PACKET; t += 1) {
        const slot = index * PER_PACKET + t;
        tones[slot] = packet.tone;
        // The last slot of each packet is the wide, dim glow around the head.
        sizes[slot] = t === TRAIL ? 96 : 18 * (1 - t / TRAIL) ** 1.5 + 2;
      }
    });

    const packetGeometry = new THREE.BufferGeometry();
    packetGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    packetGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    packetGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    packetGeometry.setAttribute("aTone", new THREE.BufferAttribute(tones, 1));
    const packetMaterial = new THREE.ShaderMaterial({
      vertexShader: pointVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: pixelRatio }, uColor: { value: MINT }, uHotColor: { value: MINT_SOFT } },
    });
    scene.add(new THREE.Points(packetGeometry, packetMaterial));

    // --- Measurement: the DOM decides where everything is ---------------------
    let width = 0;
    let height = 0;

    const readBox = (element: HTMLElement, hostRect: DOMRect): Anchored => {
      const rect = element.getBoundingClientRect();
      const vertical = rect.height > rect.width;
      const left = rect.left - hostRect.left;
      const top = rect.top - hostRect.top;
      return vertical
        ? { ax: left + rect.width / 2, ay: top, bx: left + rect.width / 2, by: top + rect.height, length: rect.height, vertical }
        : { ax: left, ay: top + rect.height / 2, bx: left + rect.width, by: top + rect.height / 2, length: rect.width, vertical };
    };

    const measure = () => {
      const hostRect = host.getBoundingClientRect();
      width = Math.round(hostRect.width);
      height = Math.round(hostRect.height);
      if (!width || !height) return false;

      camera.right = width;
      camera.bottom = -height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);

      root.querySelectorAll<HTMLElement>("[data-flow-rail]").forEach((element) => {
        rails.set(element.dataset.flowRail as string, readBox(element, hostRect));
      });

      root.querySelectorAll<HTMLElement>("[data-flow-node]").forEach((element) => {
        const key = element.dataset.flowNode as string;
        const rect = element.getBoundingClientRect();
        const at = Number(element.dataset.flowAt ?? 0);
        let halo = halos.get(key);
        if (!halo) {
          halo = { mesh: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMaterial()), at };
          scene.add(halo.mesh);
          halos.set(key, halo);
        }
        halo.at = at;
        halo.mesh.scale.set(rect.width + 260, rect.height + 260, 1);
        halo.mesh.position.set(
          rect.left - hostRect.left + rect.width / 2,
          -(rect.top - hostRect.top + rect.height / 2),
          0,
        );
        if (key === "ledger") {
          const span = Math.max(rect.width, rect.height) * 2.6;
          burst.scale.set(span, span, 1);
          burst.position.copy(halo.mesh.position);
        }
      });

      readOrigin();
      return rails.size > 0;
    };

    /**
     * A CSS animation is timed from the moment its element was first styled, not from
     * the document timeline's origin, and on this page that is a third of a second of
     * hydration later. Assuming zero put every comet ahead of the pill it carries, so
     * the phase is taken from the running animation itself.
     */
    let origin = 0;
    function readOrigin() {
      const runner = root!.querySelector<HTMLElement>(".packet-runner");
      const animation = runner?.getAnimations?.()[0];
      origin = Number(animation?.startTime ?? 0) / 1000;
    }

    if (!measure()) {
      renderer.dispose();
      renderer.domElement.remove();
      return;
    }

    // --- Frame ---------------------------------------------------------------
    const scratch = new THREE.Vector2();

    const writePackets = (now: number) => {
      PACKETS.forEach((packet, index) => {
        const rail = rails.get(packet.rail);
        const base = index * PER_PACKET;
        const phase = (now - packet.at + LOOP) % LOOP;
        const running = rail && phase <= TRAVEL;
        const head = running ? phase / TRAVEL : 0;

        for (let t = 0; t < PER_PACKET; t += 1) {
          const slot = base + t;
          if (!running) {
            alphas[slot] = 0;
            continue;
          }
          const along = clamp01(head - (t === TRAIL ? 0 : t) * TRAIL_GAP);
          const u = packet.forward ? along : 1 - along;
          scratch.set(rail.ax + (rail.bx - rail.ax) * u, rail.ay + (rail.by - rail.ay) * u);
          positions[slot * 3] = scratch.x;
          positions[slot * 3 + 1] = -scratch.y;
          const decay = t === TRAIL ? 0.3 : (1 - t / TRAIL) ** 1.5;
          alphas[slot] = packetFade(head) * decay;
        }
      });
      packetGeometry.attributes.position.needsUpdate = true;
      packetGeometry.attributes.aAlpha.needsUpdate = true;
    };

    const settleAt = halos.get("supply")?.at ?? handoff.fee.at;

    const draw = () => {
      // Both layers read the document timeline, offset by when the CSS animation
      // actually started; that is what keeps a comet under the pill that names it.
      const clock = Number(document.timeline.currentTime ?? performance.now()) / 1000;
      const now = (((clock - origin) % LOOP) + LOOP) % LOOP;

      writePackets(now);

      halos.forEach(({ mesh, at }) => {
        const material = mesh.material as THREE.ShaderMaterial;
        material.uniforms.uStrength.value = nodeFade((now - at + LOOP) % LOOP) * 0.5;
      });

      const settleAge = (now - settleAt + LOOP) % LOOP;
      burst.visible = settleAge < 1.4;
      if (burst.visible) {
        const p = settleAge / 1.4;
        burstMaterial.uniforms.uRadius.value = 1 - (1 - p) ** 2;
        burstMaterial.uniforms.uStrength.value = (1 - p) ** 1.5 * 0.75;
      }

      renderer.render(scene, camera);
    };

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      draw();
    };

    let onScreen = true;
    const start = () => {
      if (frame || document.hidden || !onScreen) return;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(host);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    // Layout moves for reasons this scene cannot see — a font swap, the reveal
    // landing, a resize — so anchors are re-read rather than cached once.
    const resizeObserver = new ResizeObserver(() => {
      if (measure()) draw();
    });
    resizeObserver.observe(host);
    resizeObserver.observe(root);

    draw();
    root.dataset.webgl = "on";
    host.dataset.ready = "true";
    start();

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      delete root.dataset.webgl;
      scene.traverse((object) => {
        if (object instanceof THREE.Points || object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="ease-out-expo absolute inset-0 z-0 opacity-0 transition-opacity duration-700 data-[ready=true]:opacity-100"
    />
  );
}
