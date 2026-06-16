/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OscillatorRecipe {
  type: "sine" | "square" | "sawtooth" | "triangle";
  startFreq: number;
  endFreq: number;
  detune?: number;
  startTime: number;
  duration: number;
  gainStart: number;
  gainEnd: number;
}

export interface NoiseRecipe {
  type: "white" | "pink" | null;
  startTime: number;
  duration: number;
  gainStart: number;
  gainEnd: number;
  filterType?: "lowpass" | "highpass" | "bandpass" | null;
  filterFreqStart?: number;
  filterFreqEnd?: number;
}

export interface VibratoRecipe {
  freq: number;
  depth: number;
}

export interface SoundRecipe {
  soundName: string;
  description: string;
  duration: number;
  oscillators: OscillatorRecipe[];
  noise?: NoiseRecipe;
  vibrato?: VibratoRecipe;
}

export class SoundSynth {
  private ctx: AudioContext | null = null;
  private activeNodes: { stop: () => void }[] = [];
  private analyserNode: AnalyserNode | null = null;

  constructor() {
    // Lazy initialize to support browser policies
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public stopAll() {
    this.activeNodes.forEach((node) => {
      try {
        node.stop();
      } catch (e) {
        // Safe check
      }
    });
    this.activeNodes = [];
  }

  public playRecipe(recipe: SoundRecipe) {
    const audioCtx = this.initCtx();
    this.stopAll();

    const now = audioCtx.currentTime;

    // Create a master analyser node for a visualizer
    this.analyserNode = audioCtx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.connect(audioCtx.destination);

    // Create a master gain for headroom safety
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.4, now); // Headroom mix
    masterGain.connect(this.analyserNode);

    // Dynamic Vibrato LFO if configured
    let vibratoNode: OscillatorNode | null = null;
    let vibratoGain: GainNode | null = null;
    if (recipe.vibrato && recipe.vibrato.freq > 0 && recipe.vibrato.depth > 0) {
      vibratoNode = audioCtx.createOscillator();
      vibratoNode.frequency.setValueAtTime(recipe.vibrato.freq, now);
      
      vibratoGain = audioCtx.createGain();
      vibratoGain.gain.setValueAtTime(recipe.vibrato.depth, now);
      
      vibratoNode.connect(vibratoGain);
      vibratoNode.start(now);
      vibratoNode.stop(now + recipe.duration);
    }

    // Play Oscillators
    if (recipe.oscillators && recipe.oscillators.length > 0) {
      recipe.oscillators.forEach((osc) => {
        const oscNode = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();

        oscNode.type = osc.type || "sine";
        
        // Base starting frequency
        const start = now + (osc.startTime || 0);
        const duration = osc.duration || recipe.duration;
        const end = start + duration;

        oscNode.frequency.setValueAtTime(osc.startFreq || 220, start);
        if (osc.endFreq && osc.endFreq !== osc.startFreq) {
          oscNode.frequency.exponentialRampToValueAtTime(Math.max(1, osc.endFreq), end);
        }

        if (osc.detune) {
          oscNode.detune.setValueAtTime(osc.detune, start);
        }

        // Apply LFO Vibrato to oscillator frequency if active
        if (vibratoGain) {
          vibratoGain.connect(oscNode.frequency);
        }

        // Gain Envelope
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(osc.gainStart ?? 0.3, start + 0.05);
        oscGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, osc.gainEnd ?? 0), end);

        oscNode.connect(oscGain);
        oscGain.connect(masterGain);

        oscNode.start(start);
        oscNode.stop(end);

        this.activeNodes.push({
          stop: () => {
            try {
              oscNode.stop();
            } catch (err) {}
          },
        });
      });
    }

    // Play Procedural Noise if configured
    if (recipe.noise && recipe.noise.type) {
      const bufferSize = audioCtx.sampleRate * (recipe.noise.duration || recipe.duration);
      if (bufferSize > 0) {
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Populate white or simple colored noise
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;

        const noiseGain = audioCtx.createGain();
        const start = now + (recipe.noise.startTime || 0);
        const end = start + (recipe.noise.duration || recipe.duration);

        // Noise gate gain envelope
        noiseGain.gain.setValueAtTime(0, now);
        noiseGain.gain.linearRampToValueAtTime(recipe.noise.gainStart ?? 0.1, start + 0.05);
        noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, recipe.noise.gainEnd ?? 0), end);

        if (recipe.noise.filterType) {
          const filterNode = audioCtx.createBiquadFilter();
          filterNode.type = recipe.noise.filterType;
          filterNode.frequency.setValueAtTime(recipe.noise.filterFreqStart || 1000, start);
          if (recipe.noise.filterFreqEnd) {
            filterNode.frequency.exponentialRampToValueAtTime(Math.max(10, recipe.noise.filterFreqEnd), end);
          }
          noiseNode.connect(filterNode);
          filterNode.connect(noiseGain);
        } else {
          noiseNode.connect(noiseGain);
        }

        noiseGain.connect(masterGain);
        noiseNode.start(start);
        noiseNode.stop(end);

        this.activeNodes.push({
          stop: () => {
            try {
              noiseNode.stop();
            } catch (err) {}
          },
        });
      }
    }

    // Safety master timeout node
    const cleanupTimeoutNode = {
      stop: () => {}
    };
    this.activeNodes.push(cleanupTimeoutNode);
  }
}
