import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

export default function AdminQuizDetail() {
  const { quizId } = useParams<{ quizId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [tab, setTab] = useState<'questions' | 'results'>('questions');
  const [showQModal, setShowQModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editQ, setEditQ] = useState<any>(null);
  const [qForm, setQForm] = useState({
    text: '',
    options: [
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' }
    ],
    correct_option: 'A',
    marks: 1,
    order_index: 0,
    conceptIds: [] as string[]   // ← change
  });
  const api = apiClient(token);

  const load = async () => {
    const [q, s, c] = await Promise.all([api.get(`/admin/quizzes/${quizId}`), api.get(`/admin/quizzes/${quizId}/sessions`), api.get('/admin/concepts')]);
    setQuiz(q.data); setSessions(s.data); setConcepts(c.data);
  };

  useEffect(() => { load(); }, []);

  const openAddQ = () => { setEditQ(null); setQForm({ text: '', options: [{ id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }], correct_option: 'A', marks: 1, order_index: quiz?.questions?.length || 0, conceptIds: [] }); setShowQModal(true); };
  const openEditQ = (q: any) => {
    setEditQ(q);
    setQForm({
      text: q.text,
      options: q.options,
      correct_option: q.correct_option,
      marks: q.marks,
      order_index: q.order_index,
      conceptIds: q.concepts?.map((c: any) => c.id) || []   // ← important
    });
    setShowQModal(true);
  };
  const saveQuestion = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editQ) await api.put(`/admin/questions/${editQ.id}`, qForm);
      else await api.post(`/admin/quizzes/${quizId}/questions`, qForm);
      setShowQModal(false); load();
    } catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteQ = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    await api.delete(`/admin/questions/${id}`); load();
  };

  if (!quiz) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header flex justify-between items-center">
            <div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, marginBottom: 4 }} onClick={() => navigate('/admin')}>← Back</button>
              <h1 className="page-title">{quiz.title}</h1>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
                <span className={`badge badge-${quiz.status}`}>{quiz.status}</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>⏱ {Math.floor(quiz.duration_seconds / 60)} min</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>📝 {quiz.questions?.length} questions</span>
              </div>
            </div>
            {tab === 'questions' && <button className="btn btn-primary" onClick={openAddQ}>+ Add Question</button>}
          </div>

          <div className="tabs">
            <button className={`tab ${tab === 'questions' ? 'active' : ''}`} onClick={() => setTab('questions')}>Questions ({quiz.questions?.length})</button>
            <button className={`tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>Student Attempts ({sessions.length})</button>
          </div>

          {tab === 'questions' && (
            quiz.questions?.length === 0 ? (
              <div className="empty-state"><p>No questions yet. Add your first question!</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {quiz.questions?.map((q: any, i: number) => (
                  <div key={q.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
                          Q{i + 1} · {q.marks} mark{q.marks > 1 ? 's' : ''}
                          {q.concepts && q.concepts.length > 0 && <span style={{ marginLeft: 8, display: 'inline-flex', gap: 4 }}>{q.concepts.map((c: any) => <span key={c.id} style={{ background: 'var(--primary-light)', color: 'white', padding: '2px 6px', borderRadius: 4, opacity: 0.8, fontSize: 11 }}>{c.name}</span>)}</span>}
                        </div>
                        <div style={{ fontWeight: 500, marginBottom: 12 }}>{q.text}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {(q.options as any[]).map((opt: any) => (
                            <div key={opt.id} style={{ padding: '6px 12px', borderRadius: 6, background: opt.id === q.correct_option ? 'rgba(16,185,129,0.1)' : 'var(--bg-surface)', border: `1px solid ${opt.id === q.correct_option ? 'var(--success)' : 'var(--border)'}`, fontSize: 13, color: opt.id === q.correct_option ? 'var(--success)' : 'var(--text-2)' }}>
                              <strong>{opt.id}.</strong> {opt.text} {opt.id === q.correct_option && '✓'}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginLeft: 16 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditQ(q)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteQ(q.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'results' && (
            sessions.length === 0 ? (
              <div className="empty-state"><p>No attempts yet.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Email</th><th>Started</th><th>Submitted</th><th>Status</th><th>Score</th><th></th></tr></thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.student?.name}</td>
                        <td style={{ color: 'var(--text-2)' }}>{s.student?.email}</td>
                        <td style={{ fontSize: 13 }}>{new Date(s.started_at).toLocaleString()}</td>
                        <td style={{ fontSize: 13 }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</td>
                        <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                        <td>{s.score !== null ? `${s.score}/${s.total_marks}` : '—'}</td>
                        <td><button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/session/${s.id}`)}>Report</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {showQModal && (
        <div className="modal-overlay" onClick={() => setShowQModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editQ ? 'Edit Question' : 'Add Question'}</span>
              <button className="modal-close" onClick={() => setShowQModal(false)}>✕</button>
            </div>
            <form onSubmit={saveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group"><label className="label">Question Text *</label><textarea className="input" required value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))} placeholder="Enter your question..." /></div>
              {qForm.options.map((opt, i) => (
                <div key={opt.id} className="form-group">
                  <label className="label">Option {opt.id}</label>
                  <input className="input" required value={opt.text} onChange={e => { const opts = [...qForm.options]; opts[i] = { ...opts[i], text: e.target.value }; setQForm(f => ({ ...f, options: opts })); }} placeholder={`Enter option ${opt.id}`} />
                </div>
              ))}
              <div className="form-group">
                <label className="label">Correct Answer</label>
                <select className="input" value={qForm.correct_option} onChange={e => setQForm(f => ({ ...f, correct_option: e.target.value }))}>
                  {qForm.options.map(o => <option key={o.id} value={o.id}>Option {o.id}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="label">Marks</label><input className="input" type="number" min={1} value={qForm.marks} onChange={e => setQForm(f => ({ ...f, marks: parseInt(e.target.value) }))} /></div>
              <div className="form-group">
                <label className="label">Concepts (Multi-select)</label>
                <select
                  multiple
                  className="input"
                  style={{ height: 100 }}
                  value={qForm.conceptIds}
                  onChange={e => {
                    const values = Array.from(e.target.selectedOptions).map(o => o.value);
                    setQForm(f => ({ ...f, conceptIds: values }));
                  }}
                >
                  {concepts.map(c => (
                    <option key={c.concept_id} value={c.concept_id}>
                      {c.concept_name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-outline w-full" onClick={() => setShowQModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Saving...' : 'Save Question'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
