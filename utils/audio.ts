/**
 * Creates a distortion curve for the WaveShaperNode.
 * @param amount The intensity of the distortion (0-100 recommended, but can go higher)
 */
export const makeDistortionCurve = (amount: number): Float32Array => {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
  
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      // An S-curve function often used for guitar fuzz/distortion
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

/**
 * Encodes AudioBuffer to WAV format (Blob)
 */
export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], { type: "audio/wav" });

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

/**
 * Offline rendering for instant audio export
 */
export const renderOfflineAudio = async (
  file: File, 
  distortionAmount: number, 
  playbackRate: number
): Promise<Blob> => {
  // 1. Decode the original file
  const arrayBuffer = await file.arrayBuffer();
  const tempCtx = new AudioContext();
  const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  tempCtx.close();

  // 2. Setup Offline Context
  // Note: changing playbackRate changes duration. 
  // Duration = originalDuration / playbackRate
  const originalDuration = audioBuffer.duration;
  const newDuration = originalDuration / playbackRate;
  
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    newDuration * 44100, // sample frames
    44100 // sample rate
  );

  // 3. Create Nodes in Offline Context
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = playbackRate;

  const gainNode = offlineCtx.createGain();
  const distortionNode = offlineCtx.createWaveShaper();
  
  // Apply Distortion
  distortionNode.curve = makeDistortionCurve(distortionAmount * 4);
  distortionNode.oversample = '4x';
  const inputBoost = 1 + (distortionAmount / 8); 
  gainNode.gain.value = inputBoost;

  // Connect
  source.connect(gainNode);
  gainNode.connect(distortionNode);
  distortionNode.connect(offlineCtx.destination);

  // 4. Render
  source.start(0);
  const renderedBuffer = await offlineCtx.startRendering();

  // 5. Convert to WAV
  return bufferToWav(renderedBuffer);
};