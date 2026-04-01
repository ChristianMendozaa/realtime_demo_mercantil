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
  const ws = useRef<WebSocket | null>(null);
  
  // Audio state
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playTimeRef = useRef<number>(0);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-4), msg]);
  };

  const connect = async () => {
    try {
      const wsUrl = process.env.NEXT_PUBLIC_WS_BACKEND_URL || 'ws://127.0.0.1:8000/ws/realtime';
      ws.current = new WebSocket(wsUrl);
      
      ws.current.onopen = async () => {
        setIsConnected(true);
        setState('listening');
        addLog("Conectado. Inicializando micrófono...");
        await initMicrophone();
      };
      
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerEvent(data);
      };
      
      ws.current.onclose = () => {
        setIsConnected(false);
        setState('idle');
        addLog("Conexión cerrada.");
        stopMicrophone();
      };
    } catch (err) {
      addLog("Error en conexión.");
    }
  };

  const disconnect = () => {
    if (ws.current) {
      ws.current.close();
    }
  };

  const initMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioCtxRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      source.connect(processor);
      processor.connect(audioCtx.destination);
      
      processor.onaudioprocess = (e) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        const buffer = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64 = btoa(binary);
        
        ws.current.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64
        }));
      };
      
    } catch (err) {
      addLog("Micrófono denegado o error.");
      disconnect();
    }
  };

  const stopMicrophone = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const handleServerEvent = (data: any) => {
    switch (data.type) {
      case 'response.created':
        setState('processing');
        break;
      case 'response.audio.delta':
        setState('speaking');
        playAudioDelta(data.delta);
        break;
      case 'response.done':
        setState('listening');
        break;
      case 'response.function_call_arguments.done':
        addLog(`Simulando operación: ${data.name}...`);
        setState('processing');
        break;
      case 'conversation.item.create':
        if(data.item?.role === "assistant" && data.item?.content) {
            const txt = data.item.content.find((c: any) => c.type === "text");
            if(txt) addLog("Banco: " + txt.text);
        }
        break;
    }
  };

  const playAudioDelta = (base64Audio: string) => {
    if (!audioCtxRef.current) return;
    
    const binaryStr = atob(base64Audio);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }
    
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const buffer = audioCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    if (playTimeRef.current < now) {
        playTimeRef.current = now;
    }
    
    source.start(playTimeRef.current);
    playTimeRef.current += buffer.duration;
  };

  useEffect(() => {
    return () => {
      stopMicrophone();
      disconnect();
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          Banco Mercantil Santa Cruz
        </h1>
        <p className={styles.subtitle}>Asistente Virtual por Voz (Demo)</p>
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
          onClick={isConnected ? disconnect : connect}
          className={`${styles.button} ${isConnected ? styles.buttonConnected : styles.buttonDisconnected}`}
        >
          {isConnected ? (
            <><MicOff style={{marginRight: '8px'}} /> Detener Conexión</>
          ) : (
            <><Mic style={{marginRight: '8px'}} /> Iniciar Asistente de Voz</>
          )}
        </button>
        
        <div className={styles.logs}>
          {logs.map((log, i) => (
            <div key={i} className={styles.logEntry}>{'>_ '} {log}</div>
          ))}
          {logs.length === 0 && <span className={styles.logEmpty}>Esperando conexión...</span>}
        </div>

        <div className={styles.permissionInfo}>
          <AlertCircle style={{width: '16px', height: '16px', marginRight: '4px'}} /> Requiere permisos de micrófono.
        </div>
      </div>
    </div>
  );
}
