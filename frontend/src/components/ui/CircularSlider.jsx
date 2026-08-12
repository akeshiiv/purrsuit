import { useRef, useState } from 'react';

// The session dial: a conic-gradient arc over a track ring, with the value
// reading out in the cream well inside it. Three ways to drive it — drag the
// ring, arrow keys, or the +/- and preset buttons the caller renders alongside.
// The arc sweeps clockwise from 12 o'clock, which is where `conic-gradient`
// starts and where the pointer maths below measures from.
const ARC = '#E9A62C';
const TRACK = '#EFE0C2';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Snap to the step grid measured from `min`, so a 5-120/5 dial can never land
// on a value the +/- buttons could not also reach.
function snap(value, min, step) {
  return min + Math.round((value - min) / step) * step;
}

export default function CircularSlider({
  min = 5,
  max = 120,
  step = 5,
  value,
  onChange,
  size = 270,
  ring = 16,
  label = 'Session length in minutes',
  unit = 'minutes',
}) {
  const dialRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const fraction = (clamp(value, min, max) - min) / (max - min);
  const arcDegrees = Math.round(fraction * 360);

  const commit = next => {
    const stepped = clamp(snap(next, min, step), min, max);
    if (stepped !== value) onChange(stepped);
  };

  // Angle from the dial's centre, measured clockwise from the top.
  const angleFromPointer = event => {
    const rect = dialRef.current.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { clockwiseFromTop: (degrees + 450) % 360, distance: Math.hypot(dx, dy) };
  };

  const updateFromPointer = event => {
    const { clockwiseFromTop } = angleFromPointer(event);
    commit(min + (clockwiseFromTop / 360) * (max - min));
  };

  const onKeyDown = event => {
    const jump = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
    if (event.key in jump) {
      event.preventDefault();
      commit(value + jump[event.key]);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      commit(min);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      commit(max);
    }
  };

  return (
    <div
      ref={dialRef}
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      aria-valuetext={`${value} ${unit}`}
      className="touch-none rounded-full shadow-[0_8px_0_var(--color-warm-deep)] focus-visible:[outline:3px_solid_var(--color-edge-strong)] focus-visible:[outline-offset:6px]"
      onKeyDown={onKeyDown}
      onPointerDown={event => {
        // Only the arc band grabs. The well inside holds the readout, and a
        // press there would otherwise fling the value to wherever the number
        // happens to sit relative to the centre.
        const { distance } = angleFromPointer(event);
        if (distance < size / 2 - ring) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        updateFromPointer(event);
      }}
      onPointerMove={event => {
        if (dragging) updateFromPointer(event);
      }}
      onPointerCancel={() => setDragging(false)}
      onPointerUp={() => setDragging(false)}
      role="slider"
      style={{
        width: size,
        height: size,
        padding: ring,
        background: `conic-gradient(${ARC} ${arcDegrees}deg, ${TRACK} ${arcDegrees}deg)`,
        cursor: dragging ? 'grabbing' : 'pointer',
      }}
      tabIndex={0}
    >
      <div className="flex size-full flex-col items-center justify-center rounded-full border-3 border-edge-soft bg-raised select-none">
        <span className="p-nums text-[72px] leading-none text-ink">{value}</span>
        <span className="text-[13px] font-extrabold tracking-[.16em] text-ink-muted-soft uppercase">
          {unit}
        </span>
      </div>
    </div>
  );
}
