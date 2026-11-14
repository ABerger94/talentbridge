import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const VIEW = 280; // crop area on screen, px
const OUT = 512; // saved photo, px
const MAX_ZOOM = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The average color around a photo's edges (usually its backdrop), used to
// fill the square when the photo is zoomed out to fit.
function edgeColor(el) {
  try {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext("2d");
    ctx.drawImage(el, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        if (x > 1 && x < 22 && y > 1 && y < 22) continue; // edges only
        const i = (y * 24 + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1;
      }
    }
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return "#ffffff";
  }
}

// Crop a photo to a square: drag to position, zoom with the slider, mouse
// wheel, pinch, or keyboard. The round guide matches how the photo shows on
// the profile. onSave receives a 512x512 JPEG data URL.
export default function PhotoCropDialog({ src, open, onOpenChange, onSave, saving }) {
  const [img, setImg] = useState(null); // { el, w, h, fill }
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside the crop area
  const [error, setError] = useState("");
  const viewRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  // Zoom 1 = the photo just covers the square. Below 1 the whole photo fits
  // (zoomed out), with the leftover space filled in its background color.
  const baseScale = img ? VIEW / Math.min(img.w, img.h) : 1;
  const minZoom = img ? Math.min(img.w, img.h) / Math.max(img.w, img.h) : 1;
  const scale = baseScale * zoom;

  // Along each side: if the photo is bigger than the square, it must cover it
  // (no gaps); if smaller (zoomed out), it stays centered.
  const clampPos = useCallback((p, s) => {
    if (!img) return p;
    const axis = (v, size) => (size >= VIEW ? clamp(v, VIEW - size, 0) : (VIEW - size) / 2);
    return { x: axis(p.x, img.w * s), y: axis(p.y, img.h * s) };
  }, [img]);

  // Where a photo starts: centered, except tall (portrait) photos start near
  // the top, where the face almost always is, so heads aren't cut off.
  const startPos = (w, h) => {
    const s = VIEW / Math.min(w, h);
    const x = (VIEW - w * s) / 2;
    const y = h > w * 1.1 ? -Math.min(h * s - VIEW, h * s * 0.05) : (VIEW - h * s) / 2;
    return { x, y };
  };

  useEffect(() => {
    if (!open || !src) return undefined;
    setImg(null);
    setError("");
    const el = new Image();
    el.onload = () => {
      const w = el.naturalWidth;
      const h = el.naturalHeight;
      setImg({ el, w, h, fill: edgeColor(el) });
      setZoom(1);
      setPos(startPos(w, h));
    };
    el.onerror = () => setError("That image couldn’t be read. Try a JPG or PNG.");
    el.src = src;
    return () => { el.onload = null; el.onerror = null; };
  }, [open, src]);

  // Latest zoom and position, for events that arrive between renders
  // (wheel, pinch).
  const zoomRef = useRef(zoom);
  const posRef = useRef(pos);
  zoomRef.current = zoom;
  posRef.current = pos;

  // Zoom around a point in the crop area (default: its center), keeping that
  // point of the photo under the same spot.
  const zoomTo = useCallback((next, cx = VIEW / 2, cy = VIEW / 2) => {
    if (!img) return;
    const z = clamp(next, minZoom, MAX_ZOOM);
    const prevS = baseScale * zoomRef.current;
    const nextS = baseScale * z;
    const p = posRef.current;
    const ix = (cx - p.x) / prevS;
    const iy = (cy - p.y) / prevS;
    const np = clampPos({ x: cx - ix * nextS, y: cy - iy * nextS }, nextS);
    zoomRef.current = z;
    posRef.current = np;
    setZoom(z);
    setPos(np);
  }, [img, baseScale, minZoom, clampPos]);

  // Mouse wheel zoom (a non-passive listener, so the page doesn't scroll).
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, img]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const r = viewRef.current.getBoundingClientRect();
      zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    setPos((p) => clampPos({ x: p.x + now.x - prev.x, y: p.y + now.y - prev.y }, scale));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 30 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setPos((p) => clampPos({ x: p.x + dx, y: p.y + dy }, scale));
    } else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(zoom + 0.1); } else if (e.key === "-") { e.preventDefault(); zoomTo(zoom - 0.1); }
  };
  const reset = () => {
    if (!img) return;
    setZoom(1);
    setPos(startPos(img.w, img.h));
  };

  const save = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    // Exactly what's in the crop area: the backdrop color (visible only when
    // zoomed out), then the photo at its on-screen position and size.
    const k = OUT / VIEW;
    ctx.fillStyle = img.fill;
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img.el, pos.x * k, pos.y * k, img.w * scale * k, img.h * scale * k);
    onSave(canvas.toDataURL("image/jpeg", 0.88));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
          <DialogDescription>Drag the photo to position it, and zoom in or out so your head and shoulders fit the circle.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            ref={viewRef}
            role="application"
            aria-label="Photo crop area. Drag or use the arrow keys to move the photo; plus and minus to zoom."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="relative overflow-hidden rounded-xl bg-secondary cursor-grab active:cursor-grabbing select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary touch-none"
            style={{ width: VIEW, height: VIEW, backgroundColor: img?.fill }}
            data-testid="crop-area"
          >
            {img ? (
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{ left: pos.x, top: pos.y, width: img.w * scale, height: img.h * scale }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
                {error || <Loader2 className="w-5 h-5 animate-spin" />}
              </div>
            )}
            {/* Dim everything outside the circle the profile shows. */}
            <div className="absolute inset-0 pointer-events-none rounded-full" style={{ boxShadow: "0 0 0 9999px rgba(15, 12, 35, 0.55)" }} />
            <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/90" />
          </div>
          <div className="flex items-center gap-3 w-full max-w-[280px]">
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Zoom out" onClick={() => zoomTo(zoom - 0.2)} disabled={!img}><ZoomOut className="w-4 h-4" /></button>
            <Slider aria-label="Zoom" aria-valuetext={`${Math.round(zoom * 100)}%`} min={minZoom} max={MAX_ZOOM} step={0.01} value={[zoom]} onValueChange={([z]) => zoomTo(z)} disabled={!img} className="flex-1" />
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Zoom in" onClick={() => zoomTo(zoom + 0.2)} disabled={!img}><ZoomIn className="w-4 h-4" /></button>
          </div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={reset} disabled={!img || saving}><RotateCcw className="w-3.5 h-3.5" /> Reset</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={save} disabled={!img || saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save photo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
