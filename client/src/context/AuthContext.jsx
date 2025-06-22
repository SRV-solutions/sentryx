import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();
const apiUrl = import.meta.env.VITE_API_URL;

const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch (error) {
    return true;
  }
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')) || null);
  
  const isAdmin = user?.userData?.roleName === 'admin'; // 👈 Agregado

  // Validar token al montar
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    const token = storedUser?.token;

    if (!token || isTokenExpired(token)) {
      logout();
      if (window.location.pathname !== '/login') {
        navigate('/login');
      }
    }
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${apiUrl}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error('Error al iniciar sesión');

      const data = await res.json();
      localStorage.setItem('user', JSON.stringify(data));
      setUser(data);
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const authFetch = async (url, options = {}) => {
    const token = user?.token;
    if (!token) {
      logout();
      return null;
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
    }

    return res;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, authFetch, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
