import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProtectedRoute from './routes/ProtectedRoute';
import ChatSolvix from './components/ChatSolvix.jsx';
import Sidebar from './components/SideBar.jsx';
import './App.css';

const App = () => {
  const location = useLocation();
  const hideSidebar = location.pathname === '/login';

  return (
    <div className="app-container">
      {!hideSidebar && <Sidebar />}
      <div className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
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
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;
