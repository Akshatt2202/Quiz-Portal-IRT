import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span className="navbar-brand">⚡ QuizPortal</span>
        {user?.role === 'admin' && (
          <a href="/admin" style={{ color: 'var(--text-2)', fontSize: 13, textDecoration: 'none', fontWeight: 500, opacity: 0.8 }}>Admin Dashboard</a>
        )}
      </div>
      <div className="navbar-actions">
        <span className="navbar-user">👤 {user?.name} <span style={{opacity:0.5}}>({user?.role})</span></span>
        <button className="btn btn-outline btn-sm" onClick={logout}>Logout</button>
      </div>
    </nav>
  );
}
