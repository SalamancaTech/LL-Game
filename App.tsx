
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { StatType, TimeSegment, Intent, GameState, Item, GameConfig, GameEngineResponse } from './types';
import { INITIAL_GAME_STATE, ITEM_DATABASE, INITIAL_STATS, GAME_START_TEXT, TUTORIAL_START_TEXT, TUTORIAL_PHASE_1_CHOICES } from './constants';
import { advanceTime, calculateStats, constructGeminiPrompt, constructChoicePrompt } from './utils/mechanics';

// --- Types & Interfaces ---

interface AppSettings {
  theme: string;
  font: string;
  fontSize: string;
  glow: boolean;
  apiKey: string;
  saveKeyLocally: boolean;
  devMode: boolean;
  layoutMode: boolean;
  voiceName: string;
  autoplayAudio: boolean;
  customImages: {
      player: string | null;
      npc: string | null;
      location: string | null;
  };
}

interface SaveSlot {
  id: number;
  name: string;
  date: string;
  data: GameState;
}

type PanelType = 'Stats' | 'Map' | 'Items' | 'NPCs' | 'Job' | 'Log' | null;

// --- Helper Functions ---

const getSlotFromType = (type: Item['type']): keyof GameState['equipped'] => {
    switch (type) {
        case 'Top': return 'top';
        case 'Bottom': return 'bottom';
        case 'Footwear': return 'footwear';
        case 'Accessory': return 'accessory';
        case 'Underwear_Top': return 'underwearTop';
        case 'Underwear_Bottom': return 'underwearBottom';
        case 'FullBody': return 'fullBody';
        default: return 'accessory';
    }
};

function base64ToBytes(base64: string) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function pcmToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Helper Components ---

const LayoutDebugOverlay: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 0, h: 0 });
    const [refDims, setRefDims] = useState({ w: 0, h: 0 });

    useEffect(() => {
        if (!ref.current || !ref.current.parentElement) return;
        
        const updateDims = () => {
            const parent = ref.current?.parentElement;
            if (parent) {
                const rect = parent.getBoundingClientRect();
                setDims({ w: Math.round(rect.width), h: Math.round(rect.height) });
                
                // Calculate relative to 1920x1080
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                setRefDims({
                    w: Math.round((rect.width / vw) * 1920),
                    h: Math.round((rect.height / vh) * 1080)
                });
            }
        };

        const resizeObserver = new ResizeObserver(updateDims);
        resizeObserver.observe(ref.current.parentElement);
        
        // Also listen to window resize for ref calc
        window.addEventListener('resize', updateDims);
        
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateDims);
        };
    }, []);

    return (
        <div ref={ref} className="absolute inset-0 z-[9999] pointer-events-none flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm border-2 border-yellow-400 border-dashed animate-in fade-in duration-300">
            <div className="bg-black px-2 py-1 rounded border border-yellow-500 shadow-lg text-center">
                <div className="text-gray-400 text-[9px] font-mono uppercase mb-0.5">Actual</div>
                <div className="text-white text-xs font-mono font-bold tracking-widest mb-1">
                    {dims.w} <span className="text-gray-500">x</span> {dims.h}
                </div>
                <div className="border-t border-gray-700 my-1"></div>
                <div className="text-cyan-400 text-[9px] font-mono uppercase mb-0.5">@ 1080p</div>
                <div className="text-cyan-300 text-xs font-mono font-bold tracking-widest">
                    {refDims.w} <span className="text-gray-500">x</span> {refDims.h}
                </div>
            </div>
        </div>
    );
};

const ImageUploadOverlay: React.FC<{ id: string; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }> = ({ id, onUpload }) => {
    return (
        <>
            <input type="file" id={id} className="hidden" accept="image/*" onChange={onUpload} />
            <label 
                htmlFor={id} 
                className="absolute top-2 right-2 z-30 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 border border-white/50 hover:border-white text-white flex items-center justify-center cursor-pointer transition-all opacity-0 group-hover:opacity-100"
                title="Upload Custom Image"
            >
                📷
            </label>
        </>
    );
};

