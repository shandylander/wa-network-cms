import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

/**
 * Shared PIN entry row — N single-digit password boxes with focus advance,
 * backspace retreat, and digit-only paste. Owns its digit state internally
 * and reports the concatenated value upward on every change, so callers
 * only hold a plain string. Visuals come from the caller's own CSS module
 * via `classes` ({ pinRow, pinBox }) so each screen keeps its exact look.
 *
 * Ref exposes { clear(), focus() } for post-submit resets.
 * `onComplete(value)` fires when every box is filled — used by the change
 * forms to hop focus to the next PIN group.
 */
const PinBoxes = forwardRef(function PinBoxes(
  { length = 6, onChange, onComplete, disabled = false, autoComplete = 'off', classes, ariaLabel = 'PIN', autoFocus = false },
  ref,
) {
  const [digits, setDigits] = useState(() => Array(length).fill(''));
  const boxRefs = useRef([]);

  useEffect(() => {
    if (autoFocus) boxRefs.current[0]?.focus();
  }, [autoFocus]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      setDigits(Array(length).fill(''));
      boxRefs.current[0]?.focus();
    },
    focus: () => boxRefs.current[0]?.focus(),
  }), [length]);

  const emit = (next) => {
    setDigits(next);
    const value = next.join('');
    onChange?.(value);
    if (onComplete && next.every(d => d !== '')) onComplete(value);
  };

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    emit(next);
    if (val && i < length - 1) boxRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    const next = Array(length).fill('');
    text.split('').forEach((ch, i) => { next[i] = ch; });
    emit(next);
    boxRefs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div className={classes.pinRow} onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { boxRefs.current[i] = el; }}
          className={classes.pinBox}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          autoComplete={i === 0 ? autoComplete : 'off'}
          disabled={disabled}
          aria-label={`${ariaLabel} digit ${i + 1}`}
        />
      ))}
    </div>
  );
});

export default PinBoxes;
