'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, CameraOff, Download, FlipHorizontal, RefreshCw, Timer, X, Aperture, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Camera Studio.
 *
 * An interactive "photo booth" for the demo: the visitor starts their webcam,
 * picks a look, optionally counts down, and takes a frame carrying the Virallink
 * brand. Shots are drawn to a <canvas> in the browser and offered as a download.
 *
 * Privacy is structural, not a promise: there is no upload path. The component
 * never posts anywhere — the only network-visible thing it does is read the
 * local camera stream, which requires an explicit permission grant and stops the
 * moment it is switched off or the component unmounts.
 *
 * The camera is requested only after the visitor presses Start, so nobody gets
 * an unsolicited permission prompt while scrolling the page.
 */

const FILTERS = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.08)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.35) brightness(0.92)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.5) contrast(1.1)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.42) saturate(1.25)' },
  { id: 'cool', label: 'Cool', css: 'saturate(1.1) hue-rotate(-12deg) brightness(1.03)' },
];

const FRAMES = [
  { id: 'brand', label: 'Brand bar' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'none', label: 'Clean' },
];

const MAX_SHOTS = 6;

export default function CameraStudio() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | starting | live | denied | error
  const [filterId, setFilterId] = useState('none');
  const [frameId, setFrameId] = useState('brand');
  const [mirrored, setMirrored] = useState(true);
  const [countdown, setCountdown] = useState(null); // seconds remaining while counting down
  const [flash, setFlash] = useState(false);
  const [shots, setShots] = useState([]); // { id, url }
  const [selectedShot, setSelectedShot] = useState(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [facing, setFacing] = useState('user');

  const filter = FILTERS.find((item) => item.id === filterId) || FILTERS[0];

  /** Stop every track. Called on unmount and whenever the camera restarts. */
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode = facing) => {
      setStatus('starting');
      stopStream();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        setStatus('live');

        // One enumeration after permission: worth it for the flip button.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setHasMultipleCameras(devices.filter((device) => device.kind === 'videoinput').length > 1);
        } catch {
          setHasMultipleCameras(false);
        }
      } catch (error) {
        setStatus(error?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    },
    [facing, stopStream],
  );

  // Release the camera when the visitor leaves the section or the page.
  useEffect(() => stopStream, [stopStream]);

  function switchFacing() {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);

    if (status === 'live' || status === 'starting') startCamera(next);
  }

  /** Fire the capture after a 3-second countdown, with a shutter flash. */
  function captureWithCountdown() {
    if (countdown !== null) return;

    let remaining = 3;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining -= 1;

      if (remaining <= 0) {
        clearInterval(interval);
        setCountdown(null);
        setFlash(true);
        capture();
        window.setTimeout(() => setFlash(false), 430);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  /**
   * Draw the current video frame — filter, mirroring and frame overlay applied —
   * to an offscreen canvas and keep the result as a data URL.
   *
   * The polaroid frame enlarges the canvas (photo inset on a white sheet) so the
   * border is part of the downloaded file, not CSS dressing on the preview.
   */
  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth) return;

    const width = video.videoWidth;
    const height = video.videoHeight;

    const sheet = frameId === 'polaroid';
    const pad = sheet ? Math.round(width * 0.035) : 0;
    const bottom = sheet ? Math.round(height * 0.16) : 0;

    canvas.width = width + pad * 2;
    canvas.height = height + pad + bottom;

    const ctx = canvas.getContext('2d');

    if (sheet) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ctx.filter is supported everywhere current; where it is missing the photo
    // simply comes out unfiltered rather than failing.
    if ('filter' in ctx) ctx.filter = filter.css;

    ctx.save();

    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, pad, pad, width, height);
    ctx.restore();

    if ('filter' in ctx) ctx.filter = 'none';

    drawFrame(ctx, frameId, canvas.width, canvas.height, width, height, pad, bottom);

    const url = canvas.toDataURL('image/jpeg', 0.92);
    const shot = { id: `${Date.now()}`, url };

    setShots((current) => [shot, ...current].slice(0, MAX_SHOTS));
    setSelectedShot(shot.id);
  }

  function removeShot(id) {
    setShots((current) => current.filter((shot) => shot.id !== id));
    setSelectedShot((current) => (current === id ? null : current));
  }

  function clearShots() {
    setShots([]);
    setSelectedShot(null);
  }

  const selected = shots.find((shot) => shot.id === selectedShot) || null;

  return (
    <section id="studio" className="relative overflow-hidden bg-surface">
      {/* Shared backdrop treatment with the hero: same grid, quieter. */}
      <div className="hero-grid absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="orb right-[-12%] top-[-10%] size-[28rem] bg-brand-500/20" aria-hidden="true" />

      <div className="container-page relative py-16 lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <p className="mb-3 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-brand-600">
              <span className="accent-rule" aria-hidden="true" />
              Viral Studio
            </p>

            <h2 className="text-h2">See yourself in the campaign</h2>

            <p className="mt-4 text-lead text-ink-muted">
              The fastest pitch we give: start your camera, pick a look, and take a frame with our brand
              wrapped around it. That is what we do for yours — only with better lighting.
            </p>

            <ul className="mt-6 flex flex-col gap-2.5 text-sm text-ink-muted">
              <li className="flex items-start gap-2.5">
                <Aperture className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden="true" />
                Six graded looks, applied live
              </li>
              <li className="flex items-start gap-2.5">
                <Camera className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden="true" />
                Brand-bar and polaroid frames, baked into the download
              </li>
              <li className="flex items-start gap-2.5">
                <CameraOff className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden="true" />
                Nothing leaves your device — no upload, no storage, no account
              </li>
            </ul>
          </div>

          <div className="lg:col-span-8">
            <Booth
              refs={{ video: videoRef, canvas: canvasRef }}
              status={status}
              onStart={() => startCamera()}
              filterCss={filter.css}
              countdown={countdown}
              flash={flash}
              mirrored={mirrored}
              onToggleMirror={() => setMirrored((value) => !value)}
              hasMultipleCameras={hasMultipleCameras}
              onSwitchFacing={switchFacing}
              filterId={filterId}
              onFilterChange={setFilterId}
              frameId={frameId}
              onFrameChange={setFrameId}
              onCapture={captureWithCountdown}
              shots={shots}
              selected={selected}
              onSelect={setSelectedShot}
              onRemove={removeShot}
              onClear={clearShots}
              busy={countdown !== null}
            />
          </div>
        </div>
      </div>

      {/* Offscreen canvas: the visible artwork is the generated object URLs. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Booth                                                                       */
/* -------------------------------------------------------------------------- */

function Booth({
  refs,
  status,
  onStart,
  filterCss,
  countdown,
  flash,
  mirrored,
  onToggleMirror,
  hasMultipleCameras,
  onSwitchFacing,
  filterId,
  onFilterChange,
  frameId,
  onFrameChange,
  onCapture,
  shots,
  selected,
  onSelect,
  onRemove,
  onClear,
  busy,
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      {/* Viewfinder */}
      <div className="relative aspect-video overflow-hidden rounded-lg bg-brand-950 ring-1 ring-line">
        <video
          ref={refs.video}
          playsInline
          muted
          autoPlay
          className={cn(
            'size-full object-cover transition-opacity duration-300',
            mirrored && '-scale-x-100',
            status === 'live' ? 'opacity-100' : 'opacity-0',
          )}
          style={{ filter: filterCss }}
        />

        {/* Countdown */}
        {countdown !== null ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-brand-950/45">
            <span key={countdown} className="page-enter font-sans text-8xl font-extrabold text-white drop-shadow-lg">
              {countdown}
            </span>
          </div>
        ) : null}

        {/* Shutter flash */}
        {flash ? <div className="shutter-flash absolute inset-0 z-20 bg-white" aria-hidden="true" /> : null}

        {/* States shown instead of the stream */}
        {status !== 'live' ? (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-4 px-6 text-center">
            {status === 'starting' ? (
              <>
                <Aperture className="size-8 animate-spin text-white/70 [animation-duration:2.4s]" aria-hidden="true" />
                <p className="text-sm text-white/70">Waking the lens…</p>
              </>
            ) : status === 'denied' ? (
              <>
                <CameraOff className="size-8 text-white/70" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-white">Camera access was declined</p>
                  <p className="mt-1 text-xs text-white/60">
                    Allow the camera for this site in your browser's address bar, then press start again.
                  </p>
                </div>
                <StartButton onClick={onStart}>Try again</StartButton>
              </>
            ) : status === 'error' ? (
              <>
                <CameraOff className="size-8 text-white/70" aria-hidden="true" />
                <p className="text-sm text-white/70">
                  No camera was found. The studio needs a webcam or phone camera to run.
                </p>
                <StartButton onClick={onStart}>Try again</StartButton>
              </>
            ) : (
              <>
                <Camera className="size-8 text-white/70" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-white">The studio is waiting for you</p>
                  <p className="mt-1 text-xs text-white/60">
                    Your camera stays completely local — the stream is never sent anywhere.
                  </p>
                </div>
                <StartButton onClick={onStart}>
                  <Camera className="size-4" aria-hidden="true" />
                  Start camera
                </StartButton>
              </>
            )}
          </div>
        ) : null}

        {/* Viewfinder chrome, only while live */}
        {status === 'live' ? (
          <>
            <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-white/90">
              <span className="pulse-dot size-1.5 rounded-full bg-red-500" aria-hidden="true" />
              Live
            </span>

            <div className="absolute right-3 top-3 z-10 flex gap-2">
              {hasMultipleCameras ? (
                <BoothButton label="Switch camera" onClick={onSwitchFacing}>
                  <FlipHorizontal className="size-4" aria-hidden="true" />
                </BoothButton>
              ) : null}
              <BoothButton label={mirrored ? 'Unmirror preview' : 'Mirror preview'} onClick={onToggleMirror}>
                <span className={cn('block', mirrored && '-scale-x-100')} aria-hidden="true">
                  ⇄
                </span>
              </BoothButton>
            </div>

            {/* Rule-of-thirds guides */}
            <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">
              <div className="absolute inset-x-0 top-1/3 border-t border-white/10" />
              <div className="absolute inset-x-0 top-2/3 border-t border-white/10" />
              <div className="absolute inset-y-0 left-1/3 border-l border-white/10" />
              <div className="absolute inset-y-0 left-2/3 border-l border-white/10" />
            </div>
          </>
        ) : null}

        {/* Selected shot review */}
        {selected ? (
          <div className="absolute inset-0 z-30 flex flex-col bg-brand-950/92 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt="Your captured frame"
              className="min-h-0 flex-1 rounded-md object-contain"
            />
            <div className="mt-3 flex items-center justify-center gap-2.5">
              <a
                href={selected.url}
                download={`virallink-studio-${selected.id}.jpg`}
                className="btn-shine inline-flex h-9 items-center gap-2 rounded-md bg-accent-400 px-4 text-sm font-semibold text-brand-950 transition-colors hover:bg-accent-500"
              >
                <Download className="size-4" aria-hidden="true" />
                Download
              </a>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Back to camera
              </button>
              <button
                type="button"
                onClick={() => onRemove(selected.id)}
                aria-label="Discard this shot"
                className="inline-flex size-9 items-center justify-center rounded-md border border-white/25 text-white/80 transition-colors hover:border-danger hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col gap-3.5">
        <ControlRow label="Look">
          {FILTERS.map((item) => (
            <Chip key={item.id} active={filterId === item.id} onClick={() => onFilterChange(item.id)}>
              {item.label}
            </Chip>
          ))}
        </ControlRow>

        <ControlRow label="Frame">
          {FRAMES.map((item) => (
            <Chip key={item.id} active={frameId === item.id} onClick={() => onFrameChange(item.id)}>
              {item.label}
            </Chip>
          ))}
        </ControlRow>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3.5">
          <button
            type="button"
            onClick={onCapture}
            disabled={status !== 'live' || busy || Boolean(selected)}
            className={cn(
              'btn-shine inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent-400 px-6 text-sm font-bold uppercase tracking-wide text-brand-950 sm:flex-none',
              'transition-colors hover:bg-accent-500 disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            <Timer className="size-4" aria-hidden="true" />
            {busy ? 'Smile…' : 'Take the shot'}
          </button>

          {shots.length ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:border-danger/60 hover:text-danger"
            >
              <X className="size-4" aria-hidden="true" />
              Clear all
            </button>
          ) : null}
        </div>

        {/* Filmstrip */}
        {shots.length ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {shots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => onSelect(shot.id)}
                aria-label={`Open shot taken at ${shot.id}`}
                aria-pressed={selected?.id === shot.id}
                className={cn(
                  'relative size-20 shrink-0 overflow-hidden rounded-md ring-2 transition-all',
                  selected?.id === shot.id
                    ? 'ring-accent-400'
                    : 'ring-line hover:ring-border-strong',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StartButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-shine inline-flex h-11 items-center gap-2 rounded-md bg-accent-400 px-5 text-sm font-semibold text-brand-950 transition-colors hover:bg-accent-500"
    >
      {children}
    </button>
  );
}

function BoothButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-full bg-black/45 text-white/90 transition-colors hover:bg-black/70"
    >
      {children}
    </button>
  );
}

function ControlRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 shrink-0 font-mono text-[0.6875rem] uppercase tracking-wider text-ink-subtle">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition-all',
        active
          ? 'bg-accent-400 text-brand-950'
          : 'border border-line text-ink-muted hover:border-border-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Frame overlays                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Bake the chosen frame into the canvas. Coordinates are proportional to the
 * capture size so the frame looks identical at any resolution.
 */
function drawFrame(ctx, frameId, canvasWidth, canvasHeight, photoWidth, photoHeight, pad, bottom) {
  if (frameId === 'brand') {
    const barHeight = Math.round(photoHeight * 0.115);
    const barY = canvasHeight - barHeight;

    ctx.fillStyle = 'rgba(2, 82, 152, 0.94)';
    ctx.fillRect(0, barY, canvasWidth, barHeight);

    ctx.fillStyle = '#f9a71b';
    ctx.fillRect(0, barY - Math.max(2, photoHeight * 0.004), canvasWidth, Math.max(2, photoHeight * 0.004));

    const fontSize = Math.round(photoHeight * 0.042);
    ctx.font = `700 ${fontSize}px Sora, "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('V I R A L L I N K', canvasWidth / 2, barY + barHeight / 2);
  }

  if (frameId === 'polaroid') {
    ctx.fillStyle = '#0b0f14';

    const fontSize = Math.round(photoHeight * 0.045);
    ctx.font = `600 italic ${fontSize}px "Segoe Script", "Bradley Hand", cursive, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Virallink ✦', canvasWidth / 2, canvasHeight - bottom / 2);
  }
}
