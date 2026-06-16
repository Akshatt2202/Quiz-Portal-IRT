import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth, apiClient } from '../../context/AuthContext';

interface Option { id: string; text: string; }
interface Question { id: string; text: string; options: Option[]; marks: number; orderIndex: number; }

const normalizeQuestion = (question: any): Question => {
  const options = Array.isArray(question.options)
    ? question.options
        .filter((option: any) => option?.id && option?.text)
        .map((option: any) => ({ id: String(option.id), text: String(option.text) }))
    : [];

  return {
    id: String(question.id ?? question.question_id ?? ''),
    text: String(question.text ?? question.stem ?? ''),
    options,
    marks: Number(question.marks ?? 0),
    orderIndex: Number(question.orderIndex ?? question.order_index ?? 0),
  };
};

export default function QuizPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remaining_seconds, set_remaining_seconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Refs for tracking (avoid stale closures in intervals)
  const questionStartRef = useRef<number>(Date.now());
  const currentIdxRef = useRef(0);
  const answersRef = useRef<Record<string, string>>({});
  const markedForReviewRef = useRef<Record<string, boolean>>({});
  const timeSpentRef = useRef<Record<string, number>>({});
  const changeCountsRef = useRef<Record<string, number>>({});
  const visitCountsRef = useRef<Record<string, number>>({});
  const eventBatchRef = useRef<any[]>([]);
  const remainingRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);
  const isVisible = useRef(true);

  // 🔧 keep refs in sync with state
  useEffect(() => {
    currentIdxRef.current = currentIdx;
  }, [currentIdx]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);



  useEffect(() => {
    const stored = sessionStorage.getItem(`quiz_${sessionId}`);
    if (stored) {
      const { questions: qs, remaining_seconds: rem, marked_for_review = {} } = JSON.parse(stored);
      const normalizedQuestions = Array.isArray(qs) ? qs.map(normalizeQuestion) : [];
      setQuestions(normalizedQuestions); questionsRef.current = normalizedQuestions;
      set_remaining_seconds(rem); remainingRef.current = rem;
      markedForReviewRef.current = marked_for_review;
      setMarkedForReview(marked_for_review);
      questionStartRef.current = Date.now();
      // Record first visit to Q0
      if (normalizedQuestions[0]?.id) {
        visitCountsRef.current = { [normalizedQuestions[0].id]: 1 };
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !token) return;

    let cancelled = false;

    const syncSessionStatus = async () => {
      try {
        const api = apiClient(token);
        const { data } = await api.get(`/sessions/${sessionId}/status`);
        if (cancelled) return;

        if (data.status === 'submitted' || data.status === 'expired') {
          navigate(`/result/${sessionId}`);
          return;
        }

        const serverRemaining = Number(data.remaining_seconds ?? 0);
        set_remaining_seconds(serverRemaining);
        remainingRef.current = serverRemaining;

        const stored = sessionStorage.getItem(`quiz_${sessionId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          sessionStorage.setItem(
            `quiz_${sessionId}`,
            JSON.stringify({ ...parsed, remaining_seconds: serverRemaining, marked_for_review: markedForReviewRef.current }),
          );
        }
      } catch {
        // Keep the locally cached timer if the status sync fails.
      }
    };

    syncSessionStatus();

    return () => {
      cancelled = true;
    };
  }, [sessionId, token, navigate]);

  useEffect(() => {
    if (!sessionId || questions.length === 0) return;

    sessionStorage.setItem(
      `quiz_${sessionId}`,
      JSON.stringify({ questions, remaining_seconds, marked_for_review: markedForReviewRef.current }),
    );
  }, [sessionId, questions, remaining_seconds, markedForReview]);

  // Countdown timer (local display only — server is truth)
  useEffect(() => {
    const interval = setInterval(() => {
      set_remaining_seconds(s => {
        const n = Math.max(0, s - 1);
        remainingRef.current = n;
        if (n === 0) { clearInterval(interval); handleAutoSubmit(); }
        return n;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Batch sender every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      flushBatch();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Tab visibility tracking
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        questionStartRef.current = Date.now(); // resume timer
        isVisible.current = true;
      } else {
        // Pause: record time so far
        pauseCurrentQuestion();
        isVisible.current = false;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const pauseCurrentQuestion = () => {
    const qId = questionsRef.current[currentIdxRef.current]?.id;
    if (!qId) return;
    const elapsed = Date.now() - questionStartRef.current;
    timeSpentRef.current[qId] = (timeSpentRef.current[qId] || 0) + elapsed;
    eventBatchRef.current.push({
      question_id: qId,
      event_type: 'blur',
      payload: {
        added_time_ms: elapsed,
        marked_for_review: !!markedForReviewRef.current[qId],
      },
      client_ts: Date.now(),
    });
  };

  const flushBatch = async () => {
    // Add current time spent as incremental update
    const qId = questionsRef.current[currentIdxRef.current]?.id;
    if (qId && isVisible.current) {
      const elapsed = Date.now() - questionStartRef.current;
      eventBatchRef.current.push({
        question_id: qId,
        event_type: 'blur',
        payload: {
          added_time_ms: elapsed,
          marked_for_review: !!markedForReviewRef.current[qId],
        },
        client_ts: Date.now(),
      });
      questionStartRef.current = Date.now(); // reset after recording
    }

    if (eventBatchRef.current.length === 0) return;

    const toSend = [...eventBatchRef.current];
    eventBatchRef.current = [];

    try {
      const api = apiClient(token);
      const { data } = await api.post(`/sessions/${sessionId}/events`, { events: toSend });
      // Sync remaining time from server
      const remainingSeconds = data.remaining_seconds ?? data.remainingSeconds;
      if (remainingSeconds !== undefined) {
        set_remaining_seconds(remainingSeconds);
        remainingRef.current = remainingSeconds;
      }
    } catch (err: any) {
      if (err.response?.data?.error === 'Quiz time has expired') {
        set_remaining_seconds(0);
        handleAutoSubmit();
      }
    }
  };

  const switchQuestion = (newIdx: number) => {
    if (newIdx < 0 || newIdx >= questionsRef.current.length) return;
    const oldQId = questionsRef.current[currentIdxRef.current]?.id;
    const newQId = questionsRef.current[newIdx]?.id;
    if (!oldQId || !newQId) return;

    // Record time on old question
    const elapsed = Date.now() - questionStartRef.current;
    timeSpentRef.current[oldQId] = (timeSpentRef.current[oldQId] || 0) + elapsed;

    eventBatchRef.current.push({
      question_id: oldQId,
      event_type: 'blur',
      payload: {
        added_time_ms: elapsed,
        marked_for_review: !!markedForReviewRef.current[oldQId],
      },
      client_ts: Date.now(),
    });

    // Record revisit on new question (if visited before)
    const isRevisit = (visitCountsRef.current[newQId] || 0) > 0;
    visitCountsRef.current[newQId] = (visitCountsRef.current[newQId] || 0) + 1;
    if (isRevisit) {
      eventBatchRef.current.push({ question_id: newQId, event_type: 'revisit', payload: { visit_count: visitCountsRef.current[newQId] }, client_ts: Date.now() });
    } else {
      eventBatchRef.current.push({ question_id: newQId, event_type: 'focus', payload: { visit_count: 1 }, client_ts: Date.now() });
    }

    currentIdxRef.current = newIdx;
    questionStartRef.current = Date.now();
    setCurrentIdx(newIdx);
  };

  const selectAnswer = (questionId: string, optionId: string) => {
    const prev = answersRef.current[questionId];
    if (prev === optionId) return; // no change

    answersRef.current[questionId] = optionId;
    changeCountsRef.current[questionId] = (changeCountsRef.current[questionId] || 0) + 1;
    setAnswers({ ...answersRef.current });

    eventBatchRef.current.push({
      question_id: questionId,
      event_type: 'answer_changed',
      payload: {
        answer: optionId,
        change_count: changeCountsRef.current[questionId],
        marked_for_review: !!markedForReviewRef.current[questionId],
      },
      client_ts: Date.now(),
    });
  };

  const toggleMarkForReview = (questionId: string) => {
    const nextValue = !markedForReviewRef.current[questionId];
    const nextState = { ...markedForReviewRef.current, [questionId]: nextValue };
    markedForReviewRef.current = nextState;
    setMarkedForReview(nextState);
  };

  const handleAutoSubmit = useCallback(async () => {
    await flushBatch();
    try {
      const api = apiClient(token);
      await api.post(`/sessions/${sessionId}/submit`);
      navigate(`/result/${sessionId}`);
    } catch { navigate(`/result/${sessionId}`); }
  }, [sessionId, token]);

  const handleSubmit = async () => {
    if (!confirm('Are you sure you want to submit the quiz?')) return;
    setSubmitting(true);
    await flushBatch();
    try {
      const api = apiClient(token);
      await api.post(`/sessions/${sessionId}/submit`);
      navigate(`/result/${sessionId}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const timerClass = remaining_seconds < 60 ? 'timer-danger' : remaining_seconds < 300 ? 'timer-warning' : '';
  const currentQuestion = questions[currentIdx];
  const answeredCount = Object.keys(answersRef.current).length;
  const reviewCount = Object.values(markedForReview).filter(Boolean).length;

  if (questions.length === 0) return <><Navbar /><div className="loader-wrap"><div className="spinner" /></div></>;

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="quiz-layout">
            {/* Question Panel */}
            <div className="question-panel">
              <div className="question-number">Question {currentIdx + 1} of {questions.length}</div>
              <div className="question-text">{currentQuestion?.text}</div>
              <div className="options-list">
                {(currentQuestion?.options as Option[])?.map(opt => (
                  <div
                    key={opt.id}
                    className={`option-item ${answers[currentQuestion.id] === opt.id ? 'selected' : ''}`}
                    onClick={() => selectAnswer(currentQuestion.id, opt.id)}
                  >
                    <div className="option-circle" />
                    <span style={{ fontSize: 15 }}>{opt.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <button
                  className={`btn ${markedForReview[currentQuestion.id] ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => toggleMarkForReview(currentQuestion.id)}
                  type="button"
                >
                  {markedForReview[currentQuestion.id] ? 'Remove Review Flag' : 'Mark For Review'}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
                <button className="btn btn-outline" onClick={() => switchQuestion(currentIdx - 1)} disabled={currentIdx === 0}>← Prev</button>
                {currentIdx < questions.length - 1
                  ? <button className="btn btn-primary" onClick={() => switchQuestion(currentIdx + 1)}>Next →</button>
                  : <button className="btn btn-success" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting...' : '✓ Submit Quiz'}</button>
                }
              </div>
            </div>

            {/* Sidebar */}
            <div className="sidebar">
              <div className="timer-card">
                <div className="timer-label">Time Remaining</div>
                <div className={`timer-display ${timerClass}`}>{formatTime(remaining_seconds)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{answeredCount}/{questions.length} answered</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{reviewCount} marked for review</div>
              </div>

              <div className="question-nav-card">
                <div className="question-nav-title">Question Navigator</div>
                <div className="question-nav-grid">
                  {questions.map((q, i) => (
                    <div
                      key={q.id}
                      className={`q-btn ${i === currentIdx ? 'current' : ''} ${answers[q.id] ? 'answered' : ''}`}
                      style={markedForReview[q.id] && i !== currentIdx ? { borderColor: 'var(--warning)', color: 'var(--warning)' } : {}}
                      onClick={() => switchQuestion(i)}
                    >{markedForReview[q.id] ? `! ${i + 1}` : i + 1}</div>
                  ))}
                </div>
                <div className="nav-legend">
                  <div className="legend-item"><div className="legend-dot" style={{ background: 'rgba(16,185,129,0.3)', border: '1px solid var(--success)' }} />Answered</div>
                  <div className="legend-item"><div className="legend-dot" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid var(--primary)' }} />Current</div>
                  <div className="legend-item" style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}><div className="legend-dot" style={{ background: 'transparent', border: '1px solid var(--warning)' }} />Marked Review</div>
                  <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />Not visited</div>
                </div>
              </div>

              <button className="btn btn-success w-full" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : '✓ Submit Quiz'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
