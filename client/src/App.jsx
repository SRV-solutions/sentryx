/* 
import { Routes, Route, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProtectedRoute from './routes/ProtectedRoute';
import ChatSolvix from './components/Chat/ChatSolvix.jsx';
import Sidebar from './components/SideBar.jsx';
import './App.css';
import NotFound from './pages/NotFound.jsx'
import UserProfile from './pages/UserProfile.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import ClassDetail from './pages/ClassDetail.jsx';
import MyCourseDetail from './pages/MyCourseDetail.jsx';
import { useTheme } from './context/ThemeContext'; // Importa el contexto
import ReportBugButton from './components/ReportBugButton.jsx';
import FloatingVideoPlayer from './components/FloatingVideoPlayer.jsx';
import ManageUsers from './pages/adminPages/ManageUsers.jsx'
import RequireAdmin from './routes/RequireAdmin.jsx';
import AssignCourses from './pages/adminPages/AssignCourses.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import UserSearch from './pages/UserSearch.jsx';
import UserPublicProfile from './pages/UserPublicProfile.jsx';
import IAEmbeddingUploader from './pages/adminPages/IAEmbeddingUploader.jsx'
import AdminCourseList from './pages/adminPages/AdminCourseList.jsx';
import AdminCourseDetail from './pages/adminPages/AdminCourseDetail.jsx';
import FriendRequests from './components/FriendRequests.jsx';
import FriendList from './components/FriendList.jsx';
import Catalogue from './pages/Catalogue.jsx';
import CourseCatalogueDetail from './pages/CourseCatalogueDetail.jsx';
import Register from './pages/Register.jsx';
*/

// Mantenemos solo lo necesario para el estilo o contexto si es que lo usas para el fondo
import './App.css';

const App = () => {
  /* 
  const location = useLocation();
  const hideSidebar = location.pathname === '/register' || location.pathname === '/register/' || location.pathname === '/login' || location.pathname === '/login/' || location.pathname === '/forgot-password' || location.pathname === '/forgot-password/' || location.pathname === '/reset-password' || location.pathname === '/reset-password/';
  const { darkMode } = useTheme(); 
  const handleReport = () => {
    window.open('https://forms.gle/SnTBRPF3p7CEK6mb8', '_blank'); 
  };
  */

  // Estilos rápidos para centrar el mensaje
  const maintenanceStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    textAlign: 'center',
    padding: '20px',
    fontFamily: 'sans-serif'
  };

  return (
    <div style={maintenanceStyle}>
      <h1>🚧 Página en Mantenimiento 🚧</h1>
      <p>Estamos trabajando para mejorar tu experiencia. Volveremos pronto.</p>
    </div>
  );
};

export default App;
