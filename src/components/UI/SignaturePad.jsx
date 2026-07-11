import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import styles from './SignaturePad.module.css';

// Hand-rolled canvas signature capture — no external dependency. Uses
// Pointer Events so mouse, touch and stylus all go through one code path.
// Renders at devicePixelRatio so strokes stay crisp on retina/mobile
// screens instead of blurring when the CSS size differs from canvas size.
export default function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const empty     = useRef(true);
  const [isEmpty, setIsEmpty] = useState(true);

  const getCtx = () => canvasRef.current?.getContext('2d');

  // Size the backing store to the element's actual rendered size × DPR,
  // so lines drawn at CSS coordinates land on the right canvas pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width  = width * dpr;
      canvas.height = height * dpr;
      const ctx = getCtx();
      ctx.scale(dpr, dpr);
      ctx.lineWidth   = 2;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.strokeStyle = '#1a2233';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    onChange?.(empty.current ? null : canvas.toDataURL('image/png'));
  }, [onChange]);

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointFromEvent(e);
    const ctx = getCtx();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pointFromEvent(e);
    const ctx = getCtx();
    ctx.lineTo(x, y);
    ctx.stroke();
    if (empty.current) { empty.current = false; setIsEmpty(false); }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emitChange();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    empty.current = true;
    setIsEmpty(true);
    onChange?.(null);
  };

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={[styles.canvas, disabled ? styles.canvasDisabled : ''].join(' ')}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      {isEmpty && <span className={styles.hint}>Sign here</span>}
      {!disabled && (
        <button type="button" className={styles.clearBtn} onClick={clear} disabled={isEmpty}>
          <ArrowUturnLeftIcon width={13} /> Clear
        </button>
      )}
    </div>
  );
}
