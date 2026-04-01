"use client";

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

export default function Orb({ state }: { state: 'idle' | 'listening' | 'speaking' | 'processing' }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Colores del Banco Mercantil Santa Cruz:
  // Amarillo mercantil: #FBC02D (o amarillo fuerte)
  // Verde/Azul corporativo: #0B4235 o simplemente un verde oscuro
  
  const getConfig = () => {
    switch(state) {
      case 'listening': 
        return { color: '#FBC02D', distort: 0.4, speed: 4 }; // Amarillo ágil
      case 'processing': 
        return { color: '#4FC3F7', distort: 0.6, speed: 6 }; // Celeste movido
      case 'speaking': 
        return { color: '#00E676', distort: 0.8, speed: 8 }; // Verde reactivo
      case 'idle':
      default:
        return { color: '#0B4235', distort: 0.2, speed: 2 }; // Verde oscuro tranquilo
    }
  };

  const config = getConfig();

  useFrame((stateObj, delta) => {
    if (meshRef.current) {
        meshRef.current.rotation.x += delta * 0.2;
        meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 64, 64]} scale={2}>
      <MeshDistortMaterial
        color={config.color}
        envMapIntensity={1}
        clearcoat={1}
        clearcoatRoughness={0.1}
        metalness={0.5}
        roughness={0.2}
        distort={config.distort}
        speed={config.speed}
      />
      
      {/* Luz interna del orbe para efecto de neón */}
      <pointLight 
         color={config.color} 
         intensity={state === 'idle' ? 2 : 5} 
         distance={10} 
      />
    </Sphere>
  );
}
