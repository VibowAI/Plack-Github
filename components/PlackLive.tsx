'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Radio, 
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { GoogleGenAI, Modality } from "@google/genai";

// Voice states specified by requirements
type VoiceState = 'Ready' | 'Listening' | 'Thinking' | 'Speaking' | 'Connection Lost';

interface PlackLiveProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark' | 'cosmic';
  userEmail?: string;
  userId?: string;
  activeChatId?: string | null;
  onSaveLiveMessages?: (userText: string, assistantText: string) => Promise<string | null>;
  onSaveLiveUserMessage?: (text: string) => Promise<string | null>;
  onSaveLiveAssistantMessage?: (text: string) => Promise<string | null>;
  onLiveTranscriptUpdate?: (transcript: { userText: string, aiText: string }) => void;
  isSidebarOpen: boolean;
  sidebarWidth: number;
  isSourcesSidebarOpen: boolean;
  sourcesWidth: number;
  isMobile: boolean;
}

export default function PlackLive({ 
  isOpen, 
  onClose, 
  theme, 
  userEmail, 
  userId,
  activeChatId,
  onSaveLiveMessages,
  onSaveLiveUserMessage,
  onSaveLiveAssistantMessage,
  onLiveTranscriptUpdate,
  isSidebarOpen,
  sidebarWidth,
  isSourcesSidebarOpen,
  sourcesWidth,
  isMobile
}: PlackLiveProps) {
  const [voiceState, setVoiceStateState] = useState<VoiceState>('Ready');
  const voiceStateRef = useRef<VoiceState>('Ready');
  
  // Custom setter to maintain both state and mutable ref
  const setVoiceState = (state: VoiceState) => {
    setVoiceStateState(state);
    voiceStateRef.current = state;
    if (state === 'Thinking') {
      console.log("[AI THINKING]");
    } else if (state === 'Listening') {
      console.log("[LISTENING]");
    }
  };

  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const saveLiveMessagesRef = useRef(onSaveLiveMessages);
  useEffect(() => {
    saveLiveMessagesRef.current = onSaveLiveMessages;
  }, [onSaveLiveMessages]);

  const saveLiveUserMessageRef = useRef(onSaveLiveUserMessage);
  useEffect(() => {
    saveLiveUserMessageRef.current = onSaveLiveUserMessage;
  }, [onSaveLiveUserMessage]);

  const saveLiveAssistantMessageRef = useRef(onSaveLiveAssistantMessage);
  useEffect(() => {
    saveLiveAssistantMessageRef.current = onSaveLiveAssistantMessage;
  }, [onSaveLiveAssistantMessage]);

  // Real-time audio analyzer properties for animations
  const [audioLevel, setAudioLevel] = useState(0); 
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [subtitleText, setSubtitleText] = useState('');

  // Accumulate text for saving conversational turns
  const currentUserTextRef = useRef<string>("");
  const currentAiTextRef = useRef<string>("");

  // Refs for tracking active devices & streams
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Official Gemini Live API instances
  const sessionRef = useRef<any>(null);

  // Audio Playback context and precise chronological queue refs
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentPlaybacksCountRef = useRef(0);

  // Clean up all active playbacks & audio cues
  const stopAllPlayback = () => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
    if (currentPlaybacksCountRef.current > 0) {
      currentPlaybacksCountRef.current = 0;
      console.log("[AUDIO PLAYBACK END]");
    }
  };

  // Convert base64 bytes to Float32 PCM (for 24kHz model output)
  const base64ToFloat32 = (base64: string): Float32Array => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  };

  // Convert Float32 input PCM to base64 int16 string
  const int16ToBase64 = (buffer: Int16Array): string => {
    const bytes = new Uint8Array(buffer.buffer);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Play real-time returned audio chunk chronologically to shield from jitter
  const playAudioChunk = (base64Data: string) => {
    try {
      if (!outputAudioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        outputAudioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
      }

      const ctx = outputAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const float32Array = base64ToFloat32(base64Data);
      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const now = ctx.currentTime;
      let playTime = nextStartTimeRef.current;
      if (playTime < now) {
        playTime = now + 0.05; // 50ms buffering delay to prevent overlaps/gaps
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      currentPlaybacksCountRef.current++;
      if (currentPlaybacksCountRef.current === 1) {
        setVoiceState('Speaking');
        console.log("[AUDIO PLAYBACK START]");
        console.log("[AI SPEAKING]");
      }

      source.onended = () => {
        currentPlaybacksCountRef.current--;
        if (currentPlaybacksCountRef.current <= 0) {
          currentPlaybacksCountRef.current = 0;
          console.log("[AUDIO PLAYBACK END]");
          // Cleanly transition state back to Listening once playback fully terminates
          if (voiceStateRef.current === 'Speaking') {
            setVoiceState('Listening');
            setSubtitleText('Listening...');
          }
        }
      };

      source.start(playTime);
      activeSourcesRef.current.push(source);

      nextStartTimeRef.current = playTime + audioBuffer.duration;
    } catch (err) {
      console.warn("Failed playing audio chunk:", err);
    }
  };

  // Initialize Microphone, audio analytical nodes, and connect to official Gemini Live session
  const initMicrophoneAndLiveSession = async () => {
    try {
      setPermissionError(null);
      console.log("[MIC REQUEST]");
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      console.log("[MIC READY]");

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("AudioContext is not supported in this browser");
      }

      const inputContext = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = inputContext;

      const source = inputContext.createMediaStreamSource(stream);
      const analyser = inputContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Track active volume levels for waveform animations
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i];
        }
        const average = total / bufferLength;
        setAudioLevel(Math.min(average / 120, 1));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Retrieve Gemini API Key securely from Server API
      console.log("[LIVE SESSION CONNECTING]");
      setVoiceState('Thinking');
      setSubtitleText("Connecting to Plack Live...");

      const keyRes = await fetch('/api/live-key');
      if (!keyRes.ok) {
        throw new Error("Unable to fetch Live API Key");
      }
      const { apiKey } = await keyRes.json();
      if (!apiKey) {
        throw new Error("No Live API key configured on server");
      }

      const ai = new GoogleGenAI({ apiKey });

      // Connect to Gemini Live Session
      const session = await ai.live.connect({
        model: "models/gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          generationConfig: {
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoede" // Modern, human-like voice selection 
                }
              }
            }
          }
        },
        callbacks: {
          onmessage: (message) => {
            // Check for user-spoken transcription
            const inputTranscription = message.serverContent?.inputTranscription;
            if (inputTranscription?.text) {
              const uText = inputTranscription.text.trim();
              if (uText) {
                currentUserTextRef.current = uText;
                console.log("[AUDIO SENT & TRANSCRIBED]", uText);
                console.log("[NEW TURN STARTED]");
                saveLiveUserMessageRef.current?.(uText);
                onLiveTranscriptUpdate?.({ userText: uText, aiText: currentAiTextRef.current });
                console.log("[LIVE TRANSCRIPT UPDATED]");
              }
            }

            // Check for model incoming spoken content
            const modelTurn = message.serverContent?.modelTurn;
            if (modelTurn?.parts) {
              setVoiceState('Speaking');
              for (const part of modelTurn.parts) {
                if (part.text) {
                  currentAiTextRef.current += part.text;
                  onLiveTranscriptUpdate?.({ userText: currentUserTextRef.current, aiText: currentAiTextRef.current });
                  console.log("[LIVE TRANSCRIPT UPDATED]");
                }
                if (part.inlineData?.data) {
                  playAudioChunk(part.inlineData.data);
                }
              }
            }

            // Check for user interruption (interrupted speaking)
            if (message.serverContent?.interrupted) {
              console.log("[LIVE INTERRUPT DETECTED]");
              console.log("[AI SPEECH STOPPED]");
              console.log("[USER TOOK CONTROL]");
              stopAllPlayback();
              console.log("[PLAYBACK STOPPED]");
              
              const aText = currentAiTextRef.current.trim();
              if (aText) {
                saveLiveAssistantMessageRef.current?.(aText);
              }
              
              currentUserTextRef.current = "";
              currentAiTextRef.current = "";
              onLiveTranscriptUpdate?.({ userText: '', aiText: '' });
              console.log("[LIVE TRANSCRIPT UPDATED]");
              setVoiceState('Listening');
            }

            // Save completed conversational turn in the chat system once complete
            if (message.serverContent?.turnComplete) {
              const aText = currentAiTextRef.current.trim();
              if (aText) {
                saveLiveAssistantMessageRef.current?.(aText);
              }
              
              currentUserTextRef.current = "";
              currentAiTextRef.current = "";
              onLiveTranscriptUpdate?.({ userText: '', aiText: '' });
              console.log("[LIVE TRANSCRIPT UPDATED]");
              setVoiceState('Listening');
            }
          },
          onclose: () => {
            console.log("[LIVE SESSION CLOSED]");
            console.log("[LIVE ENDED]");
            setVoiceState('Ready');
            setSubtitleText("Session ended.");
          },
          onerror: (err) => {
            console.error("[LIVE ERROR]", err);
            setVoiceState('Connection Lost');
            setSubtitleText("Unable to connect to Plack Live.");
            setPermissionError("Unable to connect to Plack Live.");
          }
        }
      });

      sessionRef.current = session;
      console.log("[LIVE SESSION CONNECTED]");
      setVoiceState('Listening');
      setSubtitleText("Listening...");

      // Configure ScriptProcessor to capture microphone input
      const processor = inputContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(inputContext.destination);

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || voiceStateRef.current === 'Connection Lost' || !sessionRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // 1. Calculate input raw sample Root Mean Square (RMS) for instant local interruption
        let squareSum = 0;
        for (let i = 0; i < inputData.length; i++) {
          squareSum += inputData[i] * inputData[i];
        }
        const rmsValue = Math.sqrt(squareSum / inputData.length);

        // Immediate stop if user speaks while AI generated audio is playing or thinking
        if (rmsValue > 0.04 && (voiceStateRef.current === 'Speaking' || voiceStateRef.current === 'Thinking')) {
          console.log("[LIVE INTERRUPT DETECTED]");
          console.log("[AI SPEECH STOPPED]");
          console.log("[USER TOOK CONTROL]");
          stopAllPlayback();
          console.log("[PLAYBACK STOPPED]");
          setVoiceState('Listening');
          setSubtitleText('Listening...');
        }

        // 2. Stream audio payload to the websocket session
        const pcmBuffer = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const base64 = int16ToBase64(pcmBuffer);
        
        try {
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64, mimeType: "audio/pcm;rate=16000" }
          });
          // Avoid flooding system console, only debug occasional packages
        } catch (err) {
          console.warn("Failed streaming audio input chunk:", err);
        }
      };

      return true;
    } catch (err: any) {
      console.error("[LIVE ERROR]", err);
      setVoiceState('Connection Lost');
      setPermissionError('Could not start Plack Live. Please verify microphone access permissions.');
      return false;
    }
  };

  // Helper stopping media stream tracks
  const stopMediaTracks = (stream: MediaStream | null) => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  // Clear session objects and release device hooks
  const cleanUpSession = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    stopAllPlayback();

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {}
      sessionRef.current = null;
      console.log("[LIVE SESSION CLOSED]");
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {}
      processorRef.current = null;
    }

    stopMediaTracks(micStreamRef.current);

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
    }

    micStreamRef.current = null;
    audioContextRef.current = null;
    outputAudioCtxRef.current = null;
  };

  // Initial trigger
  useEffect(() => {
    if (isOpen) {
      console.log("[LIVE START]");
      
      const t = setTimeout(() => {
        setIsMuted(false);
        setVoiceState('Ready');
        setSubtitleText('Initializing...');
        initMicrophoneAndLiveSession();
      }, 0);

      return () => {
        clearTimeout(t);
        cleanUpSession();
      };
    }
  }, [isOpen]);

  // Setup gorgeous flowing animated horizontal wave spectrum (Apple Intelligence inspired)
  useEffect(() => {
    if (!isOpen) return;

    let animFrame: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const currentWidth = rect?.width || window.innerWidth;
      const currentHeight = rect?.height || 140;
      
      canvas.width = currentWidth * window.devicePixelRatio;
      canvas.height = currentHeight * window.devicePixelRatio;
      canvas.style.width = `${currentWidth}px`;
      canvas.style.height = `${currentHeight}px`;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Soft Indigo / Violet palette matches dark atmospheric aurora glows
    const waveItems = [
      { color: 'rgba(56, 189, 248, 0.72)', amplitude: 28, frequency: 0.007, speed: 0.024, phase: 0 },
      { color: 'rgba(99, 102, 241, 0.62)', amplitude: 20, frequency: 0.011, speed: -0.018, phase: 1.5 },
      { color: 'rgba(168, 85, 247, 0.55)', amplitude: 16, frequency: 0.014, speed: 0.032, phase: 3.2 },
      { color: 'rgba(45, 212, 191, 0.45)', amplitude: 12, frequency: 0.009, speed: -0.012, phase: 4.8 }
    ];

    const renderLoop = () => {
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;
      
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const dW = w / window.devicePixelRatio;
      const dH = h / window.devicePixelRatio;

      let multiplierAmp = 1.0;
      let multiplierFreq = 1.0;
      let multiplierSpeed = 1.0;

      if (isMuted || voiceState === 'Ready') {
        multiplierAmp = 0.05;
        multiplierFreq = 0.3;
        multiplierSpeed = 0.2;
      } else if (voiceState === 'Listening') {
        // Microphone level powers dynamic active waveform
        multiplierAmp = 0.35 + audioLevel * 2.5;
        multiplierFreq = 0.8 + audioLevel * 0.4;
        multiplierSpeed = 0.9 + audioLevel * 0.5;
      } else if (voiceState === 'Thinking') {
        // Gentle mysterious pulsing
        multiplierAmp = 0.3 + Math.sin(Date.now() / 250) * 0.08;
        multiplierFreq = 2.0;
        multiplierSpeed = 1.4;
      } else if (voiceState === 'Speaking') {
        // Simulated voice fluctuations
        const voiceFlux = 0.35 + Math.sin(Date.now() / 140) * 0.35;
        multiplierAmp = 0.6 + voiceFlux * 2.0;
        multiplierFreq = 1.1;
        multiplierSpeed = 1.2;
      } else if (voiceState === 'Connection Lost') {
        multiplierAmp = 0.05;
        multiplierFreq = 0.4;
        multiplierSpeed = 0.1;
      }

      waveItems.forEach((wave, idx) => {
        wave.phase += wave.speed * multiplierSpeed;
        ctx.beginPath();
        ctx.lineWidth = idx === 0 ? 3.5 : 2.0;

        if (voiceState === 'Connection Lost') {
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 - idx * 0.1})`;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.25)';
        } else {
          ctx.strokeStyle = wave.color;
          ctx.shadowColor = wave.color;
        }

        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        for (let x = 0; x < dW; x++) {
          const offsetSine = Math.sin(x * wave.frequency * multiplierFreq + wave.phase);
          const y = (dH / 2) + offsetSine * wave.amplitude * multiplierAmp;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      ctx.restore();
      animFrame = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, voiceState, audioLevel, isMuted]);

  if (!isOpen) return null;

  // Toggle local mute state directly
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      console.log("[MUTED]");
      setSubtitleText("Microphone muted.");
    } else {
      console.log("[UNMUTED]");
      setSubtitleText("Listening...");
    }
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        id="plack-live-dock"
        initial={{ opacity: 0, y: 120 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 120 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed bottom-0 z-[95] flex flex-col items-center justify-end overflow-hidden select-none pb-6 pt-16 font-sans h-[160px] pointer-events-none",
          theme === 'light'
            ? "bg-gradient-to-t from-white via-white/80 to-transparent text-neutral-800"
            : theme === 'cosmic'
              ? "bg-gradient-to-t from-[#050114] via-[#050114]/80 to-transparent text-white"
              : "bg-gradient-to-t from-[#000000] via-[#000000]/80 to-transparent text-white"
        )}
        style={{
          left: isSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px',
          right: isSourcesSidebarOpen && !isMobile ? `${sourcesWidth}px` : '0px',
          transition: 'left 300ms cubic-bezier(0.16, 1, 0.3, 1), right 300ms cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Soft glowing ambient lighting underneath */}
        <div className="absolute inset-x-0 bottom-0 top-1/2 z-0 overflow-hidden pointer-events-none opacity-80 backdrop-blur-3xl">
          <div className="absolute -left-[5%] bottom-[-20%] w-[250px] h-[250px] rounded-full bg-blue-600/20 blur-[60px] mix-blend-screen" />
          <div className="absolute -right-[5%] bottom-[-20%] w-[250px] h-[250px] rounded-full bg-purple-600/20 blur-[60px] mix-blend-screen" />
        </div>

        {/* Display Connection/Permission Errors if present */}
        {permissionError && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-red-500/30 text-red-300 text-[11px] backdrop-blur-md shadow-lg pointer-events-auto">
            <AlertCircle size={14} className="shrink-0 text-red-400" />
            <span className="truncate">{permissionError}</span>
            <button 
              onClick={() => setPermissionError(null)} 
              className="ml-2 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Core Layout Structure */}
        <div className="relative z-10 w-full max-w-[600px] flex flex-col items-center gap-3 px-6 pb-2 pointer-events-auto">
          
          {/* Row 1: Voice State Indicator */}
          <div className="flex flex-col items-center justify-center select-none shrink-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={isMuted ? "Paused" : voiceState}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn(
                  "flex items-center gap-2 text-[12px] font-medium tracking-[0.1em] uppercase",
                  isMuted
                    ? "text-neutral-500"
                    : voiceState === 'Listening'
                      ? "text-neutral-300"
                      : voiceState === 'Thinking'
                        ? "text-indigo-400"
                        : voiceState === 'Speaking'
                          ? "text-blue-400"
                          : "text-neutral-500"
                )}
              >
                {voiceState === 'Thinking' && (
                  <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-indigo-500 animate-bounce" />
                )}
                <span className={cn(
                  theme === 'light' && !isMuted ? "text-neutral-600" : ""
                )}>{isMuted ? "Paused" : voiceState}</span>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Row 2: Waveform Visualization */}
          <div className="w-full h-[32px] flex items-center justify-center relative select-none pointer-events-none">
            <canvas ref={canvasRef} className="w-full h-full block opacity-90" />
          </div>

          {/* Row 3: Central control keys */}
          <div className="flex items-center justify-center gap-4 mt-2">
            
            {/* Pause/Mute Toggle */}
            {voiceState !== 'Connection Lost' && (
              <button
                onClick={handleToggleMute}
                disabled={voiceState === 'Connection Lost'}
                className={cn(
                  "flex items-center justify-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 text-[13px] font-medium active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer select-none",
                  isMuted
                    ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 backdrop-blur-md"
                    : theme === 'light'
                      ? "bg-neutral-200/60 hover:bg-neutral-200 text-neutral-800 backdrop-blur-md"
                      : "bg-white/10 hover:bg-white/15 text-white backdrop-blur-md"
                )}
                title={isMuted ? "Resume" : "Pause"}
              >
                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{isMuted ? "Resume" : "Pause"}</span>
              </button>
            )}

            {/* Retry Connection Button */}
            {voiceState === 'Connection Lost' && (
              <button
                onClick={() => {
                  setVoiceState('Ready');
                  setSubtitleText('Initializing...');
                  initMicrophoneAndLiveSession();
                }}
                className={cn(
                  "flex items-center justify-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 text-[13px] font-medium active:scale-95 cursor-pointer select-none",
                  "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                )}
                title="Retry Connection"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>Retry</span>
              </button>
            )}

            {/* End Session Button */}
            <button
              id="end-session-btn"
              onClick={() => {
                cleanUpSession();
                onClose();
              }}
              className="flex items-center justify-center px-4 py-2.5 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 text-white transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.3)] cursor-pointer select-none"
              title="End Voice Session"
            >
              <PhoneOff size={18} fill="currentColor" />
            </button>

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
