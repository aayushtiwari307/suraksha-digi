import { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

const readStoredUser = (key) => {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const getStoredAuthState = () => ({
  family: readStoredUser('familyData'),
  elder: readStoredUser('elderData')
});

export const AuthProvider = ({ children }) => {
  const [family, setFamily] = useState(() => getStoredAuthState().family);
  const [elder, setElder] = useState(() => getStoredAuthState().elder);

  const login = (token, familyData) => {
    localStorage.setItem('familyToken', token);
    localStorage.setItem('familyData', JSON.stringify(familyData));
    localStorage.removeItem('elderToken');
    localStorage.removeItem('elderData');
    setFamily(familyData);
    setElder(null);
  };

  const elderLogin = (token, elderData) => {
    localStorage.setItem('elderToken', token);
    localStorage.setItem('elderData', JSON.stringify(elderData));
    localStorage.removeItem('familyToken');
    localStorage.removeItem('familyData');
    setElder(elderData);
    setFamily(null);
  };

  const logout = () => {
    localStorage.removeItem('familyToken');
    localStorage.removeItem('familyData');
    localStorage.removeItem('elderToken');
    localStorage.removeItem('elderData');
    setFamily(null);
    setElder(null);
  };

  const currentUser = family || elder;
  const userRole = family ? 'family' : elder ? 'elder' : null;

  return (
    <AuthContext.Provider value={{ family, elder, currentUser, userRole, login, elderLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);