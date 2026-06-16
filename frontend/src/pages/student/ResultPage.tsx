import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

export default function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient(token).get(`/my-sessions`)
      .then(r => {
        const s = r.data.find((x: any) => x.id === sessionId);
        setSession(s);
      })
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  if (loading) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;
  if (!session) return <><Navbar /><div className="empty-state"><p>Session not found.</p></div></>;

  const pct = session.total_marks ? Math.round((session.score / session.total_marks) * 100) : 0;
  const grade = pct >= 80 ? '🏆 Excellent!' : pct >= 60 ? '👍 Good job!' : pct >= 40 ? '📚 Keep practicing!' : '💪 Don\'t give up!';

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="result-card">
            <div style={{ fontSize: 48, marginBottom: 16 }}>{pct >= 60 ? '🎉' : '📋'}</div>
            <div className="result-score">{session.score}<span style={{ fontSize: 32, opacity: 0.5 }}>/{session.total_marks}</span></div>
            <div className="result-label">Your Score</div>
            <div style={{ margin: '12px 0', fontSize: 28, fontWeight: 700, color: 'var(--primary-light)' }}>{pct}%</div>
            <div style={{ fontSize: 16, color: 'var(--text-2)', marginBottom: 24 }}>{grade}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Quiz</span><span>{session.quiz?.title}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Status</span><span className={`badge badge-${session.status}`}>{session.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Submitted at</span>
                <span>{session.submitted_at ? new Date(session.submitted_at).toLocaleString() : '—'}</span>
              </div>
            </div>
            <button className="btn btn-primary w-full" onClick={() => navigate('/')}>← Back to Dashboard</button>
          </div>
        </div>
      </div>
    </>
  );
}
