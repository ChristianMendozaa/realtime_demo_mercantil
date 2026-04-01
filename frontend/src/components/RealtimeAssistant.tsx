"use client";

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import Orb from './Orb';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import styles from './RealtimeAssistant.module.css';

type AppState = 'idle' | 'listening' | 'processing' | 'speaking';

export default function RealtimeAssistant() {
  const [state, setState] = useState<AppState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Referencias para WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-4), msg]);
  };

  const initWebRTC = async () => {
    try {
      addLog("Solicitando Token Seguro al Backend (REST)...");
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      
      // 1. Obtener Ephemeral Token de FastAPI
      const sessionRes = await fetch(`${backendUrl}/api/session`);
      if (!sessionRes.ok) {
        throw new Error("HTTP Backend falló al pedir Session a OpenAI. Asegura que FastAPI corra.");
      }
      const sessionData = await sessionRes.json();
      const ephemeralKey = sessionData.client_secret.value;

      // 2. Iniciar WebRTC Peer Connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Elemento de audio invisible para reproducir la voz de OpenAI
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = e => {
        addLog("Conexión de Audio Recibida (Zero Latency)...");
        audioEl.srcObject = e.streams[0];
      };

      // 3. Obtener micrófono local y agregarlo a WebRTC
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = ms;
      pc.addTrack(ms.getTracks()[0]);

      // 4. Configurar el Data Channel para enviar y recibir texto/eventos
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      
      dc.onopen = () => {
          setIsConnected(true);
          setState("listening");
          addLog("Banco Mercantil WebRTC Activo. ¡Habla ahora!");
      };

      dc.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        handleOpenAIEvent(msg, dc, backendUrl);
      };

      // 5. Crear la oferta SDP local
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-realtime-mini-2025-12-15";
      
      // 6. Hacer el handshake WebRTC de autorización sobre HTTP SSL
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp"
        }
      });

      if (!sdpResponse.ok) {
          throw new Error("Handshake SDP falló debido a llave o modelo.");
      }
      
      // 7. Settear la respuesta SDP Remota (el server contesta)
      const answer = {
          type: "answer" as RTCSdpType,
          sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

    } catch (err: any) {
      addLog(`Error WebRTC: ${err.message}`);
      disconnect();
    }
  };

  const handleOpenAIEvent = async (msg: any, dc: RTCDataChannel, backendUrl: string) => {
    try {
      if (msg.type === "response.created") setState("processing");
      
      // Cuando empezamos a recibir el streaming de inteligencia
      if (msg.type === "response.audio.delta" && state !== "speaking") {
          setState("speaking");
      }
      
      // Transcripción local 
      if (msg.type === "response.audio_transcript.done") {
          addLog("Banco: " + msg.transcript);
          setState("listening");
      }
      
      // Manejo de la función delegada al Backend (Seguridad)
      if (msg.type === "response.function_call_arguments.done") {
        setState("processing");
        addLog(`Verificando Tool Backend HTTPS: ${msg.name}`);
        
        let argsObj = {};
        try { argsObj = JSON.parse(msg.arguments); } catch(e){}

        // Enviar vía REST POST simple al Backend
        const toolReq = await fetch(`${backendUrl}/api/tools`, {
            method: "POST",
            body: JSON.stringify({ name: msg.name, arguments: argsObj }),
            headers: { "Content-Type": "application/json" }
        });
        const result = await toolReq.json();
        
        // Devolver resultado de forma P2P a OpenAI en el momento exacto
        dc.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                call_id: msg.call_id,
                output: JSON.stringify(result)
            }
        }));
        dc.send(JSON.stringify({ type: "response.create" }));
      }
    } catch(err) {
      console.error(err);
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setState("idle");
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    dcRef.current?.close();
    pcRef.current?.close();
    
    localStreamRef.current = null;
    dcRef.current = null;
    pcRef.current = null;
    addLog("Desconectado de WebRTC.");
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          Banco Mercantil Santa Cruz
        </h1>
        <p className={styles.subtitle}>Asistente WebRTC Zero-Latency (HTTPS)</p>
      </div>

      <div className={styles.orbContainer}>
        <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <Environment preset="night" />
          <Orb state={state} />
          <OrbitControls enableZoom={false} />
        </Canvas>
        
        <div className={styles.statusOverlay}>
          {state}
        </div>
      </div>

      <div className={styles.controls}>
        <button
          onClick={isConnected ? disconnect : initWebRTC}
          className={`${styles.button} ${isConnected ? styles.buttonConnected : styles.buttonDisconnected}`}
        >
          {isConnected ? (
            <><MicOff style={{marginRight: '8px'}} /> Detener Streaming P2P</>
          ) : (
            <><Mic style={{marginRight: '8px'}} /> Iniciar P2P Asistente Seguro</>
          )}
        </button>
        
        <div className={styles.logs}>
          {logs.map((log, i) => (
            <div key={i} className={styles.logEntry}>{'>_ '} {log}</div>
          ))}
          {logs.length === 0 && <span className={styles.logEmpty}>Esperando conexión HTTPS...</span>}
        </div>

        <div className={styles.permissionInfo}>
          <AlertCircle style={{width: '16px', height: '16px', marginRight: '4px'}} /> Autenticación Serverless sobre Vercel aplicable.
        </div>
      </div>
    </div>
  );
}
