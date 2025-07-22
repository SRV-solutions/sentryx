import { useLocation } from 'react-router-dom';
import { useVideoPlayer } from '../context/VideoPlayerContext';
import ReactPlayer from 'react-player';
import { useState, useRef, useEffect } from 'react';
import { FaChevronUp, FaChevronDown, FaTimes, FaArrowRight } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const buttonContainerStyle = {
  position: 'absolute',
  top: 8,
  right: 10,
  display: 'flex',
  gap: '10px',
  zIndex: 11,
};

const buttonStyle = {
  background: 'rgba(0,0,0,0.6)',
  border: 'none',
  color: 'white',
  padding: '6px 10px',
  borderRadius: '12px',
  cursor: 'pointer',
  fontSize: '1.2rem',
  fontWeight: '600',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  transition: 'background-color 0.3s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const closeButtonStyle = {
  ...buttonStyle,
  background: 'rgba(255, 69, 58, 0.85)',
  boxShadow: '0 2px 8px rgba(255,69,58,0.6)',
};

const FloatingVideoPlayer = () => {
  const { videoData, clearVideoData } = useVideoPlayer();
  const { pathname } = useLocation();
  const isOnClassPage = /^\/curso\/[^/]+\/modulo\/[^/]+\/clase\/[^/]+$/.test(pathname);
  const navigate = useNavigate();
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const rafId = useRef(null);
  const lastPosition = useRef({ x: 0, y: 0 });

  const [isMinimized, setIsMinimized] = useState(true);
  const initialY = window.innerHeight - 180 - 20;
  const [position, setPosition] = useState({ x: 20, y: initialY });
  const [dragging, setDragging] = useState(false);

  // Actualiza posición en DOM usando requestAnimationFrame
  const updatePosition = (x, y) => {
    if (containerRef.current) {
      containerRef.current.style.left = `${x}px`;
      containerRef.current.style.top = `${y}px`;
    }
    lastPosition.current = { x, y };
  };
  useEffect(() => {
    if (!videoData?.classPath) return;

    const stored = localStorage.getItem('resumeTime');
    if (stored) {
      const { path, time } = JSON.parse(stored);
      if (videoData.classPath === path && playerRef.current) {
        playerRef.current.seekTo(time, 'seconds');
      }
    }
  }, [videoData?.classPath]);

  // Maneja movimiento del mouse con RAF para evitar múltiples renders
  const handleMouseMove = (e) => {
    if (!dragging) return;

    const newX = Math.min(
      Math.max(e.clientX - dragOffset.current.x, 0),
      window.innerWidth - (isMinimized ? 320 : 600)
    );
    const newY = Math.min(
      Math.max(e.clientY - dragOffset.current.y, 0),
      window.innerHeight - (isMinimized ? 180 : 340)
    );

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      updatePosition(newX, newY);
    });
  };

  const handleDragMouseDown = (e) => {
    // Para que no arrastre si clickeaste un botón (que tienen pointer-events: auto)
    if (e.target.closest('button')) return;

    e.preventDefault(); // Evitar selección azul

    setDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseUp = () => {
    setDragging(false);
    setPosition(lastPosition.current);
  };

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [dragging, isMinimized]);

  if (!videoData?.url || isOnClassPage) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: isMinimized ? '320px' : '600px',
        height: isMinimized ? '180px' : '340px',
        zIndex: 9999,
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
        backgroundColor: '#000',
        transition: dragging ? 'none' : 'all 0.3s ease',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      // Le ponemos el mouseDown a este div
      onMouseDown={handleDragMouseDown}
    >
      {/* Div que cubre todo para drag */}
      <div
        className="drag-handle"
        style={{
          position: 'absolute',
          inset: 0, // top:0; right:0; bottom:0; left:0;
          // Lo importante es que no interfiera con botones
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
      />

      <ReactPlayer
        ref={playerRef}
        url={videoData.url}
        onReady={() => {
          const stored = localStorage.getItem('resumeTime');
          if (stored) {
            const { path, time } = JSON.parse(stored);
            if (videoData.classPath === path && playerRef.current) {
              playerRef.current.seekTo(time, 'seconds');
            }
          }
        }}
        width="100%"
        height="100%"
        playing
        controls
        config={{
          file: {
            attributes: {
              controlsList: 'nodownload',
              onContextMenu: (e) => e.preventDefault(),
            },
          },
        }}
      />

      <div style={{ ...buttonContainerStyle, pointerEvents: 'auto' }}>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.8)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.6)')}
          aria-label="Minimizar/Maximizar video"
          title="Minimizar/Maximizar video"
          type="button"
        >
          {isMinimized ? <FaChevronUp /> : <FaChevronDown />}
        </button>

        <button
          onClick={() => clearVideoData()}
          style={closeButtonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 69, 58, 1)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 69, 58, 0.85)')}
          aria-label="Cerrar video"
          title="Cerrar video"
          type="button"
        >
          <FaTimes />
        </button>

        {videoData?.classPath && (
          <button
            onClick={() => {
              const currentTime = playerRef.current?.getCurrentTime?.();
              if (currentTime !== undefined) {
                localStorage.setItem('resumeTime', JSON.stringify({
                  path: videoData.classPath,
                  time: currentTime
                }));
              }
              navigate(videoData.classPath);
            }}
            style={{
              ...buttonStyle,
              background: 'rgba(0, 123, 255, 0.8)',
              boxShadow: '0 2px 8px rgba(0,123,255,0.6)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,123,255,1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,123,255,0.8)')}
            aria-label="Ir a clase"
            title="Ir a clase"
            type="button"
          >
            <FaArrowRight />
          </button>
        )}

      </div>
    </div>
  );
};

export default FloatingVideoPlayer;
