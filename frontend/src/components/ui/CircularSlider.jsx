import { useMemo, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function CircularSlider({
  min = 5,
  max = 120,
  step = 5,
  value,
  onChange,
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const percent = (value - min) / (max - min);
  const circumference = 2 * Math.PI * 44;
  const dashOffset = circumference * (1 - percent);
  const marks = useMemo(() => [25, 50, 60].filter(mark => mark >= min && mark <= max), [max, min]);

  const updateFromPointer = event => {
    const rect = svgRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radians = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const degrees = (radians * 180) / Math.PI;
    const clockwiseFromTop = (degrees + 450) % 360;
    const raw = min + (clockwiseFromTop / 360) * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped, min, max));
  };

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        className="touch-none"
        height="180"
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          updateFromPointer(event);
        }}
        onPointerMove={event => {
          if (dragging) updateFromPointer(event);
        }}
        onPointerUp={() => setDragging(false)}
        viewBox="0 0 120 120"
        width="180"
      >
        <circle cx="60" cy="60" fill="white" r="54" stroke="#cbd5e1" strokeWidth="2" />
        <circle
          cx="60"
          cy="60"
          fill="none"
          r="44"
          stroke="#2563eb"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth="8"
          transform="rotate(-90 60 60)"
        />
        {marks.map(mark => {
          const angle = ((mark - min) / (max - min)) * 360 - 90;
          const radians = (angle * Math.PI) / 180;
          const x = 60 + Math.cos(radians) * 44;
          const y = 60 + Math.sin(radians) * 44;
          return <circle key={mark} cx={x} cy={y} fill="#0f172a" r="2" />;
        })}
        <text
          dominantBaseline="middle"
          fill="#0f172a"
          fontSize="18"
          fontWeight="700"
          textAnchor="middle"
          x="60"
          y="56"
        >
          {value}
        </text>
        <text
          dominantBaseline="middle"
          fill="#475569"
          fontSize="9"
          textAnchor="middle"
          x="60"
          y="72"
        >
          min
        </text>
      </svg>
    </div>
  );
}
