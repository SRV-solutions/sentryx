import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { VideoPlayerProvider } from './context/VideoPlayerContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import './global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <ThemeProvider>
        <VideoPlayerProvider>
          <App />
        </VideoPlayerProvider>
      </ThemeProvider>
    </AuthProvider>
  </BrowserRouter>
);
