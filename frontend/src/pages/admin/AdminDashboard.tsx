import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

export default function AdminDashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'quizzes' | 'students'>('quizzes');
  const [form, setForm] = useState({ title: '', description: '', duration_seconds: 3600, shuffle_questions: false });
  const [saving, setSaving] = useState(false);

  const api = apiClient(token);

  const load = () => {
    Promise.all([api.get('/admin/quizzes'), api.get('/admin/students')])
      .then(([q, s]) => { setQuizzes(q.data); setStudents(s.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createQuiz = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/admin/quizzes', form);
      setShowModal(false); setForm({ title: '', description: '', duration_seconds: 3600, shuffle_questions: false });
      load();
    } catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    await api.put(`/admin/quizzes/${id}`, { status });
    load();
  };

  const deleteQuiz = async (id: string) => {
    if (!confirm('Delete this quiz? This will remove all sessions and data.')) return;
    await api.delete(`/admin/quizzes/${id}`);
    load();
  };

  const totalActive = quizzes.filter(q => q.status === 'active').length;
  const totalSessions = quizzes.reduce((a, q) => a + (q._count?.sessions || 0), 0);

  if (loading) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header flex justify-between items-center">
            <div><h1 className="page-title">Admin Dashboard</h1><p className="page-sub">Manage quizzes, students, and results</p></div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Quiz</button>
          </div>

          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{quizzes.length}</div><div className="stat-label">Total Quizzes</div></div>
            <div className="stat-card"><div className="stat-value" style={{ color: 'var(--success)' }}>{totalActive}</div><div className="stat-label">Active Quizzes</div></div>
            <div className="stat-card"><div className="stat-value">{students.length}</div><div className="stat-label">Registered Students</div></div>
            <div className="stat-card"><div className="stat-value">{totalSessions}</div><div className="stat-label">Total Attempts</div></div>
          </div>

          <div className="tabs">
            <button className={`tab ${tab === 'quizzes' ? 'active' : ''}`} onClick={() => setTab('quizzes')}>Quizzes</button>
            <button className={`tab ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}>Students</button>
          </div>

          {tab === 'quizzes' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Duration</th><th>Questions</th><th>Attempts</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {quizzes.map(q => (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 600 }}>{q.title}</td>
                      <td>{Math.floor(q.duration_seconds / 60)}m</td>
                      <td>{q._count?.questions || 0}</td>
                      <td>{q._count?.sessions || 0}</td>
                      <td><span className={`badge badge-${q.status}`}>{q.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/quiz/${q.id}`)}>Manage</button>
                          {q.status === 'draft' && <button className="btn btn-success btn-sm" onClick={() => updateStatus(q.id, 'active')}>Activate</button>}
                          {q.status === 'active' && <button className="btn btn-outline btn-sm" onClick={() => updateStatus(q.id, 'closed')}>Close</button>}
                          <button className="btn btn-danger btn-sm" onClick={() => deleteQuiz(q.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'students' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Roll No</th><th>Name</th><th>Email</th><th>Quizzes Taken</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{s.roll_no || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ color: 'var(--text-2)' }}>{s.email}</td>
                      <td>{s._count?.sessions || 0}</td>
                      <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/student/${s.id}`)}>History</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Create New Quiz</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={createQuiz} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group"><label className="label">Title *</label><input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Physics Chapter 3" /></div>
              <div className="form-group"><label className="label">Description</label><textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" /></div>
              <div className="form-group"><label className="label">Duration (minutes)</label><input className="input" type="number" min={1} value={form.duration_seconds / 60} onChange={e => setForm(f => ({ ...f, duration_seconds: parseInt(e.target.value) * 60 }))} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="shuffle" checked={form.shuffle_questions} onChange={e => setForm(f => ({ ...f, shuffle_questions: e.target.checked }))} />
                <label htmlFor="shuffle" style={{ fontSize: 14, cursor: 'pointer', color: 'var(--text-2)' }}>Shuffle questions for each student</label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-outline w-full" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Creating...' : 'Create Quiz'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
