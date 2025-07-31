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

const App = () => {
  const location = useLocation();
  const hideSidebar = location.pathname === '/login' || location.pathname === '/login/' || location.pathname === '/forgot-password' || location.pathname === '/forgot-password/' || location.pathname === '/reset-password' || location.pathname === '/reset-password/';
  const { darkMode } = useTheme(); // Usamos el contexto
  const handleReport = () => {
    // Acá podés abrir un modal, redireccionar a un formulario o abrir un mail
    window.open('https://forms.gle/SnTBRPF3p7CEK6mb8', '_blank'); // ejemplo
  };

  return (
    <div className={`app-container ${darkMode ? 'dark' : ''}`}>
      {!hideSidebar && <Sidebar />}
      <div className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<NotFound />} />
          <Route
            path="/admin/usuarios"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <ManageUsers />
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute>
                <UserSearch />
              </ProtectedRoute>
            }
          />
          <Route
            path="/friends/requests"
            element={
              <ProtectedRoute>
                <FriendRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/catalogue"
            element={
              <ProtectedRoute>
                <Catalogue />
              </ProtectedRoute>
            }
          />
          <Route
            path="/catalogue/curso/:courseId"
            element={
              <ProtectedRoute>
                <CourseCatalogueDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-friends"
            element={
              <ProtectedRoute>
                <FriendList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/asignar-cursos/:userId"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <AssignCourses />
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/solvix"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <IAEmbeddingUploader />
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cursos"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <AdminCourseList />
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cursos/:courseId"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <AdminCourseDetail />
                </RequireAdmin>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil/:id"
            element={
              <ProtectedRoute>
                <UserPublicProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil/me"
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:id"
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
        </Routes>
        <ReportBugButton onClick={handleReport} />
        <FloatingVideoPlayer />
      </div>
    </div>
  );
};

export default App;
