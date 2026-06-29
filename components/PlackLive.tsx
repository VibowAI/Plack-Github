'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Radio, 
  AlertCircle,
  Pause,
  Play,
  Volume2,
  MonitorUp,
  Video,
  Menu,
  MoreVertical,
  VideoOff,
  Sliders,
  Sparkles
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
  liveVoice?: string;
  chatHistory?: any[];
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
  isMobile,
  liveVoice = 'Aoede',
  chatHistory = []
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

  // States to hold currently active live turn text
  const [liveUserText, setLiveUserText] = useState('');
  const [liveAiText, setLiveAiText] = useState('');

  // Local active states for camera and screen sharing (mock visualization)
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Accumulate text for saving conversational turns
  const currentUserTextRef = useRef<string>("");
  const currentAiTextRef = useRef<string>("");

  // Refs for tracking active devices & streams
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Official Gemini Live API instances
  const sessionRef = useRef<any>(null);

  // Audio Playback context and chronological queue refs
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

      const keyRes = await fetch('/api/live-key');
      if (!keyRes.ok) {
        throw new Error("Unable to fetch Live API Key");
      }
      const { apiKey } = await keyRes.json();
      if (!apiKey) {
        throw new Error("No Live API key configured on server");
      }

      const ai = new GoogleGenAI({ apiKey });

      // Format chat history into a concise prompt for context
      let historyContext = "";
      if (chatHistory && chatHistory.length > 0) {
        historyContext = "\n\nHere is the ongoing conversation history for context:\n";
        const recentHistory = chatHistory.slice(-10);
        recentHistory.forEach(msg => {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          historyContext += `${role}: ${msg.content}\n`;
        });
      }

      // Connect to Gemini Live Session
      const session = await ai.live.connect({
        model: "models/gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: "You are Plack AI's Voice Assistant. Speak naturally, concisely, and fluidly. Use a conversational tone appropriate for voice interactions." + historyContext }]
          },
          tools: [{ googleSearch: {} }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          generationConfig: {
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: liveVoice 
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
                setLiveUserText(uText);
                setLiveAiText(''); // clear previous AI response text
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
                  setLiveAiText(currentAiTextRef.current);
                  setLiveUserText(''); // clear active user transcript
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
              setLiveUserText('');
              setLiveAiText('');
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
              setLiveUserText('');
              setLiveAiText('');
              onLiveTranscriptUpdate?.({ userText: '', aiText: '' });
              console.log("[LIVE TRANSCRIPT UPDATED]");
              setVoiceState('Listening');
            }
          },
          onclose: () => {
            console.log("[LIVE SESSION CLOSED]");
            console.log("[LIVE ENDED]");
            setVoiceState('Ready');
          },
          onerror: (err) => {
            console.error("[LIVE ERROR]", err);
            setVoiceState('Connection Lost');
            setPermissionError("Unable to connect to Plack Live.");
          }
        }
      });

      sessionRef.current = session;
      console.log("[LIVE SESSION CONNECTED]");
      setVoiceState('Listening');

      // Configure ScriptProcessor to capture microphone input
      const processor = inputContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(inputContext.destination);

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || voiceStateRef.current === 'Connection Lost' || !sessionRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate input raw sample Root Mean Square (RMS) for instant local interruption
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
        }

        // Stream audio payload to the websocket session
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
        initMicrophoneAndLiveSession();
      }, 0);

      return () => {
        clearTimeout(t);
        cleanUpSession();
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Automatic scrolling to the bottom of the conversation area
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, liveUserText, liveAiText]);

  if (!isOpen) return null;

  // Toggle local mute state directly
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      console.log("[MUTED]");
    } else {
      console.log("[UNMUTED]");
    }
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }
    // Update voice state context
    if (nextMuted) {
      setVoiceState('Ready');
    } else {
      setVoiceState('Listening');
    }
  };

  // Build accumulated message list for the conversation visual scroll area
  const allMessages = [...(chatHistory || [])];

  const isUserMsgAlreadyInHistory = allMessages.length > 0 && 
    allMessages[allMessages.length - 1].role === 'user' && 
    allMessages[allMessages.length - 1].content.trim() === liveUserText.trim();

  if (liveUserText && !isUserMsgAlreadyInHistory) {
    allMessages.push({ id: 'live-user-temp', role: 'user', content: liveUserText });
  }

  const isAiMsgAlreadyInHistory = allMessages.length > 0 && 
    allMessages[allMessages.length - 1].role === 'model' && 
    allMessages[allMessages.length - 1].content.trim() === liveAiText.trim();

  if (liveAiText && !isAiMsgAlreadyInHistory) {
    allMessages.push({ id: 'live-ai-temp', role: 'model', content: liveAiText });
  }

  // Visual Center Orb Redesign
  const renderCenterOrb = () => {
    let orbGradientClass = "from-[#0a4bf5] via-[#1e0bf6] to-[#6006f7] shadow-[0_0_50px_rgba(30,11,246,0.6)]";
    let animateProps: any = {};

    if (voiceState === 'Ready' || voiceState === 'Connection Lost' || isMuted) {
      orbGradientClass = "from-neutral-800 via-neutral-900 to-neutral-950 shadow-[0_0_30px_rgba(255,255,255,0.05)]";
      // Idle state: Slow breathing/rotating flow
      animateProps = {
        scale: [1, 1.05, 1],
        rotate: [0, 90, 180, 270, 360],
        borderRadius: ["50%", "47% 53% 46% 54% / 46% 54% 47% 53%", "50%"]
      };
    } else if (voiceState === 'Listening') {
      orbGradientClass = "from-[#0266f2] via-[#0433ff] to-[#109dec] shadow-[0_0_60px_rgba(4,51,255,0.7)]";
      // Listening state: Pulse gently
      animateProps = {
        scale: [1, 1.08, 1],
        boxShadow: [
          "0 0 30px rgba(4,51,255,0.4)",
          "0 0 60px rgba(4,51,255,0.8)",
          "0 0 30px rgba(4,51,255,0.4)"
        ],
        borderRadius: ["50%", "49% 51% 52% 48% / 48% 52% 49% 51%", "50%"]
      };
    } else if (voiceState === 'Thinking') {
      orbGradientClass = "from-[#6200ff] via-[#b300ff] to-[#ff007f] shadow-[0_0_60px_rgba(179,0,255,0.7)]";
      // Thinking state: Liquid flow morph animation
      animateProps = {
        scale: [1, 1.04, 0.98, 1.03, 1],
        rotate: [0, 120, 240, 360],
        borderRadius: [
          "42% 58% 70% 30% / 45% 45% 55% 55%",
          "70% 30% 52% 48% / 60% 40% 60% 40%",
          "30% 70% 40% 60% / 40% 60% 40% 60%",
          "42% 58% 70% 30% / 45% 45% 55% 55%"
        ]
      };
    } else if (voiceState === 'Speaking') {
      orbGradientClass = "from-[#00bfff] via-[#0433ff] to-[#7b00ff] shadow-[0_0_70px_rgba(4,51,255,0.8)]";
      // Speaking state: Expand and contract reactively to actual mic audio volume
      animateProps = {
        scale: 1 + audioLevel * 0.7,
        borderRadius: [
          "48% 52% 50% 50% / 50% 50% 48% 52%",
          "52% 48% 48% 52% / 48% 52% 52% 48%",
          "48% 52% 50% 50% / 50% 50% 48% 52%"
        ],
        transition: {
          borderRadius: { repeat: Infinity, duration: 2.5, ease: "easeInOut" },
          scale: { type: "spring", stiffness: 350, damping: 15 }
        }
      };
    }

    return (
      <div className="relative flex items-center justify-center w-28 h-28 md:w-32 md:h-32 select-none pointer-events-auto">
        {/* Glowing atmospheric waves around the active orb */}
        {(voiceState === 'Speaking' || voiceState === 'Listening') && !isMuted && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl"
              animate={{
                scale: voiceState === 'Speaking' ? [1.1, 1.6 + audioLevel * 0.6, 1.1] : [1.1, 1.35, 1.1]
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className="absolute inset-0 rounded-full bg-purple-500/10 blur-2xl"
              animate={{
                scale: voiceState === 'Speaking' ? [1.2, 1.9 + audioLevel * 0.9, 1.2] : [1.2, 1.5, 1.2]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </>
        )}

        <motion.div
          onClick={handleToggleMute}
          className={cn(
            "w-24 h-24 md:w-28 md:h-28 bg-gradient-to-tr flex items-center justify-center cursor-pointer relative z-10 select-none shadow-2xl",
            orbGradientClass
          )}
          animate={animateProps}
          transition={
            voiceState === 'Speaking' 
              ? animateProps.transition 
              : {
                  repeat: Infinity,
                  duration: voiceState === 'Thinking' ? 6 : 4,
                  ease: "easeInOut"
                }
          }
        >
          {/* Metallic 3D light glow highlight */}
          <div className="absolute top-2.5 left-7 w-8 h-4 rounded-full bg-white/20 blur-[2px] transform -rotate-12 pointer-events-none" />
          
          {/* Sparkle micro-indicator to represent intelligence inside thinking/speaking orbs */}
          {voiceState === 'Thinking' && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles size={24} className="text-white/70" />
            </motion.div>
          )}

          {voiceState === 'Connection Lost' && (
            <AlertCircle size={28} className="text-red-300 animate-pulse" />
          )}
        </motion.div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        id="plack-live-immersive-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 w-screen h-screen min-h-screen z-[100] flex flex-col bg-[#050505] text-white overflow-hidden font-sans select-none"
      >
        {/* Subtle, beautiful atmospheric ambient background gradients */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[10%] left-[25%] -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] rounded-full bg-blue-900/10 blur-[130px]" />
          <div className="absolute bottom-[15%] right-[25%] translate-x-1/2 translate-y-1/2 w-[450px] h-[450px] rounded-full bg-indigo-900/10 blur-[130px]" />
          <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-950/5 blur-[160px]" />
        </div>

        {/* Top Header Row */}
        <header className="relative z-20 h-16 shrink-0 flex items-center justify-between px-6 border-b border-white/5 bg-black/10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button className="p-2 -ml-2 rounded-full hover:bg-white/5 active:scale-95 transition-all text-neutral-400 hover:text-white pointer-events-auto">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-sm font-semibold tracking-wider text-neutral-200">Plack Live</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Optional indicators */}
            {isCameraOn && (
              <span className="text-[10px] bg-blue-500/15 border border-blue-500/20 px-2 py-0.5 rounded-full text-blue-400 font-bold tracking-wider uppercase">
                Video On
              </span>
            )}
            <button className="p-2 rounded-full hover:bg-white/5 active:scale-95 transition-all text-neutral-400 hover:text-white pointer-events-auto">
              <MoreVertical size={20} />
            </button>
          </div>
        </header>

        {/* Display connection errors gracefully if any */}
        {permissionError && (
          <div className="relative z-30 mx-auto mt-4 flex items-center gap-2.5 px-4 py-2 rounded-full bg-red-950/40 border border-red-500/20 text-red-300 text-xs backdrop-blur-lg shadow-xl animate-bounce">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{permissionError}</span>
            <button 
              onClick={() => setPermissionError(null)} 
              className="ml-2 hover:text-white text-neutral-400"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Conversation Stream Block */}
        <main className="relative z-10 flex-1 overflow-y-auto px-6 md:px-24 py-6 md:py-10 flex flex-col justify-end select-text scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
          {allMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 px-6 max-w-sm mx-auto">
              <Radio size={32} className="text-indigo-500/50 mb-3 animate-pulse" />
              <p className="text-sm font-semibold text-neutral-300 tracking-wide">
                Voice Connection Active
              </p>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Start speaking anytime to talk with Plack AI.
              </p>
            </div>
          ) : (
            <div className="space-y-6 md:space-y-8 max-w-3xl w-full mx-auto pb-4">
              {allMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isLast = idx === allMessages.length - 1;
                return (
                  <motion.div
                    key={msg.id || `live-msg-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: isLast ? 1 : 0.45, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className={cn(
                      "flex flex-col space-y-1",
                      isUser ? "items-end text-right" : "items-start text-left"
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                      {isUser ? "You" : "Plack AI"}
                    </span>
                    <div
                      className={cn(
                        "max-w-[85%] text-lg md:text-xl font-medium leading-relaxed font-sans break-words whitespace-pre-wrap select-text",
                        isUser ? "text-neutral-200" : "text-white"
                      )}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Animated Camera / Screen Share Floating Mock Frames */}
        <AnimatePresence>
          {isCameraOn && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="absolute bottom-40 right-6 md:right-12 w-32 h-44 rounded-2xl bg-[#0d0d0d] border border-white/10 overflow-hidden shadow-2xl z-30 flex flex-col items-center justify-center select-none"
            >
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-neutral-300">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Self
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                <Video size={18} className="text-blue-400" />
              </div>
              <span className="text-[10px] font-semibold text-neutral-400 mt-2">Camera Active</span>
            </motion.div>
          )}

          {isScreenSharing && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="absolute bottom-40 left-6 md:left-12 w-44 h-28 rounded-2xl bg-[#0d0d0d] border border-white/10 overflow-hidden shadow-2xl z-30 flex flex-col items-center justify-center select-none"
            >
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-neutral-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                Presenter
              </div>
              <div className="w-10 h-10 rounded-full bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
                <MonitorUp size={18} className="text-cyan-400" />
              </div>
              <span className="text-[10px] font-semibold text-neutral-400 mt-2">Screen Share</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* State / Activity Indicator text with smooth transition */}
        <div className="relative z-20 shrink-0 h-8 flex items-center justify-center select-none my-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={isMuted ? "Paused" : voiceState}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "text-[12px] font-bold tracking-[0.15em] uppercase flex items-center gap-1.5",
                isMuted
                  ? "text-neutral-500"
                  : voiceState === 'Listening'
                    ? "text-blue-400"
                    : voiceState === 'Thinking'
                      ? "text-purple-400"
                      : voiceState === 'Speaking'
                        ? "text-indigo-400"
                        : "text-neutral-500"
              )}
            >
              {voiceState === 'Thinking' && !isMuted && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              )}
              {voiceState === 'Listening' && !isMuted && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              )}
              <span>
                {isMuted ? "Muted" : voiceState === 'Ready' ? "Ready" : voiceState}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Control Bar Row */}
        <footer className="relative z-20 shrink-0 flex flex-col items-center justify-center pb-8 md:pb-12 pt-4 px-6 bg-gradient-to-t from-black via-black/80 to-transparent">
          <div className="flex items-center justify-center gap-4 md:gap-8 w-full max-w-xl">
            
            {/* Camera Toggle Button */}
            <button
              onClick={() => setIsCameraOn(!isCameraOn)}
              className={cn(
                "flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-300 active:scale-90 border cursor-pointer pointer-events-auto shadow-lg",
                isCameraOn 
                  ? "bg-blue-600/25 border-blue-500/35 text-blue-400 hover:bg-blue-600/35"
                  : "bg-neutral-900 border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800"
              )}
              title={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
            >
              <Video size={20} />
            </button>

            {/* Screen Share Button */}
            <button
              onClick={() => setIsScreenSharing(!isScreenSharing)}
              className={cn(
                "flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-300 active:scale-90 border cursor-pointer pointer-events-auto shadow-lg",
                isScreenSharing 
                  ? "bg-cyan-600/25 border-cyan-500/35 text-cyan-400 hover:bg-cyan-600/35"
                  : "bg-neutral-900 border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800"
              )}
              title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
            >
              <MonitorUp size={20} />
            </button>

            {/* Center Orb (Visual Focus & Mic Mute Toggle) */}
            <div className="flex items-center justify-center">
              {renderCenterOrb()}
            </div>

            {/* Microphone Mute Button */}
            <button
              onClick={handleToggleMute}
              className={cn(
                "flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-300 active:scale-90 border cursor-pointer pointer-events-auto shadow-lg",
                isMuted 
                  ? "bg-red-600/25 border-red-500/35 text-red-400 hover:bg-red-600/35 animate-pulse"
                  : "bg-neutral-900 border-white/5 text-neutral-400 hover:text-white hover:bg-neutral-800"
              )}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* End Session Button */}
            <button
              id="end-session-btn"
              onClick={() => {
                cleanUpSession();
                onClose();
              }}
              className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-rose-600 border border-rose-500/20 text-white hover:bg-rose-700 active:scale-90 transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.3)] cursor-pointer pointer-events-auto"
              title="End Voice Session"
            >
              <PhoneOff size={20} fill="currentColor" />
            </button>

          </div>
        </footer>
      </motion.div>
    </AnimatePresence>
  );
}
