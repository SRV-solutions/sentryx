import { Routes, Route, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProtectedRoute from './routes/ProtectedRoute';
import ChatSolvix from './components/ChatSolvix.jsx';
import Sidebar from './components/SideBar.jsx';
import './App.css';
import NotFound from './pages/NotFound.jsx'
import UserProfile from './pages/UserProfile.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import ClassDetail from './pages/ClassDetail.jsx';
import MyCourseDetail from './pages/MyCourseDetail.jsx';
import { useTheme } from './context/ThemeContext'; // Importa el contexto


const App = () => {
  const location = useLocation();
  const hideSidebar = location.pathname === '/login';
  const { darkMode } = useTheme(); // Usamos el contexto

  return (
    <div className={`app-container ${darkMode ? 'dark' : ''}`}>
      {!hideSidebar && <Sidebar />}
      <div className="main-content">
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatSolvix />
              </ProtectedRoute>
            }
          />
           <Route
            path="/curso"
            element={
              <ProtectedRoute>
                <MyCourseDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/curso/:courseId"
            element={
              <ProtectedRoute>
                <CourseDetail />
              </ProtectedRoute>
            }
          />

          <Route
            path="/curso/:courseId/modulo/:moduleId/clase/:classId"
            element={
              <ProtectedRoute>
                <ClassDetail />
              </ProtectedRoute>
            }
          />

          <Route path="/login/*" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
