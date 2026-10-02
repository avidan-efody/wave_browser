/**
 * Records the wave display with the browser tab-capture API, then lets the user save an MP4.
 * H.264 in an MP4 plays in mail, chat, phones, and desktop players.
 * Chrome can crop the capture to the display element. Other browsers keep the shared tab.
 */

interface CroppableTrack extends MediaStreamTrack {
  cropTo?: (cropTarget: unknown) => Promise<void>;
}

interface SaveHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

/** Baseline, then Main, then High. Level 4.0 covers a 1080p display and still plays widely. */
const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.42E028',
  'video/mp4;codecs=avc1.4D0028',
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function supportedVideoTypes(): string[] {
  return VIDEO_TYPES.filter((type) => MediaRecorder.isTypeSupported(type));
}

function fileKind(blob: Blob): { description: string; mime: string; extension: string } {
  if (blob.type.startsWith('video/mp4')) {
    return { description: 'MP4 video', mime: 'video/mp4', extension: '.mp4' };
  }
  return { description: 'WebM video', mime: 'video/webm', extension: '.webm' };
}

export class DisplayCapture {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private blob: Blob | null = null;

  async start(element: HTMLElement): Promise<void> {
    this.discard();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('This browser cannot record the display');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
      // Chromium hints: offer the current tab and hide full-screen monitors.
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'exclude',
    } as DisplayMediaStreamOptions);
    this.stream = stream;
    const track = stream.getVideoTracks()[0] as CroppableTrack | undefined;
    const CropTarget = (window as unknown as {
      CropTarget?: { fromElement: (target: HTMLElement) => Promise<unknown> };
    }).CropTarget;
    if (track?.cropTo && CropTarget) {
      try {
        await track.cropTo(await CropTarget.fromElement(element));
      } catch {
        // A window or monitor share cannot be cropped. Keep the full capture.
      }
    }
    const types = supportedVideoTypes();
    const attempts = types.length > 0 ? types : [''];
    this.chunks = [];
    let recorder: MediaRecorder | null = null;
    let lastError: unknown;
    for (const mimeType of attempts) {
      try {
        const options: MediaRecorderOptions = { videoBitsPerSecond: 4_000_000 };
        if (mimeType) options.mimeType = mimeType;
        const candidate = new MediaRecorder(stream, options);
        candidate.ondataavailable = (event) => {
          if (event.data.size > 0) this.chunks.push(event.data);
        };
        candidate.start(250);
        recorder = candidate;
        break;
      } catch (error) {
        lastError = error;
        recorder = null;
      }
    }
    if (!recorder) {
      this.releaseStream();
      throw lastError instanceof Error ? lastError : new Error('This browser cannot record an MP4');
    }
    this.recorder = recorder;
    track?.addEventListener('ended', () => {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    });
  }

  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) return this.blob;
    if (recorder.state !== 'inactive') {
      const stopped = new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
      });
      recorder.stop();
      await stopped;
    }
    const recordedType = recorder.mimeType || 'video/mp4';
    const type = recordedType.startsWith('video/mp4') ? 'video/mp4' : recordedType;
    this.blob = new Blob(this.chunks, { type });
    this.chunks = [];
    this.recorder = null;
    this.releaseStream();
    return this.blob;
  }

  async save(filename: string): Promise<'saved' | 'cancelled' | 'empty'> {
    const blob = this.blob ?? await this.stop();
    if (!blob || blob.size === 0) return 'empty';
    const kind = fileKind(blob);
    const suggestedName = filename.replace(/\.(mp4|webm)$/i, '') + kind.extension;
    const picker = (window as unknown as {
      showSaveFilePicker?: (options: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<SaveHandle>;
    }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName,
          types: [{ description: kind.description, accept: { [kind.mime]: [kind.extension] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this.discard();
        return 'saved';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        throw error;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(url);
    this.discard();
    return 'saved';
  }

  discard(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
    this.chunks = [];
    this.blob = null;
    this.releaseStream();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
