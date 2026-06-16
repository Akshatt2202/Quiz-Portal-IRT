import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [tab, setTab] = useState<'available' | 'history'>('available');

  useEffect(() => {
    const api = apiClient(token);
    Promise.all([api.get('/quizzes'), api.get('/my-sessions')])
      .then(([q, s]) => { setQuizzes(q.data); setSessions(s.data); })
      .finally(() => setLoading(false));
  }, [token]);

  const startQuiz = async (quizId: string) => {
    setStarting(quizId);
    try {
      const api = apiClient(token);
      const { data } = await api.post('/sessions', { quizId });
      sessionStorage.setItem(`quiz_${data.session.id}`, JSON.stringify({ questions: data.questions, remaining_seconds: data.remaining_seconds }));
      navigate(`/quiz/${data.session.id}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to start quiz');
    } finally { setStarting(null); }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  if (loading) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">My Dashboard</h1>
            <p className="page-sub">View available quizzes and your history</p>
          </div>
          <div className="tabs">
            <button className={`tab ${tab === 'available' ? 'active' : ''}`} onClick={() => setTab('available')}>Available Quizzes ({quizzes.length})</button>
            <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>My History ({sessions.length})</button>
          </div>

          {tab === 'available' && (
            quizzes.length === 0 ? (
              <div className="empty-state"><p>No active quizzes right now. Check back later!</p></div>
            ) : (
              <div className="quiz-grid">
                {quizzes.map(q => (
                  <div key={q.id} className="quiz-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                      <h3>{q.title}</h3>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <p>{q.description || 'No description'}</p>
                    <div className="quiz-meta">
                      <span className="quiz-meta-item">⏱ {formatTime(q.duration_seconds)}</span>
                      <span className="quiz-meta-item">📝 {q._count?.questions || 0} questions</span>
                    </div>
                    <button
                      className="btn btn-primary w-full"
                      style={{ marginTop: 16 }}
                      onClick={() => startQuiz(q.id)}
                      disabled={starting === q.id}
                    >
                      {starting === q.id ? 'Starting...' : 'Start Quiz →'}
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'history' && (
            sessions.length === 0 ? (
              <div className="empty-state"><p>You haven't taken any quizzes yet.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Quiz</th><th>Started</th><th>Status</th><th>Score</th><th></th></tr></thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id}>
                        <td>{s.quiz?.title}</td>
                        <td>{new Date(s.started_at).toLocaleString()}</td>
                        <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                        <td>{s.score !== null ? `${s.score} / ${s.total_marks}` : '—'}</td>
                        <td>{(s.status === 'submitted' || s.status === 'expired') && <button className="btn btn-outline btn-sm" onClick={() => navigate(`/result/${s.id}`)}>View Result</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}
