export function BootIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ fontSize: size, lineHeight: 1 }}
      role="img"
      aria-label="boot"
    >
      🥾
    </span>
  );
}
