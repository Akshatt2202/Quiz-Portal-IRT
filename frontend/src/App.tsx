import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StudentDashboard from './pages/student/StudentDashboard';
import QuizPage from './pages/student/QuizPage';
import ResultPage from './pages/student/ResultPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminQuizDetail from './pages/admin/AdminQuizDetail';
import AdminSessionReport from './pages/admin/AdminSessionReport';
import AdminStudentHistory from './pages/admin/AdminStudentHistory';

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: 'student' | 'admin' }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loader-wrap"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  
  // Strict role check: if a student tries an admin-only route or vice-versa
  if (role && user.role !== role) {
    console.warn(`Access denied: Required role ${role}, but user is ${user.role}`);
    return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader-wrap"><div className="spinner" /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace /> : <RegisterPage />} />
      
      {/* Student Protected Routes */}
      <Route path="/" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/quiz/:sessionId" element={<ProtectedRoute role="student"><QuizPage /></ProtectedRoute>} />
      <Route path="/result/:sessionId" element={<ProtectedRoute role="student"><ResultPage /></ProtectedRoute>} />
      
      {/* Admin Protected Routes */}
      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/quiz/:quizId" element={<ProtectedRoute role="admin"><AdminQuizDetail /></ProtectedRoute>} />
      <Route path="/admin/session/:sessionId" element={<ProtectedRoute role="admin"><AdminSessionReport /></ProtectedRoute>} />
      <Route path="/admin/student/:id" element={<ProtectedRoute role="admin"><AdminStudentHistory /></ProtectedRoute>} />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <>
      <div className="video-background">
        <iframe
          src="https://www.youtube.com/embed/mk6lkgBQHeM?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&playlist=mk6lkgBQHeM"
          allow="autoplay; encrypted-media"
          allowFullScreen
        ></iframe>
      </div>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </>
  );
}
