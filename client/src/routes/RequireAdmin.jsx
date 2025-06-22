// src/routes/RequireAdmin.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RequireAdmin = ({ children }) => {
  const { isAdmin } = useAuth();  
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};

export default RequireAdmin;
