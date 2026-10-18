import { Outlet } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { VideoPlayerProvider } from '../context/VideoPlayerContext';
import { ChatProvider } from '../context/ChatContext';
import FloatingVideoPlayer from '../components/FloatingVideoPlayer.jsx';
import '../App.css';

/**
 * Contenedor de las pantallas existentes (cursos, Solvix, comunidad, admin de cursos).
 * Se carga en diferido: las familias nunca descargan MUI ni el reproductor de video.
 */
export default function LegacyFrame() {
  const { darkMode } = useTheme();
  return (
    <VideoPlayerProvider>
      <ChatProvider>
        <div className={`legacy app-container ${darkMode ? 'dark' : ''}`} style={{ minHeight: 'auto', borderRadius: 14 }}>
          <div className="main-content">
            <Outlet />
          </div>
        </div>
        <FloatingVideoPlayer />
      </ChatProvider>
    </VideoPlayerProvider>
  );
}
