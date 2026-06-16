import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

export default function AdminStudentHistory() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient(token).get(`/admin/students/${id}/history`)
      .then(r => setStudent(r.data))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;
  if (!student) return <><Navbar /><div className="empty-state"><p>Student not found</p></div></>;

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header">
            <button style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, marginBottom: 4 }} onClick={() => navigate(-1)}>← Back</button>
            <h1 className="page-title">{student.name}</h1>
            <p className="page-sub">Roll No: <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>{student.roll_no}</span> • {student.email}</p>
          </div>

          <div className="stats-row" style={{ marginBottom: 28 }}>
            <div className="stat-card"><div className="stat-value">{student.sessions?.length || 0}</div><div className="stat-label">Total Attempts</div></div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {student.sessions?.filter((s: any) => s.status === 'submitted').length || 0}
              </div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {student.sessions?.reduce((acc: number, s: any) => acc + (s.score || 0), 0)}
              </div>
              <div className="stat-label">Total Points</div>
            </div>
          </div>

          {student.conceptProgress && student.conceptProgress.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Concept Mastery</h2>
              <div className="table-wrap" style={{ marginBottom: 28 }}>
                <table>
                  <thead><tr><th>Concept</th><th>Questions Attempted</th><th>Correct Answers</th><th>Marks Scored</th><th>Accuracy</th></tr></thead>
                  <tbody>
                    {student.conceptProgress.map((c: any) => (
                      <tr key={c.conceptName}>
                        <td style={{ fontWeight: 600 }}>{c.conceptName}</td>
                        <td>{c.total}</td>
                        <td>{c.correct}</td>
                        <td>{c.score} / {c.totalMarks}</td>
                        <td>
                          <span className={`badge badge-${c.score / c.totalMarks >= 0.7 ? 'active' : 'draft'}`}>
                            {Math.round((c.score / c.totalMarks) * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Quiz History</h2>
          {student.sessions?.length === 0 ? (
            <div className="empty-state" style={{ background: 'var(--bg-surface)' }}><p>No quiz attempts found for this student.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Quiz</th><th>Started</th><th>Submitted</th><th>Status</th><th>Score</th><th></th></tr></thead>
                <tbody>
                  {student.sessions.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.quiz?.title}</td>
                      <td style={{ fontSize: 13 }}>{new Date(s.started_at).toLocaleString()}</td>
                      <td style={{ fontSize: 13 }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</td>
                      <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                      <td>{s.score !== null ? `${s.score}/${s.total_marks}` : '—'}</td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin/session/${s.id}`)}>View Report</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
