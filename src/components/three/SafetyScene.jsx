import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

// Interactive 3D hero: an abstract "safety core" — a glowing shield lattice
// orbited by guard rings and particles in brand colors. The whole scene eases
// toward the pointer; with prefers-reduced-motion it renders a static frame.

const PRIMARY = '#2563eb';
const ACCENT = '#059669';
const GOLD = '#f59e0b';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ShieldCore({ reduced }) {
  const group = useRef();
  const inner = useRef();

  useFrame(({ clock, pointer }) => {
    if (!group.current || reduced) return;
    const t = clock.elapsedTime;
    // Ease toward pointer for the interactive tilt, plus a slow idle spin.
    group.current.rotation.y += (pointer.x * 0.55 - group.current.rotation.y) * 0.06 + 0.0016;
    group.current.rotation.x += (-pointer.y * 0.4 - group.current.rotation.x) * 0.06;
    group.current.position.y = Math.sin(t * 0.8) * 0.08;
    if (inner.current) inner.current.rotation.y = -t * 0.35;
  });

  return (
    <group ref={group}>
      {/* Outer lattice */}
      <mesh>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshStandardMaterial color={PRIMARY} wireframe transparent opacity={0.55} />
      </mesh>
      {/* Solid inner core */}
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.82, 0]} />
        <meshStandardMaterial color={PRIMARY} metalness={0.35} roughness={0.25} flatShading />
      </mesh>
      {/* Guard rings */}
      <mesh rotation={[Math.PI / 2.4, 0, 0.4]}>
        <torusGeometry args={[1.75, 0.02, 12, 96]} />
        <meshStandardMaterial color={ACCENT} metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 3, 0.5, 0]}>
        <torusGeometry args={[2.02, 0.014, 12, 96]} />
        <meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Particles({ reduced, count = 140 }) {
  const points = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const r = 2.4 + Math.sin(i * 12.9898) * 0.9; // deterministic pseudo-random shell
      const theta = i * 2.399963; // golden angle spiral
      const y = Math.sin(i * 78.233) * 1.6;
      arr[i * 3] = Math.cos(theta) * r;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(theta) * r;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (points.current && !reduced) points.current.rotation.y = clock.elapsedTime * 0.05;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#93c5fd" transparent opacity={0.8} sizeAttenuation />
    </points>
  );
}

export default function SafetyScene() {
  const reduced = prefersReducedMotion();
  return (
    <Canvas
      camera={{ position: [0, 0.4, 5.2], fov: 45 }}
      dpr={[1, 2]}
      frameloop={reduced ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: true }}
      aria-label="Interactive 3D visual of a protective safety core"
      role="img"
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 5, 3]} intensity={1.4} />
      <pointLight position={[-4, -2, -3]} intensity={0.6} color={ACCENT} />
      <ShieldCore reduced={reduced} />
      <Particles reduced={reduced} />
    </Canvas>
  );
}
