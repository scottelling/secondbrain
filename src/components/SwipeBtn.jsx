import { T } from '../lib/tokens';

function SwipeBtn({ icon, label, bg, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        background: bg,
        border: "none",
        cursor: "pointer",
        color,
        fontFamily: T.font,
        padding: 0,
        minHeight: 44,
      }}
    >
      {icon}
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
    </button>
  );
}

export default SwipeBtn;
