import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

export default function AdminSessionReport() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient(token).get(`/admin/sessions/${sessionId}/report`)
      .then(r => setReport(r.data))
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  const fmtMs = (ms: number | bigint) => {
    const s = Number(ms) / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
  };

  if (loading) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;
  if (!report) return <><Navbar /><div className="empty-state"><p>Report not found</p></div></>;

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="page-header">
            <button style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, marginBottom: 4 }} onClick={() => navigate(-1)}>← Back</button>
            <h1 className="page-title">Session Report</h1>
            <p className="page-sub">
              {report.student?.name} — Roll No: <span style={{ color: 'var(--primary-light)', fontWeight: 600 }}>{report.student?.roll_no}</span> ({report.student?.email}) • {report.quiz?.title}
            </p>
          </div>

          <div className="stats-row" style={{ marginBottom: 28 }}>
            <div className="stat-card"><div className="stat-value" style={{ color: 'var(--primary-light)' }}>{report.score}/{report.total_marks}</div><div className="stat-label">Score</div></div>
            <div className="stat-card"><div className="stat-value">{report.status}</div><div className="stat-label">Status</div></div>
            <div className="stat-card"><div className="stat-value">{report.submitted_at ? new Date(report.submitted_at).toLocaleTimeString() : '—'}</div><div className="stat-label">Submitted At</div></div>
            <div className="stat-card"><div className="stat-value">{report.answers?.filter((a: any) => a.is_correct).length}/{report.answers?.length}</div><div className="stat-label">Correct Answers</div></div>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Per-Question Breakdown</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Student's Answer</th>
                  <th>Correct</th>
                  <th>Time Spent</th>
                  <th>Visits</th>
                  <th>Changes</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                  {report.answers?.map((a: any, i: number) => {
                    const opts = a.question?.options as any[];
                    const studentOpt = opts?.find((o: any) => o.id === a.answer);
                    const correctOpt = opts?.find((o: any) => o.id === a.question?.correct_option);
                    // Count visits from events
                    const qEvents = report.events?.filter((e: any) => e.question_id === a.question_id);
                    const visits = qEvents?.filter((e: any) => e.event_type === 'focus' || e.event_type === 'revisit').length || 0;

                    return (
                      <tr key={a.question_id}>
                        <td style={{ color: 'var(--text-3)' }}>Q{i + 1}</td>
                        <td style={{ maxWidth: 240, fontSize: 13 }}>{a.question?.text?.substring(0, 80)}{a.question?.text?.length > 80 ? '...' : ''}</td>
                        <td>{a.answer ? <span style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{studentOpt?.text || a.answer}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                        <td style={{ fontSize: 13, color: 'var(--success)' }}>{correctOpt?.text || a.question?.correct_option}</td>
                        <td>{fmtMs(a.time_spent_ms || 0)}</td>
                        <td>{visits}</td>
                        <td>{a.change_count}</td>
                        <td>
                          {a.answer === null ? <span style={{ color: 'var(--text-3)' }}>—</span>
                            : a.is_correct ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Correct</span>
                            : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Wrong</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '28px 0 16px' }}>Full Event Trail</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Question</th><th>Event</th><th>Payload</th></tr></thead>
              <tbody>
                {report.events?.map((e: any) => {
                  const q = report.answers?.find((a: any) => a.question_id === e.question_id);
                  const qNum = report.answers?.indexOf(q) + 1;
                  return (
                    <tr key={e.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(e.created_at).toLocaleTimeString()}</td>
                      <td style={{ fontSize: 13 }}>Q{qNum}</td>
                      <td><span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: e.event_type === 'answer_changed' ? 'rgba(99,102,241,0.15)' : 'var(--bg-surface)', color: e.event_type === 'answer_changed' ? 'var(--primary-light)' : 'var(--text-2)' }}>{e.event_type}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{JSON.stringify(e.payload)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
