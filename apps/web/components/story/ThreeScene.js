'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Grid, Preload, Sparkles } from '@react-three/drei';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * The 3D half of the scroll story.
 *
 * This module is imported lazily (React.lazy) from ScrollStorySection, so the
 * three/fiber/drei/gsap bundle is only fetched when a capable browser actually
 * reaches the section. Everything here runs client-side only.
 *
 * Design notes:
 *  - All geometry and materials are created once at module scope and shared by
 *    every mesh. No per-render allocation, no assets to download.
 *  - The environment is fully procedural: an extruded "V" monogram (the
 *    company mark), orbit rings, an approach cluster, a gate corridor, a
 *    gallery wall and a beacon — one composition per chapter along a path the
 *    camera travels.
 *  - Depth comes from fog and the drei infinite grid, both tinted to the
 *    brand navy. A couple of cheap fake contact shadows stand in for shadow
 *    maps, which keeps the render light enough for ordinary laptops.
 *  - The camera is driven by a single GSAP timeline with seven keyframes,
 *    scrubbed by ScrollTrigger over the story section. GSAP only mutates a
 *    plain object; useFrame copies that object into the camera each frame.
 *    React never re-renders during scrolling.
 */

const BG = '#010f1d';
const BLUE = '#025298';
const BLUE_SOFT = '#3f7fc2';
const GOLD = '#f9a71b';

/* -------------------------------------------------------------------------- */
/* Shared resources (created once)                                            */
/* -------------------------------------------------------------------------- */

const materials = {
  monolith: new THREE.MeshStandardMaterial({
    color: BLUE,
    metalness: 0.45,
    roughness: 0.3,
    emissive: '#023a6d',
    emissiveIntensity: 0.6,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: GOLD,
    metalness: 0.55,
    roughness: 0.35,
    emissive: GOLD,
    emissiveIntensity: 0.35,
  }),
  steel: new THREE.MeshStandardMaterial({ color: '#9fb4c8', metalness: 0.75, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: '#0a1a2e', metalness: 0.2, roughness: 0.85 }),
  ground: new THREE.MeshStandardMaterial({ color: '#04101f', metalness: 0.1, roughness: 1 }),
  shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 }),
  glow: new THREE.MeshBasicMaterial({ color: GOLD }),
  glowBlue: new THREE.MeshBasicMaterial({ color: BLUE_SOFT }),
};

const geometries = (() => {
  // "V" monogram: the company initial, extruded. The one object in the scene
  // that exists because of the brand rather than the scene.
  const shape = new THREE.Shape();
  shape.moveTo(-2.2, 2.6);
  shape.lineTo(0, -2.6);
  shape.lineTo(2.2, 2.6);
  shape.lineTo(1.25, 2.6);
  shape.lineTo(0, -0.7);
  shape.lineTo(-1.25, 2.6);
  shape.closePath();
  const monolith = new THREE.ExtrudeGeometry(shape, {
    depth: 1.1,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  monolith.center();

  return {
    monolith,
    ring: new THREE.TorusGeometry(3.6, 0.045, 10, 128),
    ringInner: new THREE.TorusGeometry(2.7, 0.035, 10, 128),
    slab: new THREE.BoxGeometry(3.1, 4.3, 0.12),
    gate: new THREE.BoxGeometry(0.5, 5.4, 0.5),
    cap: new THREE.BoxGeometry(0.6, 0.14, 0.6),
    frame: new THREE.BoxGeometry(3.6, 2.35, 0.09),
    frameInner: new THREE.PlaneGeometry(3.25, 2.0),
    shadow: new THREE.CircleGeometry(2.4, 32),
    pillar: new THREE.CylinderGeometry(0.1, 0.18, 9, 12),
    baseRing: new THREE.TorusGeometry(2.2, 0.05, 10, 96),
    ground: new THREE.PlaneGeometry(400, 400),
  };
})();

// Gallery wall inner panels — one emissive tint per frame.
const frameMaterials = ['#025298', '#f9a71b', '#3f7fc2', '#7fabe6'].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color: '#0a1a2e',
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.6,
    }),
);

/* -------------------------------------------------------------------------- */
/* Camera keyframes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Seven keyframes over the whole story. `p` is the camera position, `t` the
 * look-at target. Chapter boundaries sit at 0 / .25 / .5 / .75 / 1, so each
 * chapter opens on a deliberate, framed composition, and the moves between
 * them are continuous. The .68 keyframe is the middle of the gate-corridor
 * fly-through, the .88 one starts the final approach to the beacon.
 */
