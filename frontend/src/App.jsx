import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, getStoredAuthState } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AddElder from './pages/AddElder';
import AddMedication from './pages/AddMedication';
import SimulateSms from './pages/SimulateSms';
import ManageElders from './pages/ManageElders';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function ProtectedRoute({ children }) {
  const { family, elder } = useAuth();
  const storedAuth = getStoredAuthState();
  const hasAuth = Boolean(family || elder || storedAuth.family || storedAuth.elder);

  return hasAuth ? children : <Navigate to="/" replace />;
}


function FamilyRoute({ children }) {
  const { family } = useAuth();
  const storedAuth = getStoredAuthState();
  return family || storedAuth.family ? children : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/add-elder"
        element={
          <ProtectedRoute>
            <AddElder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage-elders"
        element={
          <ProtectedRoute>
            <FamilyRoute>
              <ManageElders />
            </FamilyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/simulate-sms"
        element={
          <ProtectedRoute>
            <FamilyRoute>
              <SimulateSms />
            </FamilyRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/add-medication"
        element={
          <ProtectedRoute>
            <FamilyRoute>
              <AddMedication />
            </FamilyRoute>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;