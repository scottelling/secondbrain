import { T } from '../lib/tokens';

function SettingRow({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: T.textDim,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 10,
          fontFamily: T.font,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export default SettingRow;
