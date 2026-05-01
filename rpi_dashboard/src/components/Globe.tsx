import React, { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import * as THREE from 'three';

// Technical world map projection to create dotted continents
export const Globe: React.FC = () => {
  const globeRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (globeRef.current) {
      // Very slow rotation for stability
      globeRef.current.rotation.y += 0.0005;
    }
  });

  return (
    <group ref={globeRef}>
      {/* Dark silhouette core */}
      <Sphere args={[1.9, 64, 64]}>
        <meshBasicMaterial color="#000000" />
      </Sphere>

      {/* Cybertech Geography Shell */}
      <WorldDotMap radius={2.05} />

      {/* Equator Ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.15, 0.003, 8, 128]} />
        <meshBasicMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.3} 
          blending={THREE.AdditiveBlending} 
        />
      </mesh>
    </group>
  );
};

const WorldDotMap: React.FC<{ radius: number }> = ({ radius }) => {
  const matRef = useRef<THREE.PointsMaterial>(null);
  const lastScale = useRef<number>(0);
  
  // Load the world map texture to use as a mask
  const mapTexture = useLoader(THREE.TextureLoader, 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg');

  useFrame((state) => {
    if (matRef.current) {
      const parent = matRef.current.parent;
      if (parent) {
        let root = parent;
        while (root.parent && root.parent.type !== 'Scene') {
          root = root.parent;
        }
        // Only update if scale changed significantly to save cycles
        if (Math.abs(root.scale.x - lastScale.current) > 0.001) {
          matRef.current.size = root.scale.x * 0.08;
          lastScale.current = root.scale.x;
        }
      }
    }
  });

  const geometry = useMemo(() => {
    const tempPoints = [];
    const count = 8000;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.BufferGeometry();
    
    const img = mapTexture.image;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < count; i++) {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      
      const u = 1 - (theta / (2 * Math.PI) % 1);
      const v = phi / Math.PI;
      
      const xPix = Math.floor(u * (canvas.width - 1));
      const yPix = Math.floor(v * (canvas.height - 1));
      
      const pixelIndex = (yPix * canvas.width + xPix) * 4;
      const intensity = imageData.data[pixelIndex];

      if (intensity > 15) {
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        tempPoints.push(new THREE.Vector3(x, y, z));
      }
    }
    return new THREE.BufferGeometry().setFromPoints(tempPoints);
  }, [radius, mapTexture]);

  return (
    <points geometry={geometry}>
      <pointsMaterial 
        ref={matRef}
        size={0.014} 
        color="#ffffff" 
        transparent 
        opacity={1} 
        sizeAttenuation={true} 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};
