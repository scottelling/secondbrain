import { T } from '../lib/tokens';

function Stepper({ value, min, max, step, format, onChange }) {
  const canDec = value - step >= min - 0.001;
  const canInc = value + step <= max + 0.001;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={() => canDec && onChange(value - step)}
        style={{
          width: 44,
          height: 44,
          borderRadius: T.radiusSm,
          border: `1.5px solid ${canDec ? T.border : "transparent"}`,
          background: canDec ? "rgba(255,255,255,0.04)" : "transparent",
          color: canDec ? T.text : T.textFaint,
          fontSize: 20,
          cursor: canDec ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: T.font,
          transition: "all 0.12s",
        }}
      >
        −
      </button>
      <div
        style={{
          minWidth: 70,
          textAlign: "center",
          fontSize: 15,
          fontWeight: 600,
          fontFamily: T.font,
          color: T.text,
        }}
      >
        {format(value)}
      </div>
      <button
        onClick={() => canInc && onChange(value + step)}
        style={{
          width: 44,
          height: 44,
          borderRadius: T.radiusSm,
          border: `1.5px solid ${canInc ? T.border : "transparent"}`,
          background: canInc ? "rgba(255,255,255,0.04)" : "transparent",
          color: canInc ? T.text : T.textFaint,
          fontSize: 20,
          cursor: canInc ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: T.font,
          transition: "all 0.12s",
        }}
      >
        +
      </button>
    </div>
  );
}

export default Stepper;
