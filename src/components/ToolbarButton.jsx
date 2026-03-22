import { T } from '../lib/tokens';

function ToolbarButton({ icon, label, onClick, color }) {
  return (
    <button
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "6px 14px",
        background: "none",
        border: "none",
        borderRadius: T.radiusSm,
        cursor: "pointer",
        color: color || T.textDim,
        minWidth: 52,
        minHeight: 44,
        justifyContent: "center",
        transition: "all 0.12s",
        fontFamily: T.font,
      }}
    >
      {icon}
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.5 }}>{label}</span>
    </button>
  );
}

export default ToolbarButton;
