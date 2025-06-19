import { createContext, useContext, useState } from 'react';

const VideoPlayerContext = createContext();

export const VideoPlayerProvider = ({ children }) => {
  const [videoData, setVideoData] = useState(null); // { url, title, subtitlePath }
  const clearVideoData = () => setVideoData(null);  
  
  return (
    <VideoPlayerContext.Provider value={{ videoData, setVideoData, clearVideoData }}>
      {children}
    </VideoPlayerContext.Provider>
  );
};

export const useVideoPlayer = () => useContext(VideoPlayerContext);