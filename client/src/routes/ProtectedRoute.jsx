import { useAuth } from '../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  const publicRoutes = ['/reset-password', '/forgot-password', '/login'];

  const isPublicRoute = publicRoutes.some(route => location.pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
