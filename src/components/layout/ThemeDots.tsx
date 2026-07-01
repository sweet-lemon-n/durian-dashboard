import { useTheme, THEMES, type Theme } from '@/stores/ThemeContext';

const DOT_COLORS: Record<Theme, string> = {
  forest: '#4ade80',
  ocean: '#38bdf8',
  amber: '#f5c451',
  slate: '#e6edf3',
  violet: '#c2ef4e',
};

export function ThemeDots() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2vh',
        right: '2vw',
        display: 'flex',
        gap: '1.2vh',
        zIndex: 1000,
        padding: '1vh 1.5vw',
        borderRadius: '2vh',
        background: 'rgba(0,0,0,0.4)',
      }}
    >
      {THEMES.map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          title={t}
          style={{
            width: '2vh',
            height: '2vh',
            borderRadius: '50%',
            background: DOT_COLORS[t],
            border: theme === t ? '2px solid #fff' : '2px solid transparent',
            cursor: 'pointer',
            padding: 0,
            transform: theme === t ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.2s, border 0.2s',
          }}
        />
      ))}
    </div>
  );
}
