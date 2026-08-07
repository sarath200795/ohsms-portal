import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

// Full-page interactive 3D scene, fixed behind the scrolling content.
// Interactions: pointer parallax, scroll-driven camera pull & ring expansion,
// click pulse on the safety core. Reduced motion → static frame.

const PRIMARY = '#2563eb';
const LIGHT_BLUE = '#60a5fa';
const ACCENT = '#059669';
const GOLD = '#f59e0b';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useScrollProgress() {
  const progress = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.current = max > 0 ? window.scrollY / max : 0;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return progress;
}

function SafetyCore({ reduced, scroll, pulseRef }) {
  const group = useRef();
  const lattice = useRef();
  const inner = useRef();
  const ringA = useRef();
  const ringB = useRef();
  const ringC = useRef();

  useFrame(({ clock, pointer, camera }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const s = scroll.current;

    if (!reduced) {
      // Pointer parallax + idle spin
      group.current.rotation.y += (pointer.x * 0.6 - group.current.rotation.y) * 0.05 + 0.002;
      group.current.rotation.x += (-pointer.y * 0.45 - group.current.rotation.x) * 0.05;
      group.current.position.y = Math.sin(t * 0.7) * 0.1;
      if (lattice.current) lattice.current.rotation.z = t * 0.08;
      if (inner.current) inner.current.rotation.y = -t * 0.4;

      // Click pulse decays back to 1
      pulseRef.current += (1 - pulseRef.current) * 0.08;
      const pulse = pulseRef.current;
      group.current.scale.setScalar(pulse);

      // Scroll: camera pulls back and drifts up; rings expand outward
      camera.position.z = 5.2 + s * 3.2;
      camera.position.y = 0.4 + s * 1.4;
      camera.lookAt(0, 0, 0);
      if (ringA.current) ringA.current.scale.setScalar(1 + s * 0.9);
      if (ringB.current) ringB.current.scale.setScalar(1 + s * 1.5);
      if (ringC.current) ringC.current.scale.setScalar(1 + s * 2.2);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={lattice}>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshStandardMaterial color={PRIMARY} wireframe transparent opacity={0.5} />
      </mesh>
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial color={PRIMARY} metalness={0.4} roughness={0.25} flatShading />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color={LIGHT_BLUE}
          emissive={LIGHT_BLUE}
          emissiveIntensity={0.6}
          metalness={0.2}
          roughness={0.4}
        />
      </mesh>
      <mesh ref={ringA} rotation={[Math.PI / 2.4, 0, 0.4]}>
        <torusGeometry args={[1.9, 0.022, 12, 96]} />
        <meshStandardMaterial color={ACCENT} metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh ref={ringB} rotation={[-Math.PI / 3, 0.5, 0]}>
        <torusGeometry args={[2.2, 0.016, 12, 96]} />
        <meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh ref={ringC} rotation={[Math.PI / 5, -0.6, 0.2]}>
        <torusGeometry args={[2.55, 0.012, 12, 96]} />
        <meshStandardMaterial color={LIGHT_BLUE} metalness={0.5} roughness={0.35} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Starfield({ reduced, count = 260 }) {
  const points = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // deterministic spherical-ish shell via golden-angle spiral
      const r = 3.2 + Math.abs(Math.sin(i * 12.9898)) * 5.5;
      const theta = i * 2.399963;
      arr[i * 3] = Math.cos(theta) * r;
      arr[i * 3 + 1] = Math.sin(i * 78.233) * 4.2;
      arr[i * 3 + 2] = Math.sin(theta) * r - 1.5;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (points.current && !reduced) points.current.rotation.y = clock.elapsedTime * 0.03;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#93c5fd" transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

export default function Scene() {
  const [reduced] = useState(prefersReducedMotion);
  const scroll = useScrollProgress();
  const pulseRef = useRef(1);

  return (
    <div id="scene-root" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0.4, 5.2], fov: 45 }}
        dpr={[1, 2]}
        frameloop={reduced ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true }}
        onPointerDown={() => {
          pulseRef.current = 1.25;
        }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 5, 3]} intensity={1.5} />
        <pointLight position={[-4, -2, -3]} intensity={0.7} color={ACCENT} />
        <SafetyCore reduced={reduced} scroll={scroll} pulseRef={pulseRef} />
        <Starfield reduced={reduced} />
      </Canvas>
    </div>
  );
}