const Toggle: React.FC<{ 
    label?: string; 
    options: [string, string]; 
    value: string; 
    onChange: (val: string) => void; 
    disabled?: boolean 
}> = ({ label, options, value, onChange, disabled }) => {
    return (
        <div className={`flex flex-col ${disabled ? 'opacity-50' : ''}`}>
            {label && <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">{label}</span>}
            <div className="flex bg-gray-900 rounded border border-gray-600 overflow-hidden">
                {options.map(opt => (
                    <button
                        key={opt}
                        onClick={() => !disabled && onChange(opt)}
                        disabled={disabled}
                        className={`px-3 py-1 text-xs font-bold transition-colors flex-1 ${value === opt ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
};

const StatBar: React.FC<{ 
  label: string; 
  value: number; 
  color: string; 
  icon?: string;
  editable?: boolean;
  onChange?: (val: number) => void;
}> = ({ label, value, color, icon, editable, onChange }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fillPercent = Math.max(0, Math.min(100, value));
  
  const handleDrag = (clientX: number) => {
      if (!editable || !onChange || !barRef.current) return;

      const rect = barRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      
      onChange(percent);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      if (!editable) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      setIsDragging(true);
      handleDrag(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (editable) {
          (e.target as Element).releasePointerCapture(e.pointerId);
          setIsDragging(false);
      }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (editable && isDragging) {
          handleDrag(e.clientX);
      }
  };

  return (
    <div className="flex items-center gap-2 h-6 w-full mb-1 select-none relative">
       <div 
         className="h-full aspect-square rounded border border-gray-400 flex items-center justify-center text-xs font-bold text-black shadow-inner cursor-help hover:scale-110 transition-transform"
         style={{ backgroundColor: color }}
         onPointerEnter={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
         onPointerMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
         onPointerLeave={() => setTooltipPos(null)}
       >
         {icon || label[0]}
       </div>
       
       <div 
          ref={barRef}
          className={`relative h-4 flex-grow bg-gray-700 rounded-full border border-gray-600 shadow-inner ${editable ? 'cursor-ew-resize touch-none' : 'cursor-default'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
       >
          <div 
            className="absolute top-0 left-0 h-full rounded-l-full border-r-0"
            style={{ 
              width: `${fillPercent}%`,
              backgroundColor: 'rgba(255,255,255,0.2)',
              transition: (editable && isDragging) ? 'none' : 'width 0.5s ease-out'
            }}
          >
             <div className={`absolute right-0 top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)] ${editable ? 'scale-y-125 z-10' : ''}`}></div>
          </div>
       </div>

       {tooltipPos && (
           <div 
             className="fixed z-[9999] px-2 py-1 rounded bg-gray-200 border border-black flex flex-col items-center justify-center shadow-xl pointer-events-none min-w-[60px]"
             style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
           >
               <span className="text-[9px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{label}</span>
               <span className="text-xs font-black text-black">{Math.round(value)}</span>
           </div>
       )}
    </div>
  );
};

const IntentMatrix: React.FC<{ onSelect: (intent: Intent) => void; disabled?: boolean }> = ({ onSelect, disabled }) => {
  const [selectedType, setSelectedType] = useState<Intent['type'] | null>(null);
  const [selectedManner, setSelectedManner] = useState<Intent['manner']>('Neutral');
  const sliderRef = useRef<HTMLDivElement>(null);

  const typesInOrder: Intent['type'][] = ['Request', 'Confess', 'Praise', 'Act', 'Challenge', 'Lie', 'Question'];
  const manners: Intent['manner'][] = ['Neutral', 'Serious', 'Aggressive', 'Hesitant', 'Humorous', 'Flirty', 'Teasing'];

  const handleSubmit = () => {
    if (selectedType && !disabled) {
      onSelect({ type: selectedType, manner: selectedManner });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (e.buttons !== 1 || disabled) return; 
      updateSlider(e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      updateSlider(e.clientY);
  };
  
  const handlePointerUp = (e: React.PointerEvent) => {
      (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const updateSlider = (clientY: number) => {
      if (!sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const percent = Math.max(0, Math.min(1, relativeY / rect.height));
      const index = Math.round(percent * (manners.length - 1));
      setSelectedManner(manners[index]);
  };

  return (
    <div className="flex h-full w-full bg-[#e5e7eb] rounded-lg border-2 border-black shadow-inner overflow-hidden">
        <div className="flex-grow flex items-center justify-between p-2 relative">
            <div className="relative h-full aspect-square flex-shrink-0 py-1">
               <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg transform transition-transform duration-500">
                 {typesInOrder.map((type, i) => {
                   const total = typesInOrder.length;
                   const anglePerSlice = 360 / total;
                   const startAngle = (i * anglePerSlice) - 90; 
                   const endAngle = ((i + 1) * anglePerSlice) - 90;
                   const r = 98;
                   const x1 = 100 + r * Math.cos(startAngle * Math.PI / 180);
                   const y1 = 100 + r * Math.sin(startAngle * Math.PI / 180);
                   const x2 = 100 + r * Math.cos(endAngle * Math.PI / 180);
                   const y2 = 100 + r * Math.sin(endAngle * Math.PI / 180);
                   const pathData = `M 100 100 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
                   const isSelected = selectedType === type;
                   const midAngle = startAngle + anglePerSlice / 2;
                   const tx = 100 + 65 * Math.cos(midAngle * Math.PI / 180);
                   const ty = 100 + 65 * Math.sin(midAngle * Math.PI / 180);
                   const rotation = midAngle + 90; 

                   return (
                     <g key={type} 
                        onClick={() => !disabled && setSelectedType(type)} 
                        className={`cursor-pointer transition-all hover:opacity-90 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                     >
                       <path 
                            d={pathData} 
                            fill={isSelected ? '#FFFF00' : '#C0C0C0'} 
                            stroke="#000000" 
                            strokeWidth="2" 
                            className="transition-colors duration-200"
                       />
                       <text 
                            x={tx} y={ty} 
                            textAnchor="middle" 
                            dominantBaseline="middle"
                            transform={`rotate(${rotation}, ${tx}, ${ty})`}
                            fontSize="11" 
                            fill="black" 
                            className="pointer-events-none select-none font-sans"
                       >
                           {type}
                       </text>
                     </g>
                   );
                 })}
                 <circle cx="100" cy="100" r="15" fill="white" stroke="black" strokeWidth="2" className="shadow-sm pointer-events-none" />
               </svg>
            </div>
            
            <div className="flex h-full gap-2 pr-1 flex-grow justify-center items-center select-none">
               <div 
                   className="relative h-[90%] w-8 flex justify-center cursor-ns-resize touch-none"
                   onPointerDown={handlePointerDown}
                   onPointerMove={handlePointerMove}
                   onPointerUp={handlePointerUp}
               >
                   <div ref={sliderRef} className="absolute top-0 bottom-0 w-3 left-1/2 transform -translate-x-1/2 bg-transparent border-2 border-black rounded-full shadow-[inset_0_0_5px_rgba(0,0,0,0.2)] pointer-events-none" />
                   <div 
                        className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-[#FF00FF] rounded-full border-2 border-white shadow-[0_0_5px_rgba(255,0,255,0.8)] transition-all duration-75 ease-out pointer-events-none"
                        style={{ 
                            top: `${(manners.indexOf(selectedManner) / (manners.length - 1)) * 100}%`,
                            marginTop: '-8px'
                        }}
                   />
               </div>
               <div className="flex flex-col justify-between h-[90%] py-0.5">
                   {manners.map((manner) => (
                       <div 
                         key={manner}
                         onClick={() => !disabled && setSelectedManner(manner)}
                         className={`text-[10px] cursor-pointer transition-all duration-200 text-right select-none ${selectedManner === manner ? 'text-[#FF00FF] font-bold scale-110' : 'text-gray-800 hover:text-black'}`}
                       >
                           {manner}
                       </div>
                   ))}
               </div>
            </div>
        </div>

        <div 
            onClick={handleSubmit}
            className={`w-8 h-full flex items-center justify-center border-l border-gray-400 transition-all cursor-pointer group ${
                selectedType && !disabled 
                ? 'bg-green-600 hover:bg-green-500 border-green-700' 
                : 'bg-gray-400 cursor-not-allowed border-gray-500'
            }`}
        >
            <span 
                className={`writing-vertical-rl transform font-black tracking-widest text-xs select-none ${selectedType && !disabled ? 'text-white group-hover:scale-110 transition-transform' : 'text-gray-200'}`}
                style={{ textOrientation: 'upright' }}
            >
                SUBMIT
            </span>
        </div>
    </div>
  );
};

const PlayerOptions: React.FC<{ 
    choices: string[]; 
    onSelect: (choiceIndex: number) => void; 
    loading?: boolean;
    onUndo: () => void;
    fontSizeStyle?: React.CSSProperties;
}> = ({ choices, onSelect, loading, onUndo, fontSizeStyle }) => {
  const hasChoices = choices.length > 0;
  return (
    <div className="h-full w-full flex flex-row-reverse bg-gray-800/80 rounded-lg overflow-hidden border border-gray-600 shadow-lg">
        {/* Undo Button on Right */}
        <div 
            onClick={onUndo}
            className="w-10 bg-amber-600 hover:bg-amber-500 h-full flex items-center justify-center border-l border-amber-700 transition-colors cursor-pointer active:bg-amber-700"
            title="Undo Last Action"
        >
            <span className="text-white font-black text-2xl select-none drop-shadow-md">
                ↺
            </span>
        </div>

        <div className="flex-grow flex flex-col gap-1 p-1 overflow-y-auto bg-purple-900/20">
            {loading ? (
                <div className="w-full h-full flex items-center justify-center text-pink-300 animate-pulse font-bold text-sm">
                    Generating Choices...
                </div>
            ) : (
                <>
                    {[0, 1, 2, 3].map((i) => (
                        <div 
                            key={i} 
                            onClick={() => choices[i] && onSelect(i)}
                            className={`h-1/5 min-h-[30px] w-full rounded border flex items-center px-2 py-1 transition-all select-none ${choices[i] ? 'bg-white/10 border-white/20 hover:bg-white/20 cursor-pointer text-gray-200 hover:text-white' : 'bg-black/20 border-transparent text-gray-600 cursor-default'}`}
                        >
                            <span 
                                className="font-bold leading-tight whitespace-normal line-clamp-3 text-left"
                                style={fontSizeStyle || { fontSize: '10px' }}
                            >
                                {choices[i] || (hasChoices ? "" : "Waiting for intent...")}
                            </span>
                        </div>
                    ))}
                    <div 
                        onClick={() => onSelect(4)}
                        className="h-1/5 min-h-[30px] w-full rounded border flex items-center px-2 cursor-pointer transition-all select-none bg-blue-500/20 border-blue-400/50 hover:bg-blue-500/40 text-blue-100"
                    >
                         <span className="text-xs font-bold truncate italic">Custom Input (Type below...)</span>
                    </div>
                </>
            )}
        </div>
    </div>
  );
};

const TimeWheel: React.FC<{ segment: TimeSegment; day: number }> = ({ segment, day }) => {
    let activeIndex = 0;
    switch(segment) {
        case TimeSegment.PRE_DAWN: activeIndex = 5; break; 
        case TimeSegment.DAWN: activeIndex = 0; break;
        case TimeSegment.MORNING: activeIndex = 1; break;
        case TimeSegment.DAY: activeIndex = 2; break; 
        case TimeSegment.EVENING: activeIndex = 3; break; 
        case TimeSegment.NIGHT: activeIndex = 4; break;
        case TimeSegment.POST_NIGHT: activeIndex = 5; break;
        default: activeIndex = 2;
    }

    const segments = [
        { label: 'Dawn', color1: '#4a1d96', color2: '#eab308' },
        { label: 'Morning', color1: '#3b82f6', color2: '#fde047' },
        { label: 'Day', color1: '#0ea5e9', color2: '#bae6fd' },
        { label: 'Evening', color1: '#f97316', color2: '#7e22ce' },
        { label: 'Night', color1: '#1e1b4b', color2: '#312e81' },
        { label: 'Deep Night', color1: '#0f172a', color2: '#020617' },
    ];

    return (
        <div className="w-full h-full flex items-center justify-center relative p-1">
             <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl max-h-[95%]">
                 <defs>
                     {segments.map((s, i) => (
                         <linearGradient key={i} id={`grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                             <stop offset="0%" style={{ stopColor: s.color1, stopOpacity: 1 }} />
                             <stop offset="100%" style={{ stopColor: s.color2, stopOpacity: 1 }} />
                         </linearGradient>
                     ))}
                     <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur"/>
                        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                     </filter>
                 </defs>
                 {segments.map((s, i) => {
                     const startAngle = (i * 60) - 30;
                     const r = 98;
                     const startRad = (startAngle * Math.PI) / 180;
                     const endRad = ((startAngle + 60) * Math.PI) / 180;
                     const x1 = 100 + r * Math.cos(startRad);
                     const y1 = 100 + r * Math.sin(startRad);
                     const x2 = 100 + r * Math.cos(endRad);
                     const y2 = 100 + r * Math.sin(endRad);
                     const d = `M 100 100 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
                     const isActive = i === activeIndex;
                     return (
                         <g key={i}>
                             <path 
                                d={d} 
                                fill={`url(#grad-${i})`} 
                                stroke="black" 
                                strokeWidth="4"
                                className={`transition-all duration-500 ${isActive ? 'brightness-125 saturate-150' : 'brightness-50 grayscale-[50%]'}`}
                             />
                         </g>
                     )
                 })}
                 <circle cx="100" cy="100" r="65" fill="none" stroke="black" strokeWidth="12" />
                 <circle cx="100" cy="100" r="60" fill="white" stroke="black" strokeWidth="2" />
                 <circle cx="100" cy="100" r="54" fill="none" stroke="black" strokeWidth="1" opacity="0.2" />
                 <g transform="translate(100, 100)">
                     <text y="-12" textAnchor="middle" fontSize="14" fontFamily="serif" fontWeight="bold" fill="black" opacity="0.6" letterSpacing="2">DAY</text>
                     <text y="28" textAnchor="middle" fontSize="48" fontFamily="serif" fontWeight="bold" fill="black">{day}</text>
                 </g>
                 <circle cx="100" cy="100" r="98" fill="none" stroke="black" strokeWidth="4" />
             </svg>
        </div>
    );
};

// --- Narrative Control Panel Component ---

const NarrativeControlPanel: React.FC<{ 
    text: string; 
    apiKey: string; 
    voiceName: string; 
    autoplay: boolean;
    onStatusChange: (isPlaying: boolean) => void; 
    showNextBtn: boolean;
    onNextChunk: () => void;
}> = ({ text, apiKey, voiceName, autoplay, onStatusChange, showNextBtn, onNextChunk }) => {
    const [paragraphs, setParagraphs] = useState<string[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'loading'>('idle');
    
    // Audio Context Refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const textRef = useRef("");

    useEffect(() => {
        const paras = text.split(/\n+/).filter(p => p.trim().length > 0);
        const prevParas = textRef.current.split(/\n+/).filter(p => p.trim().length > 0);
        
        // Check if the new text is an extension of the old text (starts with old text)
        const isExtension = text.startsWith(textRef.current) && text.length > textRef.current.length;

        if (isExtension) {
            // It's the same turn, just more text revealed
            textRef.current = text;
            setParagraphs(paras);
            
            // Only play the NEW paragraphs if autoplay is on
            if (autoplay) {
                const firstNewIndex = prevParas.length;
                if (firstNewIndex < paras.length) {
                    playParagraph(firstNewIndex, paras);
                }
            }
        } else if (text !== textRef.current) {
            // Completely new turn or unrelated text
            stopAudio();
            setParagraphs(paras);
            setCurrentIdx(0);
            setStatus('idle');
            textRef.current = text;
            
            if (autoplay && paras.length > 0) {
                playParagraph(0, paras);
            }
        }
    }, [text, autoplay]);

    useEffect(() => {
        return () => stopAudio();
    }, []);

    useEffect(() => {
        onStatusChange(status === 'playing' || status === 'loading');
    }, [status, onStatusChange]);

    const stopAudio = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        setStatus('idle');
    };

    const playParagraph = async (index: number, currentParas: string[] = paragraphs) => {
        if (!apiKey) return;
        if (index >= currentParas.length || index < 0) {
            setStatus('idle');
            return;
        }

        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
        }

        setStatus('loading');
        setCurrentIdx(index);

        try {
            if (!audioCtxRef.current) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
            }

            if (audioCtxRef.current.state === 'suspended') {
                await audioCtxRef.current.resume();
            }

            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: { parts: [{ text: currentParas[index] }] },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
                        },
                    },
                },
            });

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) throw new Error("No audio data");

            const bytes = base64ToBytes(base64Audio);
            const audioBuffer = await pcmToAudioBuffer(bytes, audioCtxRef.current, 24000, 1);

            const source = audioCtxRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtxRef.current.destination);
            
            source.onended = () => {
                if (sourceRef.current === source) {
                    if (index < currentParas.length - 1) {
                        playParagraph(index + 1, currentParas);
                    } else {
                        setStatus('idle');
                    }
                }
            };

            sourceRef.current = source;
            source.start();
            setStatus('playing');

        } catch (e) {
            console.error("TTS Error", e);
            setStatus('idle');
        }
    };

    const handlePlayPause = () => {
        if (status === 'playing') {
            if (audioCtxRef.current) {
                audioCtxRef.current.suspend();
                setStatus('paused');
            }
        } else if (status === 'paused') {
            if (audioCtxRef.current) {
                audioCtxRef.current.resume();
                setStatus('playing');
            }
        } else {
            playParagraph(currentIdx);
        }
    };

    return (
        <div className="w-8 flex-shrink-0 bg-gray-900/80 border-l border-gray-600 flex flex-col justify-between select-none overflow-hidden">
            {/* Audio Controls Group */}
            <div className="flex flex-col items-center pt-3 gap-4 w-full">
                <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] transition-all duration-300 mb-2
                    ${status === 'playing' ? 'bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse' : 
                      status === 'paused' ? 'bg-yellow-500 shadow-[0_0_10px_#eab308]' : 
                      status === 'loading' ? 'bg-blue-500 animate-spin rounded-sm' : 'bg-gray-600'}`}
                />
                <button onClick={handlePlayPause} className="text-gray-300 hover:text-white hover:scale-110 transition-all focus:outline-none" title={status === 'playing' ? 'Pause' : 'Play'}>
                    {status === 'playing' ? '⏸️' : '▶️'}
                </button>
                <button onClick={() => currentIdx > 0 && playParagraph(currentIdx - 1)} disabled={currentIdx === 0} className={`text-xl transition-all focus:outline-none ${currentIdx === 0 ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:scale-110'}`} title="Previous Paragraph">⏮️</button>
                <button onClick={() => currentIdx < paragraphs.length - 1 && playParagraph(currentIdx + 1)} disabled={currentIdx >= paragraphs.length - 1} className={`text-xl transition-all focus:outline-none ${currentIdx >= paragraphs.length - 1 ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:scale-110'}`} title="Next Paragraph">⏭️</button>
                <button onClick={() => playParagraph(currentIdx)} className="text-lg text-gray-400 hover:text-white hover:rotate-180 transition-all duration-500 focus:outline-none mt-2" title="Restart Paragraph">🔄</button>
            </div>
            
            {/* Next Chunk Button */}
             {showNextBtn && (
                <div 
                    onClick={onNextChunk}
                    className="w-full py-4 bg-green-700 hover:bg-green-600 flex items-center justify-center cursor-pointer active:bg-green-500 transition-colors animate-pulse border-t border-green-500 mt-auto"
                    title="Read Next"
                >
                    <span className="writing-vertical-rl transform rotate-180 text-xs font-black tracking-widest text-white select-none">
                        NEXT
                    </span>
                </div>
            )}
        </div>
    );
};

const CentralPanel: React.FC<{ 
    type: PanelType; 
    onClose: () => void; 
    gameState: GameState; 
    setGameState: React.Dispatch<React.SetStateAction<GameState>>;
    layoutMode: boolean;
    devMode: boolean;
    onGameAction: (text: string) => void;
}> = ({ type, onClose, gameState, setGameState, layoutMode, devMode, onGameAction }) => {
    const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
    const [selectedDevItem, setSelectedDevItem] = useState<Item | null>(null);
    const [selectedNpc, setSelectedNpc] = useState<string | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
    const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
    const [npcSort, setNpcSort] = useState<'AZ' | 'Location' | 'Gender' | 'Favorites'>('AZ');

    // Inventory Filter State
    const [invSearch, setInvSearch] = useState('');
    const [invFilter, setInvFilter] = useState('All');
    const [invSort, setInvSort] = useState('Name');

    const handleEquip = (index: number) => {
        const itemToEquip = gameState.inventory[index];
        if (!itemToEquip) return;
    
        const slotKey = getSlotFromType(itemToEquip.type);
    
        setGameState(prev => {
            const newInventory = [...prev.inventory];
            // Remove item to equip from inventory
            const [item] = newInventory.splice(index, 1);
            
            const newEquipped = { ...prev.equipped };

            // Handle FullBody clearing Top and Bottom
            if (item.type === 'FullBody') {
                if (newEquipped.top) {
                    newInventory.push(newEquipped.top);
                    newEquipped.top = null;
                }
                if (newEquipped.bottom) {
                    newInventory.push(newEquipped.bottom);
                    newEquipped.bottom = null;
                }
            }
            
            // Generic Swap Logic
            const currentlyEquipped = newEquipped[slotKey];
            if (currentlyEquipped) {
                newInventory.push(currentlyEquipped);
            }
            newEquipped[slotKey] = item;

            return {
                ...prev,
                inventory: newInventory,
                equipped: newEquipped
            };
        });
        setSelectedItemIdx(null);
    };

    const handleDevAdd = (item: Item) => {
        setGameState(prev => ({
            ...prev,
            inventory: [...prev.inventory, item]
        }));
        setSelectedDevItem(null);
    };

    const handleDevForceEquip = (item: Item) => {
        const slotKey = getSlotFromType(item.type);
        setGameState(prev => {
            const newInventory = [...prev.inventory];
            const newEquipped = { ...prev.equipped };
            
            // Handle FullBody clearing Top and Bottom
            if (item.type === 'FullBody') {
                if (newEquipped.top) { newInventory.push(newEquipped.top); newEquipped.top = null; }
                if (newEquipped.bottom) { newInventory.push(newEquipped.bottom); newEquipped.bottom = null; }
            }
            
            // Handle Top/Bottom clearing FullBody
            if (item.type === 'Top' || item.type === 'Bottom') {
                if (newEquipped.fullBody) {
                    newInventory.push(newEquipped.fullBody);
                    newEquipped.fullBody = null;
                }
            }
            
            const current = newEquipped[slotKey];
            if (current) newInventory.push(current);
            newEquipped[slotKey] = item;
            
            return { ...prev, inventory: newInventory, equipped: newEquipped };
        });
        setSelectedDevItem(null);
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData("inventoryIndex", index.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e: React.DragEvent, targetSlot: string) => {
        e.preventDefault();
        const indexStr = e.dataTransfer.getData("inventoryIndex");
        if (!indexStr) return;
        
        const index = parseInt(indexStr, 10);
        if (isNaN(index)) return;

        const item = gameState.inventory[index];
        if (!item) return;

        const calculatedSlot = getSlotFromType(item.type);
        
        // Only allow drop if slots match
        if (calculatedSlot === targetSlot) {
            handleEquip(index);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const toggleFavorite = (e: React.MouseEvent, npcName: string) => {
        e.stopPropagation();
        setGameState(prev => {
            const rel = prev.npcRelationships[npcName];
            if (!rel) return prev;
            
            return {
                ...prev,
                npcRelationships: {
                    ...prev.npcRelationships,
                    [npcName]: {
                        ...rel,
                        isFavorite: !rel.isFavorite
                    }
                }
            };
        });
    };

    // NPC Generation for Display
    let knownNpcs = Object.keys(gameState.npcRelationships);
    const unlockedNpcs = ['Mitch', 'Ashley'];

    if (npcSort === 'AZ') {
        knownNpcs.sort();
    } else if (npcSort === 'Favorites') {
        knownNpcs = knownNpcs.filter(name => gameState.npcRelationships[name]?.isFavorite);
    }
    
    // Fill remaining slots to reach 60 total, unless filtering by Favorites (show only faves)
    const npcDisplayList = [...knownNpcs];
    if (npcSort !== 'Favorites') {
        const totalSlots = 60;
        while(npcDisplayList.length < totalSlots) {
            npcDisplayList.push(`Unknown-${npcDisplayList.length}`);
        }
    }

    // Derived Inventory List for Filtering/Sorting
    const filteredInventory = useMemo(() => {
        // Map original index first so we can equip the correct item later
        let items = gameState.inventory.map((item, index) => ({ item, originalIndex: index }));

        // Filter by Type
        if (invFilter !== 'All') {
            items = items.filter(i => i.item.type === invFilter);
        }

        // Filter by Search (Name or Tags)
        if (invSearch.trim()) {
            const lowerSearch = invSearch.toLowerCase();
            items = items.filter(i => 
                i.item.name.toLowerCase().includes(lowerSearch) || 
                i.item.description.toLowerCase().includes(lowerSearch) ||
                i.item.tags.some(t => t.toLowerCase().includes(lowerSearch))
            );
        }

        // Sort
        items.sort((a, b) => {
            switch (invSort) {
                case 'Name': return a.item.name.localeCompare(b.item.name);
                case 'PriceAsc': return a.item.basePrice - b.item.basePrice;
                case 'PriceDesc': return b.item.basePrice - a.item.basePrice;
                case 'Type': return a.item.type.localeCompare(b.item.type);
                default: return 0;
            }
        });

        return items;
    }, [gameState.inventory, invFilter, invSearch, invSort]);


    // Region Data Structure (Updated for New Map)
    const REGIONS: Record<string, string[]> = {
        "Residents": [
            'home_lily_closet', 'home_lily_shower', 'home_lily_bedroom',
            'home_mitch_livingroom', 'home_mitch_kitchen', 'home_mitch_bedroom',
            'home_ashley_livingroom', 'home_ashley_streaming_nook', 'home_ashley_bedroom'
        ],
        "Apartments": ['apt_feely'],
        "Diner": ['hub_diner_counter', 'hub_diner_tables', 'hub_diner_booths', 'hub_diner_kitchen'],
        "General Store": ['general_store_main_floor', 'shop_general_store_back_room'],
        "Coffee": ['work_coffee_counter', 'work_coffee_tables', 'work_coffee_basement', 'work_coffee_manager_office', 'work_coffee_roof'],
        "Academics": ['school_campus_business', 'school_campus_business_office', 'school_campus_art', 'school_campus_art_office', 'school_campus_library', 'school_campus_library_stacks'],
        "Quad": ['school_campus_quad'],
        "Wrestling": ['wrestling_practice'],
        "Cheer": ['cheer_practice'],
        "Gym": ['school_gym_office', 'school_gym_locker_m', 'school_gym_locker_m_showers', 'school_gym_locker_f', 'school_gym_locker_f_showers', 'gym_weight_room', 'gym_classroom', 'gym_lockers', 'gym_showers'],
        "Pool": ['pool_deck', 'pool_jacuzzi'],
        "Boutique": ['shop_boutique_cashier', 'shop_boutique_fitting'],
        "Theater": ['movie_theater_lobby', 'movie_theater_counter', 'movie_theater_theater_1', 'movie_theater_theater_2', 'movie_theater_projection_room'],
        "Bar": ['bar_sf_counter', 'bar_sf_tables', 'bar_sf_restroom', 'bar_sf_back_office'],
        "Night Club": ['nightclub_entry', 'nightclub_dance_floor', 'nightclub_bar', 'nightclub_vip_lounge', 'nightclub_restroom'],
        "Laundromat": ['hub_laundromat_counter', 'hub_laundromat_machines', 'hub_laundromat_office'],
        "Pawn": ['shop_pawn_counter', 'shop_pawn_back_room'],
        "Factory": ['factory_security', 'factory_boiler_room', 'hazard_factory_locker_m', 'factory_service_tunnels'],
        "Lake": [],
        "Park & Trail": [],
    };

    const MAP_ZONES = [
        { id: 'Residents-Red', name: 'Residents', x: 0, y: 0, w: 8.33, h: 12.5 },
        { id: 'Residents-Green', name: 'Residents', x: 8.33, y: 0, w: 8.33, h: 12.5 },
        { id: 'Residents-Blue', name: 'Residents', x: 16.66, y: 0, w: 8.33, h: 12.5 },
        { id: 'Diner', name: 'Diner', x: 29.16, y: 0, w: 16.66, h: 12.5 },
        { id: 'Apartments', name: 'Apartments', x: 50, y: 0, w: 25, h: 12.5 },
        { id: 'Lake', name: 'Lake', x: 79.16, y: 0, w: 20.83, h: 31.25 },
        { id: 'GenStore', name: 'General Store', x: 0, y: 18.75, w: 25, h: 37.5 },
        { id: 'Coffee', name: 'Coffee', x: 33.33, y: 18.75, w: 12.5, h: 18.75 },
        { id: 'Academics', name: 'Academics', x: 50, y: 18.75, w: 25, h: 12.5 },
        { id: 'Quad', name: 'Quad', x: 50, y: 31.25, w: 10.4, h: 15.6 },
        { id: 'Wrestling', name: 'Wrestling', x: 60.4, y: 31.25, w: 14.6, h: 7.8 },
        { id: 'Cheer', name: 'Cheer', x: 60.4, y: 39.1, w: 14.6, h: 7.8 },
        { id: 'ParkTrail', name: 'Park & Trail', x: 79.16, y: 37.5, w: 20.83, h: 25 },
        { id: 'Gym', name: 'Gym', x: 0, y: 62.5, w: 16.66, h: 18.75 },
        { id: 'Pool', name: 'Pool', x: 0, y: 81.25, w: 16.66, h: 18.75 },
        { id: 'Boutique', name: 'Boutique', x: 20.83, y: 62.5, w: 16.66, h: 25 },
        { id: 'Theater', name: 'Theater', x: 37.5, y: 62.5, w: 20.83, h: 12.5 },
        { id: 'Bar', name: 'Bar', x: 62.5, y: 62.5, w: 12.5, h: 18.75 },
        { id: 'Pawn', name: 'Pawn', x: 20.83, y: 87.5, w: 16.66, h: 12.5 },
        { id: 'NightClub', name: 'Night Club', x: 41.66, y: 81.25, w: 16.66, h: 18.75 },
        { id: 'Laundromat', name: 'Laundromat', x: 62.5, y: 93.75, w: 12.5, h: 6.25 },
        { id: 'Factory', name: 'Factory', x: 79.16, y: 68.75, w: 20.83, h: 31.25 },
    ];

    const isPlayerInRegion = (region: string) => REGIONS[region]?.includes(gameState.location);

    return (
        <div className="col-span-7 row-span-8 col-start-4 row-start-5 bg-gray-900/95 rounded-lg border-2 border-gray-600 relative shadow-2xl p-4 overflow-hidden flex flex-col backdrop-blur-md z-20">
           {layoutMode && <LayoutDebugOverlay />}
           <div className="flex justify-between items-center border-b border-gray-600 pb-2 mb-4 shrink-0">
              <h2 className="text-2xl font-black text-white uppercase tracking-widest">{selectedNpc ? `NPC: ${selectedNpc}` : type}</h2>
              <button 
                onClick={onClose} 
                className="w-8 h-8 bg-red-600 hover:bg-red-500 rounded text-white font-bold flex items-center justify-center transition-colors"
              >
                  &times;
              </button>
           </div>
           <div className="flex-grow overflow-y-auto scrollbar-thin pr-2 min-h-0 relative">
                {/* Item Action Popup */}
                {selectedItemIdx !== null && type === 'Items' && (
                    <div className="absolute inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-gray-800 border-2 border-white rounded-lg p-4 w-64 shadow-2xl flex flex-col gap-2">
                             <h3 className="text-lg font-bold text-center mb-2 border-b border-gray-600 pb-1 text-white">
                                {gameState.inventory[selectedItemIdx]?.name}
                             </h3>
                             <button 
                                onClick={() => handleEquip(selectedItemIdx)} 
                                className="bg-green-700 hover:bg-green-600 text-white py-2 rounded font-bold uppercase text-sm transition-colors"
                             >
                                Equip
                             </button>
                             <button 
                                onClick={() => alert('Function not implemented')} 
                                className="bg-gray-600 hover:bg-gray-500 text-gray-300 py-2 rounded font-bold uppercase text-sm transition-colors"
                             >
                                Use
                             </button>
                             <button 
                                onClick={() => alert(`Description: ${gameState.inventory[selectedItemIdx]?.description}`)} 
                                className="bg-gray-600 hover:bg-gray-500 text-gray-300 py-2 rounded font-bold uppercase text-sm transition-colors"
                             >
                                Info
                             </button>
                             <button 
                                onClick={() => setSelectedItemIdx(null)} 
                                className="bg-red-700 hover:bg-red-600 text-white py-2 rounded font-bold uppercase text-sm transition-colors mt-2"
                             >
                                Cancel
                             </button>
                        </div>
                    </div>
                )}

                {/* Dev Item Action Popup */}
                {selectedDevItem !== null && type === 'Items' && (
                    <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-gray-900 border-2 border-red-500 rounded-lg p-4 w-64 shadow-2xl flex flex-col gap-2">
                             <h3 className="text-lg font-bold text-center mb-2 border-b border-gray-600 pb-1 text-red-400">
                                DEV: {selectedDevItem.name}
                             </h3>
                             <button 
                                onClick={() => handleDevForceEquip(selectedDevItem)} 
                                className="bg-red-700 hover:bg-red-600 text-white py-2 rounded font-bold uppercase text-sm transition-colors"
                             >
                                Force Equip
                             </button>
                             <button 
                                onClick={() => handleDevAdd(selectedDevItem)} 
                                className="bg-blue-700 hover:bg-blue-600 text-white py-2 rounded font-bold uppercase text-sm transition-colors"
                             >
                                Add to Inventory
                             </button>
                             <button 
                                onClick={() => setSelectedDevItem(null)} 
                                className="bg-gray-700 hover:bg-gray-600 text-white py-2 rounded font-bold uppercase text-sm transition-colors mt-2"
                             >
                                Cancel
                             </button>
                        </div>
                    </div>
                )}

                {type === 'Items' && (
                    <div className="space-y-4 flex flex-col h-full">
                        <div className="bg-gray-800 p-3 rounded border border-gray-700">
                            <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase">Equipped</h3>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.entries(gameState.equipped).map(([slot, item]) => (
                                    <div 
                                        key={slot} 
                                        className="bg-gray-900 p-2 rounded border border-gray-600 transition-colors hover:border-blue-500"
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, slot)}
                                    >
                                        <div className="text-[10px] text-gray-500 uppercase pointer-events-none">{slot}</div>
                                        <div className={`text-xs font-bold truncate pointer-events-none ${item ? 'text-white' : 'text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)] animate-pulse'}`}>{(item as Item)?.name ?? "Empty"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-bold text-gray-400 uppercase">Inventory</h3>
                                <div className="text-[10px] text-gray-500">{filteredInventory.length} Items</div>
                            </div>

                            {/* Inventory Controls (Search & Sort) */}
                            <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2 flex flex-col gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Search items..." 
                                    value={invSearch}
                                    onChange={(e) => setInvSearch(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none placeholder-gray-600"
                                />
                                <div className="flex gap-2">
                                    <select 
                                        value={invFilter}
                                        onChange={(e) => setInvFilter(e.target.value)}
                                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-blue-500 outline-none"
                                    >
                                        <option value="All">All Types</option>
                                        <option value="Top">Tops</option>
                                        <option value="Bottom">Bottoms</option>
                                        <option value="Footwear">Footwear</option>
                                        <option value="Accessory">Accessories</option>
                                        <option value="Underwear_Top">Bra / Top Undies</option>
                                        <option value="Underwear_Bottom">Panties / Bottom Undies</option>
                                        <option value="FullBody">Outfits</option>
                                    </select>
                                    <select 
                                        value={invSort}
                                        onChange={(e) => setInvSort(e.target.value)}
                                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-blue-500 outline-none"
                                    >
                                        <option value="Name">Name (A-Z)</option>
                                        <option value="Type">Type</option>
                                        <option value="PriceAsc">Price (Low-High)</option>
                                        <option value="PriceDesc">Price (High-Low)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {filteredInventory.map(({ item, originalIndex }) => (
                                    <div 
                                        key={`${item.id}-${originalIndex}`}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, originalIndex)}
                                        onClick={() => setSelectedItemIdx(originalIndex)}
                                        className="bg-gray-800 p-2 rounded border border-gray-600 hover:bg-gray-700 transition-colors cursor-pointer active:scale-95 cursor-grab active:cursor-grabbing"
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-sm truncate pr-1">{item.name}</span>
                                            <span className="text-[9px] bg-gray-900 px-1 rounded text-gray-400 shrink-0">{item.type}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-1 truncate">{item.description}</div>
                                        <div className="flex gap-1 mt-1 flex-wrap">
                                            {item.tags.slice(0, 3).map(t => <span key={t} className="text-[8px] bg-blue-900/40 text-blue-200 px-1 rounded">{t}</span>)}
                                        </div>
                                    </div>
                                ))}
                                {filteredInventory.length === 0 && <div className="col-span-2 text-center text-gray-500 text-xs italic p-4">No items found.</div>}
                            </div>
                        </div>

                        {/* Dev Mode Item Database Spawner */}
                        {devMode && (
                            <div className="bg-red-900/20 p-3 rounded border border-red-500/50 mt-4 animate-in fade-in">
                                <h3 className="text-sm font-bold text-red-400 mb-2 uppercase flex justify-between items-center">
                                    <span>Developer Item Database</span>
                                    <span className="text-[10px] text-red-300 opacity-70">Click to Spawn/Equip</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                     {ITEM_DATABASE.map((item, idx) => (
                                         <div 
                                            key={`dev-${idx}`} 
                                            onClick={() => setSelectedDevItem(item)}
                                            className="bg-gray-800 p-2 rounded border border-red-900/50 hover:bg-gray-700 transition-colors cursor-pointer relative opacity-80 hover:opacity-100 group"
                                         >
                                            <div className="absolute top-0 right-0 p-0.5 opacity-0 group-hover:opacity-100">
                                                <span className="text-[8px] bg-red-600 text-white px-1 rounded">DEV</span>
                                            </div>
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-sm text-red-200">{item.name}</span>
                                                <span className="text-[10px] bg-red-900 px-1 rounded text-white">{item.type}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1 truncate">{item.description}</div>
                                         </div>
                                     ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-auto pt-4 border-t border-gray-700">
                            <button 
                                onClick={() => {
                                    onClose();
                                    onGameAction("[SYSTEM: Player finished equipping items]");
                                }}
                                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded uppercase tracking-widest shadow-lg transition-all hover:scale-[1.02] active:scale-95"
                            >
                                Confirm & Next
                            </button>
                        </div>
                    </div>
                )}

                {type === 'NPCs' && (
                    <>
                        {selectedNpc ? (
                             <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
                                <div className="flex items-start gap-6">
                                    {/* Polaroid Large */}
                                    <div className="bg-white p-3 pb-8 shadow-xl rotate-[-2deg] w-48 shrink-0">
                                        <div className="bg-gray-200 w-full aspect-square mb-2 border border-gray-300 flex items-center justify-center overflow-hidden">
                                            <img src={`https://picsum.photos/seed/${selectedNpc}/400`} className="w-full h-full object-cover" alt={selectedNpc} />
                                        </div>
                                        <div className="text-black font-['Hachi_Maru_Pop'] font-bold text-center text-xl">{selectedNpc}</div>
                                    </div>

                                    {/* NPC Data */}
                                    <div className="flex-grow bg-gray-800 p-4 rounded border border-gray-600">
                                        <h3 className="text-xl font-bold mb-4 text-pink-400 border-b border-gray-600 pb-2">Relationship Status</h3>
                                        {gameState.npcRelationships[selectedNpc] ? (
                                            <div className="space-y-4">
                                                <StatBar label="Trust" value={gameState.npcRelationships[selectedNpc].trust} color="#4ade80" icon="🤝" />
                                                <StatBar label="Attraction" value={gameState.npcRelationships[selectedNpc].attraction} color="#f472b6" icon="❤️" />
                                                <StatBar label="Familiarity" value={gameState.npcRelationships[selectedNpc].familiarity} color="#60a5fa" icon="👥" />
                                            </div>
                                        ) : (
                                            <div className="text-gray-400 italic">No relationship data available.</div>
                                        )}
                                        <div className="mt-6 text-xs text-gray-400 leading-relaxed">
                                            <p>Notes and additional details about this character will appear here in future updates.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-auto flex justify-end pt-4">
                                    <button 
                                        onClick={() => setSelectedNpc(null)}
                                        className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded font-bold border border-gray-500 transition-colors"
                                    >
                                        Back to List
                                    </button>
                                </div>
                             </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                {/* Sort Headers */}
                                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 shrink-0">
                                    {['A-Z', 'Location', 'Gender', 'Favorites'].map(s => (
                                        <button 
                                            key={s} 
                                            onClick={() => setNpcSort(s as any)} 
                                            className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border transition-all ${npcSort === s ? 'bg-pink-600 border-pink-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                
                                {/* Polaroid Grid */}
                                <div className="grid grid-cols-3 gap-6 overflow-y-auto p-4 min-h-0">
                                    {npcDisplayList.map((name, idx) => {
                                        const isUnlocked = unlockedNpcs.includes(name);
                                        return (
                                            <div 
                                                key={idx}
                                                onClick={() => isUnlocked && setSelectedNpc(name)}
                                                className={`relative bg-white p-2 pb-6 shadow-lg transition-all duration-300 group
                                                    ${isUnlocked 
                                                        ? 'hover:scale-105 hover:rotate-2 hover:z-10 cursor-pointer opacity-100' 
                                                        : 'opacity-40 grayscale cursor-not-allowed'
                                                    }
                                                `}
                                            >
                                                <div className="bg-gray-200 w-full aspect-square mb-2 border border-gray-300 flex items-center justify-center overflow-hidden relative">
                                                    {isUnlocked ? (
                                                        <img src={`https://picsum.photos/seed/${name}/200`} className="w-full h-full object-cover" alt={name} />
                                                    ) : (
                                                        <span className="text-4xl text-gray-400 select-none">?</span>
                                                    )}
                                                    {/* Pin graphic */}
                                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 shadow-md border border-red-700 z-20 pointer-events-none"></div>
                                                    
                                                    {/* Favorite Star */}
                                                    {isUnlocked && (
                                                        <button 
                                                            onClick={(e) => toggleFavorite(e, name)}
                                                            className="absolute top-1 right-1 z-30 focus:outline-none hover:scale-110 transition-transform"
                                                            title={gameState.npcRelationships[name]?.isFavorite ? "Unfavorite" : "Favorite"}
                                                        >
                                                            <span className={`text-xl drop-shadow-md ${gameState.npcRelationships[name]?.isFavorite ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-200'}`}>
                                                                ★
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-black font-['Hachi_Maru_Pop'] font-bold text-center text-xs truncate px-1">
                                                    {isUnlocked ? name : "Locked"}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {type === 'Log' && (
                    <div className="space-y-3 font-mono text-xs">
                        {gameState.history.map((entry, i) => (
                            <div key={i} className={`p-2 rounded border-l-2 ${entry.role === 'user' ? 'bg-blue-900/20 border-blue-500' : 'bg-gray-800/40 border-purple-500'} ${entry.retracted ? 'opacity-60' : ''}`}>
                                <div className="font-bold opacity-50 mb-1 text-[10px] uppercase flex justify-between">
                                    <span>{entry.role === 'user' ? 'Player' : 'Lily Engine'}</span>
                                    {entry.retracted && <span className="text-red-500 font-bold tracking-wider text-[8px]">UNDO</span>}
                                </div>
                                <div className={`whitespace-pre-wrap leading-relaxed text-gray-300 ${entry.retracted ? 'line-through decoration-red-500/60' : ''}`}>{entry.text}</div>
                            </div>
                        ))}
                    </div>
                )}

                {type === 'Map' && (
                    <>
                        {selectedLocation ? (
                             <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
                                <div className="flex items-start gap-6">
                                    {/* Polaroid Large */}
                                    <div className="bg-white p-3 pb-8 shadow-xl rotate-[-2deg] w-48 shrink-0">
                                        <div className="bg-gray-200 w-full aspect-square mb-2 border border-gray-300 flex items-center justify-center overflow-hidden">
                                            <img src={`https://picsum.photos/seed/${selectedLocation}/400`} className="w-full h-full object-cover" alt={selectedLocation} />
                                        </div>
                                        <div className="text-black font-['Hachi_Maru_Pop'] font-bold text-center text-xs break-words">{selectedLocation}</div>
                                    </div>

                                    {/* Location Data */}
                                    <div className="flex-grow bg-gray-800 p-4 rounded border border-gray-600">
                                        <h3 className="text-xl font-bold mb-4 text-blue-400 border-b border-gray-600 pb-2">Location Profile</h3>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-700">
                                                <span className="text-gray-400 font-bold text-xs uppercase">Current Status</span>
                                                <span className={`text-sm font-bold ${gameState.location === selectedLocation ? 'text-green-400' : 'text-gray-500'}`}>
                                                    {gameState.location === selectedLocation ? "YOU ARE HERE" : "Accessible"}
                                                </span>
                                            </div>
                                            
                                            <div className="bg-gray-900 p-3 rounded border border-gray-700 min-h-[100px]">
                                                <h4 className="text-gray-400 font-bold text-xs uppercase mb-2">Description</h4>
                                                <p className="text-xs text-gray-500 italic">
                                                    Detailed cartographic data and environmental descriptions for {selectedLocation.replace(/_/g, ' ')} are currently unavailable in the demo database.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-auto flex justify-end pt-4">
                                    <button 
                                        onClick={() => setSelectedLocation(null)}
                                        className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded font-bold border border-gray-500 transition-colors"
                                    >
                                        Back
                                    </button>
                                </div>
                             </div>
                        ) : selectedRegion ? (
                             <div className="flex flex-col h-full animate-in fade-in slide-in-from-right duration-300">
                                 <div className="flex items-center justify-between mb-4 bg-gray-800/50 p-2 rounded border border-gray-700">
                                     <button 
                                        onClick={() => setSelectedRegion(null)}
                                        className="text-xs font-bold uppercase text-blue-400 hover:text-white flex items-center gap-1 transition-colors"
                                     >
                                         ◀ Back to Regions
                                     </button>
                                     <h3 className="text-lg font-black text-white uppercase tracking-widest">{selectedRegion}</h3>
                                     <div className="w-16"></div> {/* Spacer */}
                                 </div>

                                 <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 p-2 overflow-y-auto">
                                    {REGIONS[selectedRegion].map((loc, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => setSelectedLocation(loc)}
                                            className={`aspect-square p-2 rounded border-2 flex flex-col items-center justify-center gap-2 transition-all shadow-lg cursor-pointer group relative overflow-hidden
                                                ${gameState.location === loc 
                                                    ? 'bg-blue-900/40 border-blue-400 ring-2 ring-blue-500/50' 
                                                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:border-gray-400'}
                                            `}
                                        >
                                            {/* Background Image Blur */}
                                            <img 
                                                src={`https://picsum.photos/seed/${loc}/200`} 
                                                className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-40 transition-opacity" 
                                                alt=""
                                            />
                                            
                                            <div className="z-10 text-2xl drop-shadow-md">📍</div>
                                            <span className="z-10 text-[10px] font-bold uppercase text-center break-words leading-tight drop-shadow-md px-1">
                                                {loc.replace(/_/g, ' ')}
                                            </span>
                                            {gameState.location === loc && (
                                                <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_5px_#22c55e] animate-pulse z-20"></div>
                                            )}
                                        </div>
                                    ))}
                                 </div>
                             </div>
                        ) : (
                             <div className="flex items-center justify-center w-full h-full p-2">
                                <div className="relative w-full aspect-[3/2] bg-black shadow-2xl rounded-lg overflow-hidden border-2 border-gray-600">
                                    <img
                                        src="https://raw.githubusercontent.com/SalamancaTech/LL-Game/main/assets/Map/Map%20Locations/new-map-buttons.png"
                                        className="w-full h-full object-cover"
                                        alt="Map"
                                    />
                                    {MAP_ZONES.map((zone) => {
                                        const isActiveRegion = isPlayerInRegion(zone.name);
                                        return (
                                            <button
                                                key={zone.id}
                                                onClick={() => setSelectedRegion(zone.name)}
                                                className={`absolute transition-all duration-200 group hover:bg-white/10 ${isActiveRegion ? 'bg-green-500/20 border-2 border-green-500 animate-pulse' : ''}`}
                                                style={{
                                                    top: `${zone.y}%`,
                                                    left: `${zone.x}%`,
                                                    width: `${zone.w}%`,
                                                    height: `${zone.h}%`
                                                }}
                                                title={zone.name}
                                            >
                                                {/* Hover Label */}
                                                <div className="opacity-0 group-hover:opacity-100 absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full bg-black/80 text-white text-[10px] px-1 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none transition-opacity">
                                                    {zone.name}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                             </div>
                        )}
                    </>
                )}

                {type === 'Job' && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 rounded border border-dashed border-gray-600 text-gray-500">
                        <span className="text-4xl mb-2">💼</span>
                        <span>No Active Job</span>
                    </div>
                )}

                {type === 'Stats' && (
                    <div className="grid grid-cols-2 gap-4">
                         <div className="bg-gray-800 p-3 rounded border border-gray-600">
                            <h3 className="text-yellow-400 font-bold mb-2 border-b border-gray-600 pb-1">Core Attributes</h3>
                            <p className="text-xs text-gray-400 mb-2">These define your innate capabilities and mental resilience.</p>
                            <StatBar label="Confidence" value={gameState.stats[StatType.CONFIDENCE] * 5} color="#FFA500" icon="✨" />
                            <StatBar label="Willpower" value={gameState.stats[StatType.WILL] * 5} color="#7030A0" icon="🟣" />
                            <StatBar label="Grace" value={gameState.stats[StatType.GRACE] * 5} color="#FF1493" icon="🌸" />
                            <StatBar label="Wit" value={gameState.stats[StatType.WIT] * 5} color="#3b82f6" icon="💡" />
                         </div>
                         <div className="bg-gray-800 p-3 rounded border border-gray-600">
                            <h3 className="text-red-400 font-bold mb-2 border-b border-gray-600 pb-1">Status & Danger</h3>
                            <p className="text-xs text-gray-400 mb-2">Current situational awareness and social standing.</p>
                            <StatBar label="Danger" value={gameState.stats[StatType.DANGER]} color="#ef4444" icon="⚠️" />
                            <StatBar label="Vulnerability" value={gameState.stats[StatType.VULNERABILITY]} color="#f87171" icon="🛡️" />
                            <StatBar label="Social" value={gameState.stats[StatType.SOCIAL_CLASS] + 50} color="#10b981" icon="💲" />
                         </div>
                         <div className="bg-gray-800 p-3 rounded border border-gray-600 col-span-2">
                            <h3 className="text-blue-400 font-bold mb-2 border-b border-gray-600 pb-1">Environmental Factors</h3>
                             <div className="grid grid-cols-2 gap-4">
                                <StatBar label="Male Gaze" value={gameState.stats[StatType.MALE_GAZE]} color="#60a5fa" icon="👀" />
                                <StatBar label="Female Judgement" value={gameState.stats[StatType.FEMALE_JUDGE]} color="#c084fc" icon="😒" />
                             </div>
                         </div>
                    </div>
                )}
           </div>
        </div>
    );
};

// --- Menu Modules ---

const SettingsModule: React.FC<{ 
    settings: AppSettings; 
    onUpdate: (s: Partial<AppSettings>) => void;
    onNewGame?: (config: GameConfig) => void; 
}> = ({ settings, onUpdate, onNewGame }) => {
  const [tempKey, setTempKey] = useState(settings.apiKey || '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [localVoice, setLocalVoice] = useState(settings.voiceName || 'Kore');
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  const VOICE_NAMES = [
      'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 
      'Erinome', 'Kore', 'Laomedeia', 'Leda', 'Puck', 'Pulcherrima', 
      'Schedar', 'Sulafat', 'Vindemiatrix', 'Zephyr'
  ];

  // Init status based on existing key
  useEffect(() => {
      setTempKey(settings.apiKey || '');
      if (settings.apiKey && settings.apiKey.length > 0) {
          setStatus('valid');
      } else {
          setStatus('idle');
      }
  }, [settings.apiKey]);

  const validateAndSubmit = async () => {
      if (!tempKey.trim()) return;
      setStatus('testing');

      try {
          const ai = new GoogleGenAI({ apiKey: tempKey });
          // Minimal token count request or generation to validate key
          await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: { parts: [{ text: "Ping" }] }
          });
          
          setStatus('valid');
          onUpdate({ apiKey: tempKey });

          // Auto-start game if valid key entered and callback provided, assuming default config
          // This is a "Fast Start" logic.
          if (onNewGame) {
             // We can trigger a new game here if it's the first run, but better to let user click the button below.
          }

      } catch (error) {
          console.error("API Validation Failed", error);
          setStatus('invalid');
      }
  };

  const handleClear = () => {
      setTempKey('');
      setStatus('idle');
      onUpdate({ apiKey: '' });
  };

  const handleTestVoice = async () => {
      const apiKeyToUse = settings.apiKey || process.env.API_KEY;
      if (!apiKeyToUse) {
          alert("Please set a valid API Key first.");
          return;
      }
      setIsTestingVoice(true);
      try {
        const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text: `Hello, I am ${localVoice}.` }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: localVoice },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass({ sampleRate: 24000 });
            
            const bytes = base64ToBytes(base64Audio);
            const audioBuffer = await pcmToAudioBuffer(bytes, audioContext, 24000, 1);
            
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = () => setIsTestingVoice(false);
            source.start();
        } else {
            setIsTestingVoice(false);
        }
      } catch (error) {
          console.error("Voice Test Error", error);
          setIsTestingVoice(false);
      }
  };

  const handleConfirmVoice = () => {
      onUpdate({ voiceName: localVoice });
  };

  return (
    <div className="p-4 text-white w-full h-full overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4 border-b border-gray-500 pb-2">Settings</h2>
      
      <div className="mb-6">
         <h3 className="text-lg font-semibold mb-2 text-blue-400">API Configuration</h3>
         <label className="block text-xs mb-1">Gemini API Key</label>
         
         <div className="flex gap-2 mb-2 items-center">
           <input 
             type="password" 
             value={tempKey}
             onChange={(e) => { setTempKey(e.target.value); setStatus('idle'); }}
             placeholder="API Key..."
             className={`w-40 bg-gray-700 border rounded p-1 text-sm outline-none focus:ring-1 ${status === 'invalid' ? 'border-red-500 focus:ring-red-500' : 'border-gray-600 focus:ring-blue-500'}`}
           />
           <button 
             onClick={validateAndSubmit}
             disabled={status === 'testing' || !tempKey}
             className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-xs font-bold transition-colors"
           >
               {status === 'testing' ? 'Checking...' : 'Submit'}
           </button>
           <button 
             onClick={handleClear}
             className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs font-bold transition-colors"
           >
               Clear
           </button>
           
           {/* Status Icons */}
           <div className="w-6 flex justify-center">
               {status === 'testing' && <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>}
               {status === 'valid' && <span className="text-green-400 font-bold text-lg">✓</span>}
               {status === 'invalid' && <span className="text-red-500 font-bold text-lg">✗</span>}
               {status === 'idle' && <div className="w-2 h-2 rounded-full bg-gray-600"></div>}
           </div>
         </div>

         {/* New Start Button appearing only when valid */}
         {status === 'valid' && onNewGame && (
             <div className="mt-2 mb-2">
                 <button 
                    onClick={() => onNewGame({
                        nsfw: false, // Default settings for quick start
                        intensity: 'Light',
                        tutorial: true,
                        firstTimeEvents: true
                    })}
                    className="w-full py-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white font-bold rounded uppercase tracking-widest shadow-lg animate-pulse"
                 >
                     START ADVENTURE NOW
                 </button>
             </div>
         )}

         <div className="flex items-center gap-2 mb-4">
             <input 
                type="checkbox" 
                id="saveKeyToggle"
                checked={settings.saveKeyLocally}
                onChange={(e) => onUpdate({ saveKeyLocally: e.target.checked })}
                className="w-4 h-4"
             />
             <label htmlFor="saveKeyToggle" className="text-xs text-gray-300 select-none cursor-pointer">Save key locally (Uncheck for session only)</label>
         </div>
         
         {/* Dev Mode Toggle */}
         <div className="flex items-center gap-8 pt-2 border-t border-gray-700">
             <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="devModeToggle"
                    checked={settings.devMode}
                    onChange={(e) => onUpdate({ 
                        devMode: e.target.checked,
                        // Turn off layout mode if dev mode is disabled
                        layoutMode: e.target.checked ? settings.layoutMode : false 
                    })}
                    className="w-4 h-4"
                />
                <label htmlFor="devModeToggle" className="text-sm font-bold text-yellow-400 select-none cursor-pointer">Enable Developer Mode</label>
             </div>

             <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="layoutModeToggle"
                    checked={settings.layoutMode}
                    disabled={!settings.devMode}
                    onChange={(e) => onUpdate({ layoutMode: e.target.checked })}
                    className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label htmlFor="layoutModeToggle" className={`text-sm font-bold select-none cursor-pointer ${!settings.devMode ? 'text-gray-500 cursor-not-allowed' : 'text-yellow-200'}`}>Layout Mode</label>
             </div>
         </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2 text-pink-400">Theme</h3>
        <div className="grid grid-cols-3 gap-4">
           <div>
             <label className="block text-xs mb-1">Style</label>
             <select 
                value={settings.theme} 
                onChange={(e) => onUpdate({ theme: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded p-1 text-sm"
             >
               <option value="Default">Default (Gradient)</option>
               <option value="Pink">Pink</option>
               <option value="Blue">Blue</option>
               <option value="Black">Black</option>
               <option value="White">White</option>
               <option value="RGB">RGB (Retro)</option>
             </select>
           </div>
           <div>
             <label className="block text-xs mb-1">Font</label>
             <select 
                value={settings.font} 
                onChange={(e) => onUpdate({ font: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded p-1 text-sm"
             >
               <option value="'Lexend Deca', sans-serif">Lexend Deca</option>
               <option value="'Hachi Maru Pop', cursive">Hachi Maru Pop</option>
               <option value="Georgia, serif">Georgia</option>
               <option value="'Courier New', monospace">Courier New</option>
             </select>
           </div>
           <div>
             <label className="block text-xs mb-1">Size</label>
             <select 
                value={(settings.fontSize === '12pt' || !settings.fontSize) ? 'Small' : settings.fontSize} 
                onChange={(e) => onUpdate({ fontSize: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded p-1 text-sm"
             >
               <option value="Small">Small (Default)</option>
               <option value="Medium">Medium (+3pt)</option>
               <option value="Large">Large (+6pt)</option>
             </select>
           </div>
        </div>
      </div>

      <div className="mb-6">
         <h3 className="text-lg font-semibold mb-2 text-green-400">Audio Settings</h3>
         <label className="block text-xs mb-1">Narrator Voice</label>
         <div className="flex gap-2 items-center">
             <select 
                value={localVoice} 
                onChange={(e) => setLocalVoice(e.target.value)}
                className="flex-grow bg-gray-700 border border-gray-600 rounded p-1 text-sm"
             >
                 {VOICE_NAMES.map(v => <option key={v} value={v}>{v}</option>)}
             </select>
             <button 
                onClick={handleTestVoice}
                disabled={isTestingVoice || !settings.apiKey}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1 ${isTestingVoice ? 'bg-gray-600 text-gray-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                title="Test Voice"
             >
                 {isTestingVoice ? '...' : '🔊'}
             </button>
             <button 
                onClick={handleConfirmVoice}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-bold transition-colors text-white"
                title="Save Voice Setting"
             >
                 💾
             </button>
             
             {/* Autoplay Toggle */}
             <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-600">
                 <div 
                    onClick={() => onUpdate({ autoplayAudio: !settings.autoplayAudio })}
                    className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${settings.autoplayAudio ? 'bg-green-500' : 'bg-gray-600'}`}
                 >
                     <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${settings.autoplayAudio ? 'left-4.5' : 'left-0.5'}`} style={{ left: settings.autoplayAudio ? 'calc(100% - 14px)' : '2px' }}></div>
                 </div>
                 <span className="text-[10px] text-gray-400 font-bold uppercase select-none">Autoplay</span>
             </div>
         </div>
         {settings.voiceName !== localVoice && <p className="text-[10px] text-yellow-400 mt-1">Unsaved changes. Click save to apply.</p>}
      </div>

    </div>
  );
};

const SaveLoadModule: React.FC<{ 
  currentState: GameState; 
  onLoad: (state: GameState) => void; 
  settings: AppSettings;
  onSettingsUpdate: (updates: Partial<AppSettings>) => void;
  onNewGame: (config: GameConfig) => void;
}> = ({ currentState, onLoad, settings, onSettingsUpdate, onNewGame }) => {
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  // New Game State
  const [sfw, setSfw] = useState(true);
  const [intensity, setIntensity] = useState<'Light' | 'Full'>('Light');
  const [tutorial, setTutorial] = useState(true);
  const [fte, setFte] = useState(true);
  const [showKeyPopup, setShowKeyPopup] = useState(false);

  // API Popup State (Duplicated simple logic for standalone modal)
  const [popupKey, setPopupKey] = useState('');
  const [popupStatus, setPopupStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [popupSaveLocal, setPopupSaveLocal] = useState(false);


  useEffect(() => {
    const saved = localStorage.getItem('lily_save_slots');
    if (saved) setSlots(JSON.parse(saved));
    
    // Initialize popup state from current settings
    if (settings.apiKey) {
        setPopupKey(settings.apiKey);
        setPopupStatus('valid');
    }
    setPopupSaveLocal(settings.saveKeyLocally);
  }, [settings]);

  const saveGame = (id: number) => {
    const newSlot: SaveSlot = {
      id,
      name: `Save Slot ${id}`,
      date: new Date().toLocaleString(),
      data: currentState
    };
    
    const newSlots = [...slots.filter(s => s.id !== id), newSlot].sort((a, b) => a.id - b.id);
    setSlots(newSlots);
    localStorage.setItem('lily_save_slots', JSON.stringify(newSlots));
  };

  const deleteSave = (id: number) => {
    if(!confirm("Delete this save?")) return;
    const newSlots = slots.filter(s => s.id !== id);
    setSlots(newSlots);
    localStorage.setItem('lily_save_slots', JSON.stringify(newSlots));
  };

  const handleBeginNewGame = () => {
      if (settings.apiKey && settings.apiKey.length > 0) {
          onNewGame({
              nsfw: !sfw,
              intensity: intensity,
              tutorial: tutorial,
              firstTimeEvents: fte
          });
      } else {
          setShowKeyPopup(true);
      }
  };

  const validateAndSubmitPopup = async () => {
      if (!popupKey.trim()) return;
      setPopupStatus('testing');
      try {
          const ai = new GoogleGenAI({ apiKey: popupKey });
          await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: { parts: [{ text: "Ping" }] }
          });
          setPopupStatus('valid');
          onSettingsUpdate({ apiKey: popupKey, saveKeyLocally: popupSaveLocal });
          setShowKeyPopup(false);
          // Auto start after valid key
          onNewGame({
              nsfw: !sfw,
              intensity: intensity,
              tutorial: tutorial,
              firstTimeEvents: fte
          });
      } catch (error) {
          setPopupStatus('invalid');
      }
  };

  return (
    <div className="p-4 text-white w-full h-full overflow-y-auto relative">
      <h2 className="text-2xl font-bold mb-4 border-b border-gray-500 pb-2">Save / Load</h2>
      <div className="flex flex-col gap-2 mb-8">
        {[1, 2, 3, 4, 5].map(id => {
          const slot = slots.find(s => s.id === id);
          return (
            <div key={id} className="bg-gray-800 p-3 rounded border border-gray-600 flex justify-between items-center">
              <div>
                <div className="font-bold text-sm">{slot ? slot.name : `Empty Slot ${id}`}</div>
                <div className="text-xs text-gray-400">{slot ? slot.date : '--'}</div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => saveGame(id)}
                  className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-bold"
                >
                  SAVE
                </button>
                <button 
                  onClick={() => slot && onLoad(slot.data)}
                  disabled={!slot}
                  className={`px-3 py-1 rounded text-xs font-bold ${slot ? 'bg-blue-700 hover:bg-blue-600' : 'bg-gray-600 cursor-not-allowed'}`}
                >
                  LOAD
                </button>
                {slot && (
                  <button 
                    onClick={() => deleteSave(id)}
                    className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-xs"
                  >
                    X
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* New Game Section */}
      <div className="border-t-2 border-gray-600 pt-4">
          <h3 className="text-xl font-black text-center mb-4 text-pink-400 uppercase tracking-wider drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">Start New Game</h3>
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600 space-y-4">
              
              <div className="flex gap-4">
                  <div className="flex-1">
                      <Toggle 
                        label="Mode" 
                        options={['SFW', 'NSFW']} 
                        value={sfw ? 'SFW' : 'NSFW'} 
                        onChange={(v) => setSfw(v === 'SFW')} 
                      />
                  </div>
                  <div className="flex-1">
                      <Toggle 
                        label="Intensity" 
                        options={['Light', 'Full']} 
                        value={intensity} 
                        disabled={sfw}
                        onChange={(v) => setIntensity(v as any)} 
                      />
                  </div>
              </div>

              <div className="flex gap-4">
                  <div className="flex-1">
                      <Toggle 
                        label="Tutorial" 
                        options={['ON', 'OFF']} 
                        value={tutorial ? 'ON' : 'OFF'} 
                        onChange={(v) => setTutorial(v === 'ON')} 
                      />
                  </div>
                  <div className="flex-1">
                      <Toggle 
                        label="First Time Events" 
                        options={['ON', 'OFF']} 
                        value={fte ? 'ON' : 'OFF'} 
                        onChange={(v) => setFte(v === 'ON')} 
                      />
                  </div>
              </div>

              <div className="pt-2 flex justify-center">
                  <button 
                    onClick={handleBeginNewGame}
                    className="w-full py-3 px-6 bg-gradient-to-b from-pink-500 to-pink-700 rounded-full border-2 border-pink-400 shadow-[0_4px_0_rgb(131,24,67)] active:shadow-none active:translate-y-1 transition-all text-white font-black text-lg uppercase tracking-widest hover:brightness-110"
                  >
                      Begin New Game
                  </button>
              </div>

          </div>
      </div>

      {/* API Key Popup Modal */}
      {showKeyPopup && (
          <div className="absolute inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-gray-800 border-2 border-blue-500 rounded-lg p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4">
                  <h3 className="text-xl font-bold text-white border-b border-gray-600 pb-2">API Key Required</h3>
                  <p className="text-xs text-gray-300">You must provide a Google Gemini API Key to start the narrative engine.</p>
                  
                  <input 
                    type="password" 
                    value={popupKey}
                    onChange={(e) => { setPopupKey(e.target.value); setPopupStatus('idle'); }}
                    placeholder="Paste API Key here..."
                    className={`w-full bg-gray-700 border rounded p-2 text-sm outline-none focus:ring-2 ${popupStatus === 'invalid' ? 'border-red-500 focus:ring-red-500' : 'border-gray-600 focus:ring-blue-500'}`}
                  />

                  <div className="flex items-center gap-2">
                     <input 
                        type="checkbox" 
                        id="popupSaveKey"
                        checked={popupSaveLocal}
                        onChange={(e) => setPopupSaveLocal(e.target.checked)}
                        className="w-4 h-4"
                     />
                     <label htmlFor="popupSaveKey" className="text-xs text-gray-300 select-none cursor-pointer">Save key locally</label>
                  </div>

                  {popupStatus === 'invalid' && <div className="text-red-400 text-xs font-bold">Invalid Key or Connection Error</div>}
                  
                  <div className="flex gap-2 mt-2">
                      <button 
                        onClick={validateAndSubmitPopup}
                        disabled={popupStatus === 'testing' || !popupKey}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-2 rounded font-bold uppercase text-sm transition-colors"
                      >
                          {popupStatus === 'testing' ? 'Verifying...' : 'Submit & Start'}
                      </button>
                      <button 
                        onClick={() => setShowKeyPopup(false)}
                        className="px-4 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded font-bold uppercase text-sm transition-colors"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};


export default function App() {
  // --- Game State ---
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [stateHistory, setStateHistory] = useState<GameState[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Choice State ---
  const [generatedChoices, setGeneratedChoices] = useState<string[]>([]);
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null);
  const [isGeneratingChoices, setIsGeneratingChoices] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- Pagination State ---
  const [visibleParagraphs, setVisibleParagraphs] = useState(2);

  // --- Menu State ---
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<'settings' | 'saveload'>('settings');
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'Default',
    font: "'Lexend Deca', sans-serif",
    fontSize: 'Small',
    glow: true,
    apiKey: '',
    saveKeyLocally: false,
    devMode: false,
    layoutMode: false,
    voiceName: 'Kore',
    autoplayAudio: false,
    customImages: { player: null, npc: null, location: null }
  });

  // Load settings on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('lily_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings({ 
          ...parsed, 
          devMode: parsed.devMode || false,
          saveKeyLocally: parsed.saveKeyLocally || false,
          layoutMode: false, 
          voiceName: parsed.voiceName || 'Kore',
          autoplayAudio: parsed.autoplayAudio || false,
          customImages: parsed.customImages || { player: null, npc: null, location: null },
          fontSize: parsed.fontSize || 'Small'
      });
    }
  }, []);

  // Force menu open if fresh load and no history
  useEffect(() => {
     if (gameState.time.day === 0 && gameState.history.length === 1 && gameState.history[0].text.includes("Welcome")) {
         setIsMenuOpen(true);
         setActiveModule('saveload');
     }
  }, []);

  // Reset pagination on new turn
  useEffect(() => {
      setVisibleParagraphs(2);
  }, [gameState.history.length]);

  // Save settings on change
  useEffect(() => {
    const settingsToSave = { ...settings };
    if (!settingsToSave.saveKeyLocally) {
        settingsToSave.apiKey = '';
    }
    localStorage.setItem('lily_settings', JSON.stringify(settingsToSave));
  }, [settings]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState.history, isMenuOpen, activePanel, visibleParagraphs]);

  // Toggle menu with ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsMenuOpen(prev => !prev);
        }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // --- Core Logic ---
  
  const handleNewGameConfig = (config: GameConfig) => {
        const newState = JSON.parse(JSON.stringify(INITIAL_GAME_STATE));
        newState.config = config;
        
        // Reset history to actual game start text
        const startText = config.tutorial ? TUTORIAL_START_TEXT : GAME_START_TEXT;
        newState.history = [{ role: 'model', text: startText }];

        if (!config.tutorial) {
            newState.time.day = 1;
        }
        setGameState(newState);
        setIsMenuOpen(false);
        setStateHistory([]);
        setGeneratedChoices(config.tutorial ? TUTORIAL_PHASE_1_CHOICES : []);
  };

  const generateChoices = useCallback(async (intent: Intent) => {
      const apiKeyToUse = settings.apiKey || process.env.API_KEY;
      if (!apiKeyToUse) {
          alert("Please set your API Key in Settings.");
          return;
      }

      setIsGeneratingChoices(true);
      setPendingIntent(intent);
      setGeneratedChoices([]); 

      try {
          const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
          const prompt = constructChoicePrompt(gameState, intent);
          
          const result = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt
          });

          const responseText = result.text;
          try {
              const cleanText = responseText?.replace(/```json|```/g, '').trim() || "[]";
              const choices = JSON.parse(cleanText);
              if (Array.isArray(choices) && choices.length > 0) {
                  setGeneratedChoices(choices);
              } else {
                  setGeneratedChoices(["Error generating options.", "Try again.", "...", "..."]);
              }
          } catch (e) {
              console.error("JSON Parse Error", e);
              setGeneratedChoices(["Parsing Error.", "The AI did not return valid JSON.", "Try again.", "Use Custom Input."]);
          }

      } catch (error) {
          console.error("Gemini Error (Choices):", error);
          setGeneratedChoices(["Connection Error.", "Check API Key.", "...", "..."]);
      } finally {
          setIsGeneratingChoices(false);
      }
  }, [gameState, settings.apiKey]);

  const processTurn = useCallback(async (textInput: string, intent: Intent | null) => {
    const apiKeyToUse = settings.apiKey || process.env.API_KEY;
    
    if (!apiKeyToUse) {
        setGameState(curr => ({
            ...curr,
            history: [...curr.history, { role: 'model', text: "System: Please enter a valid API Key in the Settings Menu to play." }]
        }));
        return;
    }

    // Save current state to history stack BEFORE processing changes
    setStateHistory(prev => [...prev, JSON.parse(JSON.stringify(gameState))]);

    setIsProcessing(true);
    setGeneratedChoices([]);
    setPendingIntent(null);

    const timeResult = advanceTime(gameState.time.segment, gameState.time.slotsUsed);
    
    // Apply new day logic (reset vitality if sleeping)
    let tempState = { ...gameState };
    if (timeResult.newDay) {
         tempState.stats.VITALITY = Math.min(100, tempState.stats.VITALITY + 50); // Sleep restores energy
         tempState.stats.FATIGUE = 0;
    }

    const newState = {
        ...tempState,
        time: {
            day: timeResult.newDay ? gameState.time.day + 1 : gameState.time.day,
            segment: timeResult.segment,
            slotsUsed: timeResult.slots
        },
        history: [...gameState.history, { role: 'user', text: intent ? `[${intent.type} - ${intent.manner}] ${textInput}` : textInput }]
    };

    setGameState(newState as GameState);

    try {
        const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
        const prompt = constructGeminiPrompt(newState as GameState, intent, textInput);
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
              responseMimeType: "application/json"
          }
        });
        
        const responseText = result.text || "";
        let narrativeText = "";
        let updates: GameEngineResponse['updates'] | null = null;

        try {
            const parsed: GameEngineResponse = JSON.parse(responseText);
            narrativeText = parsed.narrative;
            updates = parsed.updates;
        } catch (e) {
            console.error("Failed to parse JSON response", e);
            narrativeText = responseText; // Fallback to raw text
        }

        // Apply Game Mechanics Updates
        setGameState(current => {
            const nextState = { ...current };
            
            if (updates) {
                // 1. Stats
                if (updates.statChanges) {
                    Object.entries(updates.statChanges).forEach(([key, val]) => {
                         const statKey = key as StatType;
                         if (nextState.stats[statKey] !== undefined) {
                             nextState.stats[statKey] = Math.max(0, Math.min(100, nextState.stats[statKey] + (val || 0)));
                         }
                    });
                }
                
                // 2. Money
                if (updates.moneyChange) {
                    nextState.stats.FINANCE += updates.moneyChange;
                }

                // 3. Location
                if (updates.locationChange) {
                    nextState.location = updates.locationChange;
                }

                // 4. Relationships
                if (updates.relationshipChanges) {
                    Object.entries(updates.relationshipChanges).forEach(([npc, change]) => {
                        if (!nextState.npcRelationships[npc]) {
                            // Discover new NPC
                            nextState.npcRelationships[npc] = { trust: 0, attraction: 0, familiarity: 0 };
                        }
                        const rel = nextState.npcRelationships[npc];
                        if (change.trust) rel.trust = Math.max(0, Math.min(100, rel.trust + change.trust));
                        if (change.attraction) rel.attraction = Math.max(0, Math.min(100, rel.attraction + change.attraction));
                        if (change.familiarity) rel.familiarity = Math.max(0, Math.min(100, rel.familiarity + change.familiarity));
                    });
                }
            }

            return {
                ...nextState,
                history: [...nextState.history, { role: 'model', text: narrativeText }]
            };
        });

        setVisibleParagraphs(2); // Ensure reset
        
    } catch (error) {
        console.error("Gemini Error:", error);
        setGameState(current => ({
            ...current,
            history: [...current.history, { role: 'model', text: "Error connecting to the narrative engine. Please check your API key." }]
        }));
    } finally {
        setIsProcessing(false);
        setUserInput('');
    }
  }, [gameState, settings.apiKey]);

  const handleUndo = () => {
      if (stateHistory.length === 0 || isProcessing) return;

      const previousState = stateHistory[stateHistory.length - 1];
      const newHistoryStack = stateHistory.slice(0, -1);

      // Identify added items in current history that are NOT in previous history
      const prevHistoryLength = previousState.history.length;
      const retractedItems = gameState.history.slice(prevHistoryLength).map(item => ({
          ...item,
          retracted: true
      }));

      // Merge previous state with the retracted items appended to history
      const restoredState: GameState = {
          ...previousState,
          history: [...previousState.history, ...retractedItems]
      };

      setGameState(restoredState);
      setStateHistory(newHistoryStack);
  };

  const handleOptionSelect = (index: number) => {
      if (index === 4) {
          inputRef.current?.focus();
          return;
      }
      
      const choiceText = generatedChoices[index];
      if (choiceText) {
          processTurn(choiceText, pendingIntent);
      }
  };

  const handleTextSubmit = () => {
      if (!userInput.trim()) return;
      processTurn(userInput, pendingIntent || null);
  };

  const handleNextChunk = () => {
      setVisibleParagraphs(prev => prev + 2);
  };

  const handleImageUpload = (key: keyof AppSettings['customImages']) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onloadend = () => {
          setSettings(prev => ({
              ...prev,
              customImages: {
                  ...prev.customImages,
                  [key]: reader.result as string
              }
          }));
      };
      reader.readAsDataURL(file);
  };

  const updateStat = (type: StatType, value: number) => {
      setGameState(prev => ({
          ...prev,
          stats: {
              ...prev.stats,
              [type]: value
          }
      }));
  };

  const handleDevSlotClick = (slotIndex: number) => {
      if (!settings.devMode) return;

      if (slotIndex === gameState.time.slotsUsed) {
          const timeResult = advanceTime(gameState.time.segment, gameState.time.slotsUsed);
          setGameState(prev => ({
              ...prev,
              time: {
                  day: timeResult.newDay ? prev.time.day + 1 : prev.time.day,
                  segment: timeResult.segment,
                  slotsUsed: timeResult.slots
              }
          }));
      }
  };

  const togglePanel = (panel: PanelType) => {
      if (activePanel === panel) {
          setActivePanel(null);
      } else {
          setActivePanel(panel);
      }
  };

  // Prepare Display History (Pagination)
  const lastMsgIndex = gameState.history.length - 1;
  const lastMsg = gameState.history[lastMsgIndex];
  const isLastMsgModel = lastMsg?.role === 'model' && !lastMsg.retracted;
  let displayedHistory = gameState.history;
  let showNextBtn = false;
  let currentChunkText = "";

  if (isLastMsgModel) {
     const paras = lastMsg.text.split(/\n+/).filter(p => p.trim().length > 0);
     if (paras.length > visibleParagraphs) {
         showNextBtn = true;
         const truncatedText = paras.slice(0, visibleParagraphs).join('\n\n');
         displayedHistory = [...gameState.history.slice(0, -1), { ...lastMsg, text: truncatedText }];
         currentChunkText = truncatedText;
     } else {
         currentChunkText = lastMsg.text;
     }
  } else {
      currentChunkText = gameState.history.slice().reverse().find(h => h.role === 'model' && !h.retracted)?.text || "";
  }

  // --- Dynamic Styles ---
  const narrativeFontStyle = (() => {
      switch (settings.fontSize) {
          case 'Medium': return { fontSize: '1.1rem', lineHeight: '1.6' };
          case 'Large': return { fontSize: '1.3rem', lineHeight: '1.6' };
          default: return { fontSize: '0.875rem', lineHeight: '1.5' }; // text-sm
      }
  })();

  const optionsFontStyle = (() => {
      switch (settings.fontSize) {
          case 'Medium': return { fontSize: '12px' };
          case 'Large': return { fontSize: '14px' };
          default: return { fontSize: '10px' }; // text-[10px]
      }
  })();

  return (
    <div 
        className={`w-screen h-screen p-1 grid grid-cols-12 grid-rows-12 gap-2 overflow-hidden transition-all duration-300 ${settings.theme === 'White' ? 'bg-gray-100' : 'bg-black'}`}
        style={{ fontFamily: settings.font }}
    >
        
        {/* --- MENU OVERLAY (Conditional Render) --- */}
        {isMenuOpen && (
            <>
                <div className="col-span-10 col-start-1 row-span-2 bg-gray-800/90 rounded-lg border border-gray-600 flex items-center justify-center gap-8 z-50 backdrop-blur-md">
                    <div onClick={() => setActiveModule('settings')} className={`cursor-pointer p-2 rounded hover:bg-gray-700 transition-colors flex flex-col items-center ${activeModule === 'settings' ? 'text-blue-400' : 'text-white'}`}>
                        <span className="text-2xl">⚙️</span>
                        <span className="text-xs font-bold uppercase">Settings</span>
                    </div>
                    <div onClick={() => setActiveModule('saveload')} className={`cursor-pointer p-2 rounded hover:bg-gray-700 transition-colors flex flex-col items-center ${activeModule === 'saveload' ? 'text-green-400' : 'text-white'}`}>
                        <span className="text-2xl">💾</span>
                        <span className="text-xs font-bold uppercase">Save / Load</span>
                    </div>
                </div>

                <div className="col-span-10 col-start-1 row-span-10 row-start-3 bg-gray-900/90 rounded-lg border border-gray-600 z-50 backdrop-blur-md shadow-2xl relative">
                    {activeModule === 'settings' && (
                        <SettingsModule 
                            settings={settings} 
                            onUpdate={(updates) => setSettings(prev => ({ ...prev, ...updates }))} 
                            onNewGame={handleNewGameConfig}
                        />
                    )}
                    {activeModule === 'saveload' && (
                        <SaveLoadModule 
                            currentState={gameState} 
                            onLoad={(loadedState) => {
                                setGameState(loadedState);
                                setIsMenuOpen(false);
                            }}
                            settings={settings}
                            onSettingsUpdate={(updates) => setSettings(prev => ({ ...prev, ...updates }))}
                            onNewGame={handleNewGameConfig}
                        />
                    )}
                </div>
            </>
        )}


        {/* --- GAME GRID (Hidden when Menu is Open) --- */}
        {!isMenuOpen && (
            <>
                {/* 1. NPC Image */}
                <div className="col-span-3 row-span-7 bg-gradient-to-b from-purple-900 to-pink-800 rounded-lg border-2 border-gray-600 flex flex-col relative shadow-lg overflow-hidden group">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    <ImageUploadOverlay id="upload-npc" onUpload={handleImageUpload('npc')} />
                    <div className="absolute top-2 right-2 z-10 w-4 h-4 rounded-full bg-gray-300 border border-black shadow-sm"></div>
                    <img src={settings.customImages.npc || "https://preview.redd.it/getting-closer-v0-wcjm3vkvd42g1.png?width=320&crop=smart&auto=webp&s=ba568735a10780393b01f33d871ce35f1ab0fdee"} alt="NPC" className="object-cover w-full h-full transition-opacity duration-500" />
                </div>

                {/* 2. Location Image */}
                <div className="col-span-5 row-span-4 bg-gradient-to-tr from-blue-900 via-purple-800 to-pink-600 rounded-lg border-2 border-gray-600 flex items-center justify-center overflow-hidden relative shadow-lg group">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    <ImageUploadOverlay id="upload-loc" onUpload={handleImageUpload('location')} />
                    <img src={settings.customImages.location || "https://preview.redd.it/getting-closer-v0-wrhjsjlvd42g1.png?width=640&crop=smart&auto=webp&s=3ae1c3f2025cf2b4d2497eb4aae11604f000575f"} alt="Location" className="object-cover w-full h-full" />
                    <div className="absolute bottom-2 left-2 text-xl font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{gameState.location}</div>
                </div>

                {/* 3. Time Wheel (Segment Counter) */}
                <div className="col-span-2 row-span-3 bg-gray-900 rounded-lg border-2 border-gray-600 flex items-center justify-center relative shadow-md overflow-hidden">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    <TimeWheel segment={gameState.time.segment} day={gameState.time.day} />
                </div>

                {/* 4. Event Slots (Formerly Event Counter) */}
                <div className="col-span-2 row-span-1 col-start-9 row-start-4 bg-gradient-to-br from-blue-900 to-purple-800 rounded-lg border-2 border-gray-600 flex flex-row items-stretch justify-between p-1 gap-1 relative shadow-md">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    {[0, 1, 2].map(index => {
                        const isFilled = gameState.time.slotsUsed > index;
                        const isClickable = settings.devMode && gameState.time.slotsUsed === index;
                        return (
                            <div 
                                key={index}
                                onClick={() => handleDevSlotClick(index)}
                                className={`flex-1 rounded border shadow-inner transition-all duration-300 
                                    ${isFilled 
                                        ? 'bg-cyan-400 border-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.8)]' 
                                        : 'bg-black/40 border-white/10'}
                                    ${isClickable ? 'cursor-pointer hover:bg-white/20' : ''}
                                `}
                            ></div>
                        );
                    })}
                </div>

                {/* 5. Character Image */}
                <div className="col-span-2 row-span-10 col-start-11 bg-gradient-to-b from-blue-900 to-purple-900 rounded-lg border-2 border-gray-600 overflow-hidden relative shadow-xl group">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    <ImageUploadOverlay id="upload-player" onUpload={handleImageUpload('player')} />
                    <img src={settings.customImages.player || "https://preview.redd.it/getting-closer-v0-2h4ynukvd42g1.png?width=311&format=png&auto=webp&s=6983581d7af07529406ba203e2913c964faeb51d"} alt="Lily" className="object-cover w-full h-full" />
                </div>

                {/* --- CENTRAL COLUMN AREA (Narrative/Actions OR Panel Overlay) --- */}
                
                {activePanel ? (
                    // Overlay Panel (Replaces Narrative, Matrix, Options)
                    <CentralPanel 
                        type={activePanel} 
                        onClose={() => setActivePanel(null)} 
                        gameState={gameState} 
                        setGameState={setGameState} 
                        layoutMode={settings.layoutMode}
                        devMode={settings.devMode}
                        onGameAction={(text) => processTurn(text, null)}
                    />
                ) : (
                    <>
                        {/* 6. Narrative Output */}
                        <div className="col-span-7 row-span-5 col-start-4 row-start-5 bg-gradient-to-r from-blue-900 to-purple-800 rounded-lg border-2 border-gray-600 overflow-hidden relative shadow-lg flex flex-row">
                            {settings.layoutMode && <LayoutDebugOverlay />}
                            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-[10px] font-black text-gray-300 uppercase z-10 bg-black/40 px-2 rounded pointer-events-none">Narrative Output</div>
                            
                            {/* Text Area */}
                            <div 
                                className="flex-grow h-full overflow-y-auto font-sans text-gray-100 leading-snug p-3 mt-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
                                style={narrativeFontStyle}
                            >
                                {displayedHistory.map((msg, idx) => (
                                    <div key={idx} className={`mb-2 ${msg.role === 'user' ? 'text-blue-300 italic text-xs text-right' : ''} ${msg.retracted ? 'line-through opacity-50 decoration-2 decoration-red-500/70' : ''}`}>
                                        {msg.role === 'model' ? msg.text : `> ${msg.text}`}
                                    </div>
                                ))}
                                {isProcessing && <div className="text-pink-400 animate-pulse text-xs">Thinking...</div>}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Audio Control Sidebar */}
                            <NarrativeControlPanel 
                                text={currentChunkText} 
                                apiKey={settings.apiKey || process.env.API_KEY || ""}
                                voiceName={settings.voiceName}
                                autoplay={settings.autoplayAudio}
                                onStatusChange={() => {}} 
                                showNextBtn={showNextBtn}
                                onNextChunk={handleNextChunk}
                            />
                        </div>

                        {/* 8. Intent Matrix (REDESIGNED) */}
                        <div className="col-span-3 row-span-3 col-start-4 row-start-10 relative">
                            {settings.layoutMode && <LayoutDebugOverlay />}
                            <IntentMatrix onSelect={generateChoices} disabled={isProcessing || isGeneratingChoices} />
                        </div>

                        {/* 9. Options List */}
                        <div className="col-span-4 row-span-3 col-start-7 row-start-10 relative">
                            {settings.layoutMode && <LayoutDebugOverlay />}
                            <PlayerOptions 
                                choices={generatedChoices} 
                                onSelect={handleOptionSelect} 
                                loading={isGeneratingChoices}
                                onUndo={handleUndo}
                                fontSizeStyle={optionsFontStyle}
                            />
                        </div>
                    </>
                )}


                {/* 7. Stats Panel */}
                <div className="col-span-3 row-span-5 col-start-1 row-start-8 bg-gray-900 rounded-lg border-2 border-gray-600 p-1 flex flex-col shadow-lg relative">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    {/* Stats Area */}
                    <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
                        <div className="w-4 h-full bg-gray-800 rounded-full border border-gray-600 relative shrink-0">
                            <div className="absolute bottom-2 left-0.5 w-2.5 h-2.5 bg-red-500 rounded-full shadow-lg"></div>
                            <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-red-900 to-transparent opacity-50 rounded-b-full"></div>
                        </div>
                        <div className="flex-grow flex flex-col gap-1 overflow-y-auto pr-1">
                            <StatBar 
                                label="Vitality" 
                                value={gameState.stats.VITALITY} 
                                color="#00B0F0" 
                                icon="💧" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.VITALITY, v)}
                            />
                            <StatBar 
                                label="Will" 
                                value={gameState.stats.WILL * 5} 
                                color="#7030A0" 
                                icon="🟣" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.WILL, v / 5)}
                            />
                            <StatBar 
                                label="Grace" 
                                value={gameState.stats.GRACE * 5} 
                                color="#FF1493" 
                                icon="🌸" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.GRACE, v / 5)}
                            />
                            <StatBar 
                                label="Confidence" 
                                value={gameState.stats.CONFIDENCE * 5} 
                                color="#FFA500" 
                                icon="✨" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.CONFIDENCE, v / 5)}
                            />
                            <StatBar 
                                label="Finance" 
                                value={gameState.stats.FINANCE} 
                                color="#FFFF00" 
                                icon="🟡" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.FINANCE, v)}
                            />
                            <StatBar 
                                label="Danger" 
                                value={gameState.stats.DANGER} 
                                color="#E6B8B8" 
                                icon="🟥" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.DANGER, v)}
                            />
                            <StatBar 
                                label="Blush" 
                                value={gameState.stats.BLUSH} 
                                color="#000000" 
                                icon="⚫" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.BLUSH, v)}
                            />
                            
                            <StatBar 
                                label="Social" 
                                value={gameState.stats.SOCIAL_CLASS + 50} 
                                color="#00B050" 
                                icon="🟢" 
                                editable={settings.devMode}
                                onChange={(v) => updateStat(StatType.SOCIAL_CLASS, v - 50)}
                            />
                            <StatBar label="Attraction" value={20} color="#FF0000" icon="❤️" />
                        </div>
                    </div>

                    {/* Navigation Buttons (New) */}
                    <div className="grid grid-cols-6 gap-1 mt-1 h-8 shrink-0">
                        {['Stats', 'Map', 'Items', 'NPCs', 'Job', 'Log'].map((label, idx) => (
                            <button 
                                key={label}
                                onClick={() => togglePanel(label as PanelType)}
                                className={`${activePanel === label ? 'bg-red-800 ring-1 ring-white' : 'bg-red-600 hover:bg-red-500'} border border-red-800 rounded flex items-center justify-center text-white shadow-sm transition-all group relative overflow-hidden`}
                                title={label}
                            >
                                <span className="text-[8px] font-bold uppercase tracking-tighter leading-none z-10">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 10. Input Bar */}
                <div className="col-span-2 row-span-2 col-start-11 row-start-11 bg-gray-300/90 rounded-lg border border-gray-400 p-1 flex gap-1 shadow-lg relative">
                    {settings.layoutMode && <LayoutDebugOverlay />}
                    <textarea 
                        ref={inputRef}
                        className="flex-grow h-full bg-transparent text-black text-[10px] resize-none border-none focus:ring-0 placeholder-gray-600 font-sans"
                        placeholder={generatedChoices.length > 0 ? "Type custom action..." : "Select Intent first..."}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); }}}
                        disabled={isProcessing}
                    />
                    <button 
                        onClick={handleTextSubmit} 
                        disabled={isProcessing} 
                        className="w-10 h-full bg-gray-400/50 hover:bg-gray-400 text-gray-800 text-[10px] font-bold rounded border border-gray-500 transition-colors flex items-center justify-center"
                    >
                        Send
                    </button>
                </div>
            </>
        )}

        {/* --- MENU BUTTON (Always Visible, Absolute) --- */}
        <div 
            className="absolute top-2 left-2 z-[100] cursor-pointer p-2 hover:scale-110 transition-transform"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
            <div className="w-8 h-8 flex flex-col justify-around items-end">
                {isMenuOpen ? (
                   <span className="text-4xl text-white leading-none drop-shadow-md" style={{ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}>&times;</span>
                ) : (
                   <>
                    <div className="w-full h-2 bg-white rounded border-2 border-black shadow-md"></div>
                    <div className="w-full h-2 bg-white rounded border-2 border-black shadow-md"></div>
                    <div className="w-full h-2 bg-white rounded border-2 border-black shadow-md"></div>
                   </>
                )}
            </div>
        </div>

    </div>
  );
}
