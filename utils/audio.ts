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