import { T } from '../lib/tokens';

function FilterChip({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 10px",
        borderRadius: 16,
        border: `1.5px solid ${active ? color : T.border}`,
        background: active ? `${color}18` : "transparent",
        color: active ? color : T.textDim,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        fontFamily: T.font,
        cursor: "pointer",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export default FilterChip;
