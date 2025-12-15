import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Download, Zap, Radio, Trash2, ShieldCheck, Bomb, Skull, Music } from 'lucide-react';
import { makeDistortionCurve } from './utils/audio';
import { CyberButton } from './components/CyberButton';
import { RangeSlider } from './components/RangeSlider';

const App: React.FC = () => {
  // --- State ---
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Effects State
  const [speed, setSpeed] = useState(1.0);
  const [distortion, setDistortion] = useState(0); // 0 to 100
  const [preservePitch, setPreservePitch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const distortionNodeRef = useRef<WaveShaperNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // --- File Handling ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoSrc(url);
      resetState();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
       const file = e.dataTransfer.files[0];
       if (file.type.startsWith('video/')) {
         const url = URL.createObjectURL(file);
         setVideoFile(file);
         setVideoSrc(url);
         resetState();
       }
    }
  };

  const resetState = () => {
      setSpeed(1.0);
      setDistortion(0);
      setIsPlaying(false);
      setCurrentTime(0);
  };

  const clearVideo = () => {
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    setVideoFile(null);
    setVideoSrc(null);
    setIsPlaying(false);
  };

  // --- Audio Pipeline Setup ---
  useEffect(() => {
    if (!videoRef.current || !videoSrc) return;

    const initAudio = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const ctx = audioContextRef.current;
        
        if (!sourceNodeRef.current) {
             sourceNodeRef.current = ctx.createMediaElementSource(videoRef.current);
        }

        if (!gainNodeRef.current) gainNodeRef.current = ctx.createGain(); 
        if (!distortionNodeRef.current) distortionNodeRef.current = ctx.createWaveShaper();
        if (!masterGainRef.current) masterGainRef.current = ctx.createGain(); 
        if (!streamDestRef.current) streamDestRef.current = ctx.createMediaStreamDestination(); 

        const source = sourceNodeRef.current;
        const preGain = gainNodeRef.current;
        const dist = distortionNodeRef.current;
        const master = masterGainRef.current;
        const dest = ctx.destination;
        const streamDest = streamDestRef.current;

        source.disconnect();
        preGain.disconnect();
        dist.disconnect();
        master.disconnect();

        source.connect(preGain);
        preGain.connect(dist);
        dist.connect(master);
        master.connect(dest);
        master.connect(streamDest); 

        dist.curve = makeDistortionCurve(0);
        dist.oversample = '4x';
        preGain.gain.value = 1.0;
        master.gain.value = 1.0;
    };

    const handlePlay = () => {
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };

    videoRef.current.addEventListener('play', handlePlay);
    setTimeout(initAudio, 100);

    return () => {
        videoRef.current?.removeEventListener('play', handlePlay);
    };
  }, [videoSrc]);

  // --- Effect Applications ---
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      videoRef.current.preservesPitch = preservePitch; 
    }
  }, [speed, preservePitch]);

  useEffect(() => {
    if (distortionNodeRef.current && gainNodeRef.current) {
        distortionNodeRef.current.curve = makeDistortionCurve(distortion * 4); 
        const inputBoost = 1 + (distortion / 8); 
        gainNodeRef.current.gain.value = inputBoost;
    }
  }, [distortion]);

  // --- Player Controls ---
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // --- Export Logic ---
  const startProcessing = () => {
    if (!videoRef.current || !streamDestRef.current) return;
    
    setIsProcessing(true);
    setIsRecording(true);
    recordedChunksRef.current = [];

    const videoEl = videoRef.current as any;
    let videoStream: MediaStream;
    
    if (videoEl.captureStream) {
        videoStream = videoEl.captureStream();
    } else if (videoEl.mozCaptureStream) {
        videoStream = videoEl.mozCaptureStream();
    } else {
        alert("浏览器不支持捕捉流！");
        setIsProcessing(false);
        setIsRecording(false);
        return;
    }

    const audioStream = streamDestRef.current.stream;
    const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks()
    ]);

    const options = { mimeType: 'video/webm; codecs=vp9' };
    try {
        mediaRecorderRef.current = new MediaRecorder(combinedStream, options);
    } catch (e) {
        mediaRecorderRef.current = new MediaRecorder(combinedStream);
    }

    mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
        }
    };

    mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = `guichu_remix_${Date.now()}.webm`;
        a.click();
        window.URL.revokeObjectURL(url);
        setIsProcessing(false);
        setIsRecording(false);
        
        videoRef.current!.loop = true; 
        if(videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
    };

    videoRef.current.currentTime = 0; 
    videoRef.current.loop = false; 
    videoRef.current.play();
    setIsPlaying(true);
    mediaRecorderRef.current.start();

    videoRef.current.onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        videoRef.current!.onended = null;
    };
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen pb-20 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="fixed top-20 left-10 text-6xl animate-bounce opacity-20 pointer-events-none rotate-12 z-0">🤪</div>
      <div className="fixed bottom-40 right-20 text-8xl animate-spin opacity-20 pointer-events-none z-0">💿</div>
      <div className="fixed top-1/2 left-1/2 text-9xl -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none font-black z-0">鬼畜</div>

      {/* --- Marquee Header --- */}
      <div className="bg-[#ffff00] border-y-4 border-black py-2 overflow-hidden sticky top-0 z-50 shadow-hard">
        <div className="animate-marquee font-black text-black text-xl flex gap-10 items-center">
            <span>⚠️ 警告：本工具含有极高浓度的电子包浆</span>
            <span>💾 纯前端技术 (PURE FRONTEND)</span>
            <span>🚫 绝不上传服务器</span>
            <span>😎 您的隐私比您的鬼畜视频更重要</span>
            <span>🔊 建议佩戴耳机并调大音量 (开玩笑的别把耳朵炸了)</span>
            <span>⚠️ 警告：本工具含有极高浓度的电子包浆</span>
        </div>
      </div>

      <header className="max-w-7xl mx-auto px-4 pt-10 pb-6 text-center relative z-10">
        <h1 className="text-6xl md:text-8xl font-black text-white italic tracking-tighter drop-shadow-[5px_5px_0px_#ff00ff] hover-shake inline-block mb-4" style={{ WebkitTextStroke: '2px black' }}>
          ⚡️电子·鬼畜·制作机⚡️
        </h1>
        <p className="text-[#00ff00] font-bold text-xl bg-black inline-block px-4 py-1 rotate-2 border-2 border-white tracking-widest">
            “给你的视频加点大病”
        </p>
      </header>

      {/* --- Safety Badge --- */}
      <div className="max-w-2xl mx-auto mb-10 flex justify-center">
        <div className="bg-[#00ff00] text-black border-4 border-black p-4 shadow-hard-white flex items-center gap-4 transform -rotate-1 hover:rotate-0 transition-transform">
             <ShieldCheck className="w-10 h-10 animate-pulse" />
             <div className="text-left">
                 <h3 className="font-black text-lg leading-none">安全承诺：纯本地运行</h3>
                 <p className="font-bold text-sm opacity-80">视频数据仅在您的浏览器内处理，绝不上传云端。</p>
             </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-4 relative z-10">
        
        {/* --- Upload Section --- */}
        {!videoSrc && (
          <div 
            className="border-8 border-dashed border-[#ff00ff] bg-black/50 hover:bg-[#ff00ff]/20 rounded-none p-20 flex flex-col items-center justify-center transition-all cursor-pointer group shadow-[0_0_50px_#ff00ff] max-w-4xl mx-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              accept="video/*" 
              className="hidden" 
              id="video-upload"
              onChange={handleFileChange}
            />
            <label htmlFor="video-upload" className="flex flex-col items-center cursor-pointer transform group-hover:scale-110 transition-transform">
              <Upload className="w-32 h-32 text-[#00ff00] mb-6 drop-shadow-[4px_4px_0px_#000]" />
              <h2 className="text-4xl font-black mb-2 text-white bg-[#0000ff] px-6 py-2 border-4 border-white rotate-3">
                  把视频扔进来！
              </h2>
              <p className="text-[#ffff00] font-mono font-bold text-lg mt-4 bg-black px-2">
                  支持拖拽上传 / MP4, WEBM
              </p>
            </label>
          </div>
        )}

        {/* --- Editor Section --- */}
        {videoSrc && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Player (Updated to 8 cols for more width) */}
            <div className="lg:col-span-8 space-y-6">
              {/* TV Container */}
              <div className="bg-[#222] border-4 border-gray-400 p-2 pb-8 rounded-lg shadow-hard relative">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                
                <div className="border-4 border-black bg-black relative overflow-hidden group w-full flex justify-center bg-checkered">
                    <video
                    ref={videoRef}
                    src={videoSrc}
                    className="w-full h-auto max-h-[75vh] object-contain"
                    loop
                    muted={false}
                    crossOrigin="anonymous" 
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={togglePlay}
                    />

                    {/* Play Button Overlay */}
                    {!isPlaying && !isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-transparent transition-colors cursor-pointer" onClick={togglePlay}>
                            <Play className="w-24 h-24 text-white drop-shadow-[5px_5px_0px_#000]" fill="currentColor" />
                        </div>
                    )}
                    
                    {/* Processing Overlay */}
                    {isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#ff00ff]/90 z-20">
                            <Bomb className="w-20 h-20 text-black animate-bounce mb-4" />
                            <p className="text-white font-black text-3xl animate-pulse bg-black px-4 py-2 border-2 border-white">正在注入灵魂...</p>
                            <div className="mt-4 w-1/2 h-4 bg-black border-2 border-white">
                                <div className="h-full bg-[#ffff00] animate-marquee" style={{width: '100%'}}></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* TV Controls Decoration */}
                <div className="absolute bottom-2 right-4 flex gap-2">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                </div>
              </div>

              {/* Progress Bar & Simple Controls */}
              <div className="bg-white border-4 border-black p-4 shadow-hard flex items-center gap-4">
                <button 
                  onClick={togglePlay}
                  className="bg-black text-white p-2 hover:bg-[#00ff00] hover:text-black border-2 border-black transition-colors"
                >
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor"/> : <Play className="w-6 h-6" fill="currentColor"/>}
                </button>
                <div className="flex-grow flex flex-col">
                    <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-4 bg-gray-300 border-2 border-black appearance-none cursor-pointer accent-[#ff00ff]"
                    />
                    <div className="flex justify-between text-xs font-black font-mono text-black mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>
              </div>
            </div>

            {/* Right Column: Controls (Updated to 4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Main Panel */}
              <div className="bg-[#0000ff] p-6 border-4 border-white shadow-hard-white transform rotate-1 sticky top-24">
                <div className="flex items-center gap-2 mb-8 bg-black text-white p-2 border-2 border-white inline-block transform -rotate-2">
                  <Radio className="animate-pulse text-[#00ff00]" />
                  <h3 className="text-2xl font-black">调音台 MASTER</h3>
                </div>

                {/* Speed Control */}
                <div className="mb-6">
                  <RangeSlider 
                    emoji="⏩"
                    label="鬼畜倍速 (SPEED)" 
                    value={speed} 
                    min={0.5} 
                    max={4.0} 
                    step={0.1} 
                    onChange={setSpeed}
                    suffix="x"
                  />
                  
                  {/* Pitch Toggle */}
                  <div className="flex items-center gap-4 bg-black/20 p-2 border-2 border-black/50">
                     <button
                        onClick={() => setPreservePitch(!preservePitch)}
                        className={`flex-1 py-2 font-black border-2 border-black transition-all ${!preservePitch ? 'bg-[#ff00ff] text-white shadow-[4px_4px_0px_#000] -translate-y-1' : 'bg-gray-400 text-gray-700'}`}
                     >
                        <div className="flex flex-col items-center">
                            <Skull className="w-6 h-6 mb-1" />
                            <span>变调 (恶魔)</span>
                        </div>
                     </button>
                     <button
                        onClick={() => setPreservePitch(!preservePitch)}
                        className={`flex-1 py-2 font-black border-2 border-black transition-all ${preservePitch ? 'bg-[#00ff00] text-black shadow-[4px_4px_0px_#000] -translate-y-1' : 'bg-gray-400 text-gray-700'}`}
                     >
                        <div className="flex flex-col items-center">
                            <Music className="w-6 h-6 mb-1" />
                            <span>原调 (正常)</span>
                        </div>
                     </button>
                  </div>
                </div>

                {/* Distortion Control */}
                <div className="mb-8">
                  <div className="bg-[#ff0000] text-white font-black text-center border-2 border-black mb-2 animate-pulse">
                      DANGER ZONE
                  </div>
                  <RangeSlider 
                    emoji="💥"
                    label="电子包浆 (炸麦)" 
                    value={distortion} 
                    min={0} 
                    max={100} 
                    step={1} 
                    onChange={setDistortion}
                    suffix="%"
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-4">
                  <CyberButton onClick={startProcessing} disabled={isProcessing} variant="primary" className="text-xl">
                    <Download className="w-6 h-6" />
                    <span>合成并下载视频</span>
                  </CyberButton>
                  
                  <CyberButton variant="danger" onClick={clearVideo} disabled={isProcessing} className="text-sm py-2">
                    <Trash2 className="w-4 h-4" />
                    <span>这就不要了？(重置)</span>
                  </CyberButton>
                </div>
              </div>

              {/* Decoration Card */}
              <div className="bg-white border-4 border-black p-4 shadow-hard transform -rotate-1 text-black">
                 <h4 className="font-black text-xl mb-2 underline decoration-wavy decoration-[#ff00ff]">使用指南</h4>
                 <ul className="list-disc list-inside font-bold space-y-1 text-sm">
                     <li>先把倍速拉满，再把炸麦拉满</li>
                     <li>点击“变调”获得花栗鼠或恶魔音效</li>
                     <li>点击下载，发给你的怨种朋友</li>
                 </ul>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;