const KEYFRAMES = [
  { at: 0.0, p: [0, 3.4, 14], t: [0, 2.3, 0] },
  { at: 0.25, p: [6.5, 2.6, -2], t: [-11, 2.6, -12] },
  { at: 0.5, p: [0.6, 2.6, -17], t: [0, 2.2, -42] },
  { at: 0.68, p: [-0.6, 2.3, -30], t: [0.6, 2.0, -50] },
  { at: 0.75, p: [2.6, 2.3, -49], t: [-4, 2.2, -61] },
  { at: 0.88, p: [1.5, 2.8, -58], t: [0, 2.4, -76] },
  { at: 1.0, p: [-0.4, 3.0, -64], t: [0, 2.4, -79] },
];

/* -------------------------------------------------------------------------- */
/* Camera rig                                                                 */
/* -------------------------------------------------------------------------- */

function CameraRig({ sectionRef }) {
  const camera = useThree((state) => state.camera);
  const lookTarget = useMemo(() => new THREE.Vector3(...KEYFRAMES[0].t), []);

  // The GSAP timeline writes here; useFrame reads from here. A plain object,
  // so the animation loop never touches React state.
  const cam = useMemo(() => ({ px: 0, py: 3.4, pz: 14, tx: 0, ty: 2.3, tz: 0 }), []);

  useEffect(() => {
    const section = sectionRef?.current;
    if (!section) return undefined;

    gsap.registerPlugin(ScrollTrigger);

    // One timeline, scrubbed by real page scroll. No wheel listeners, no
    // scrollTo, no pinning of the page itself — the sticky CSS layer does that.
    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.7,
          invalidateOnRefresh: true,
        },
      });

      for (let i = 1; i < KEYFRAMES.length; i += 1) {
        const previous = KEYFRAMES[i - 1];
        const key = KEYFRAMES[i];
        timeline.to(
          cam,
          {
            px: key.p[0],
            py: key.p[1],
            pz: key.p[2],
            tx: key.t[0],
            ty: key.t[1],
            tz: key.t[2],
            duration: key.at - previous.at,
          },
          previous.at,
        );
      }
    }, section);

    // Verification handle: lets tests assert that scrolling really moves the
    // camera. Harmless in production (one function on window).
    window.__vlStoryCamera = () => ({
      position: camera.position.toArray(),
      target: lookTarget.toArray(),
    });

    return () => {
      // Kills the timeline and every ScrollTrigger created inside the context.
      context.revert();
      delete window.__vlStoryCamera;
    };
  }, [camera, lookTarget, sectionRef]);

  // Responsive framing: wider lens on portrait/mobile so compositions stay in
  // view without moving the keyframes.
  useEffect(() => {
    const update = () => {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      camera.fov = aspect < 0.75 ? 60 : aspect < 1.1 ? 52 : 45;
      camera.updateProjectionMatrix();
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [camera]);

  useFrame(() => {
    // GSAP mutates plain numbers; this is the only place they reach Three.
    // No React state, so scrolling costs zero renders.
    camera.position.set(cam.px, cam.py, cam.pz);
    lookTarget.set(cam.tx, cam.ty, cam.tz);
    camera.lookAt(lookTarget);
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/* Chapter compositions                                                       */
/* -------------------------------------------------------------------------- */

function Monolith() {
  const group = useRef(null);
  const rings = useRef(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (group.current) group.current.rotation.y = t * 0.12;
    if (rings.current) {
      rings.current.rotation.z = t * 0.1;
      rings.current.rotation.x = Math.sin(t * 0.18) * 0.12;
    }
  });

  return (
    <group position={[0, 2.6, 0]}>
      <mesh geometry={geometries.monolith} material={materials.monolith} scale={[1.15, 1.15, 1.15]} />
      <group ref={rings} rotation={[0.5, 0, -0.2]}>
        <mesh geometry={geometries.ring} material={materials.gold} />
        <mesh geometry={geometries.ringInner} material={materials.steel} rotation={[0.4, 0.3, 0]} />
      </group>
      <mesh
        geometry={geometries.shadow}
        material={materials.shadow}
        position={[0, -2.58, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

function ApproachCluster() {
  const group = useRef(null);
  const baseY = 2.5;

  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = baseY + Math.sin(clock.getElapsedTime() * 0.6) * 0.15;
  });

  return (
    <group ref={group} position={[-11, baseY, -12]}>
      <mesh
        geometry={geometries.slab}
        material={materials.monolith}
        position={[-2.1, 0, 0.6]}
        rotation={[0, 0.42, 0.04]}
      />
      <mesh
        geometry={geometries.slab}
        material={materials.gold}
        position={[0, 0.35, 0]}
        rotation={[0, -0.12, -0.03]}
      />
      <mesh
        geometry={geometries.slab}
        material={materials.steel}
        position={[2.1, -0.2, -0.5]}
        rotation={[0, -0.48, 0.05]}
      />
    </group>
  );
}

function GateCorridor() {
  const gates = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        position: [i % 2 === 0 ? -0.9 : 0.9, 2.7, -24 - i * 4],
        cap: [i % 2 === 0 ? -0.9 : 0.9, 5.45, -24 - i * 4],
      })),
    [],
  );

  return (
    <group>
      {gates.map((gate, i) => (
        <group key={gate.position[2]}>
          <mesh geometry={geometries.gate} material={materials.dark} position={gate.position} />
          <mesh
            geometry={geometries.cap}
            material={i % 2 === 0 ? materials.glow : materials.glowBlue}
            position={gate.cap}
          />
        </group>
      ))}
    </group>
  );
}

function GalleryWall() {
  const frames = useMemo(
    () => [
      { position: [-8.5, 2.3, -58], rotation: [0, 0.62, 0] },
      { position: [-5.5, 2.6, -61], rotation: [0, 0.5, 0] },
      { position: [-2.5, 2.2, -63.5], rotation: [0, 0.38, 0] },
      { position: [0.5, 2.6, -65.5], rotation: [0, 0.26, 0] },
    ],
    [],
  );

  return (
    <group>
      {frames.map((frame, i) => (
        <group key={frame.position[0]} position={frame.position} rotation={frame.rotation}>
          <mesh geometry={geometries.frame} material={materials.dark} />
          <mesh geometry={geometries.frameInner} material={frameMaterials[i % frameMaterials.length]} position={[0, 0, 0.06]} />
        </group>
      ))}
    </group>
  );
}

function Beacon() {
  const group = useRef(null);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.getElapsedTime() * 0.2;
  });

  return (
    <group position={[0, 0, -78]}>
      <mesh geometry={geometries.pillar} material={materials.glow} position={[0, 4.5, 0]} />
      <group ref={group}>
        <mesh
          geometry={geometries.baseRing}
          material={materials.gold}
          position={[0, 0.06, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>
      <mesh
        geometry={geometries.shadow}
        material={materials.shadow}
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.4, 1.4, 1.4]}
      />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

function StoryEnvironment() {
  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 12, 46]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 6]} intensity={1.15} color="#eaf2fb" />
      {/* Gold accents at the two emotional beats: the mark and the beacon. */}
      <pointLight position={[0, 3.5, 3]} intensity={26} distance={16} color={GOLD} />
      <pointLight position={[-6, 4, -58]} intensity={30} distance={20} color={BLUE_SOFT} />
      <pointLight position={[0, 3, -75]} intensity={40} distance={18} color={GOLD} />

      <mesh geometry={geometries.ground} material={materials.ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -30]} />
      <Grid
        position={[0, 0.01, -30]}
        infiniteGrid
        cellSize={2}
        cellThickness={0.6}
        cellColor="#0a2740"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#0b3a66"
        fadeDistance={48}
        fadeStrength={2.2}
      />

      <Monolith />
      <ApproachCluster />
      <GateCorridor />
      <GalleryWall />
      <Beacon />

      {/* Subtle atmosphere: one warm drift near the monogram, one cool field
          along the journey. ~260 points total in two draw calls. */}
      <Sparkles count={140} scale={[24, 10, 24]} position={[0, 4, -2]} size={2.4} speed={0.25} opacity={0.5} color={GOLD} />
      <Sparkles count={120} scale={[70, 14, 90]} position={[0, 5, -40]} size={1.6} speed={0.12} opacity={0.35} color="#8fb4dd" />
    </>
  );
}

/**
 * Exported as the default so ScrollStorySection can lazy() it.
 *
 * `paused` flips the render loop off when the section is offscreen; `sectionRef`
 * is the scroll-space the camera timeline is scrubbed against.
 */
export default function ThreeScene({ sectionRef, paused = false }) {
  return (
    <Canvas
      className="pointer-events-none"
      dpr={[1, 1.75]}
      frameloop={paused ? 'never' : 'always'}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ position: KEYFRAMES[0].p, fov: 45, near: 0.1, far: 120 }}
      onCreated={({ scene }) => {
        scene.fog = new THREE.Fog(BG, 12, 46);
      }}
    >
      <StoryEnvironment />
      <CameraRig sectionRef={sectionRef} />
      <Preload all />
      <AdaptiveDpr />
    </Canvas>
  );
}
