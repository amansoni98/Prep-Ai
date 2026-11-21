import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, CheckCircle2, FileText, GraduationCap, Lightbulb, Mic2, Search, UploadCloud, XCircle } from 'lucide-react';
import api, { apiError } from '../api';
import { Chip, ErrorBanner, PageHeader, ScoreGauge, Spinner, cx, fmtDate } from '../components/ui';

function ResumeView({ resume }) {
  const p = resume.parsed;
  return (
    <div className="space-y-5 text-sm animate-fade-in">
      {resume.warning && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{resume.warning}</div>}
      {p.summary && <p className="leading-relaxed text-slate-600 dark:text-slate-300">{p.summary}</p>}
      <section>
        <h4 className="label">Skills ({p.skills.length})</h4>
        <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <Chip key={s} tone="brand">{s}</Chip>)}</div>
      </section>
      {p.experience.length > 0 && (
        <section>
          <h4 className="label flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Experience</h4>
          <div className="space-y-3">{p.experience.map((e, i) => (
            <div key={i}>
              <div className="font-semibold text-slate-900 dark:text-white">{e.role}{e.company && ` · ${e.company}`}</div>
              <div className="text-xs text-slate-500">{e.duration}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-400">{e.highlights.map((h, k) => <li key={k}>{h}</li>)}</ul>
            </div>))}</div>
        </section>
      )}
      {p.projects.length > 0 && (
        <section>
          <h4 className="label">Projects</h4>
          <div className="space-y-3">{p.projects.map((pr, i) => (
            <div key={i}>
              <div className="font-semibold text-slate-900 dark:text-white">{pr.name}</div>
              <p className="text-slate-600 dark:text-slate-400">{pr.description}</p>
              <div className="mt-1 flex flex-wrap gap-1">{pr.tech.map((t) => <Chip key={t}>{t}</Chip>)}</div>
            </div>))}</div>
        </section>
      )}
      {p.education.length > 0 && (
        <section>
          <h4 className="label flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> Education</h4>
          {p.education.map((e, i) => <div key={i}><span className="font-semibold text-slate-900 dark:text-white">{e.degree}</span> · {e.institution} <span className="text-slate-500">{e.year}</span></div>)}
        </section>
      )}
    </div>
  );
}

function MatchResult({ jd, onPractice }) {
  const a = jd.analysis || {};
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-wrap items-center gap-6">
        <ScoreGauge value={jd.matchScore} max={100} suffix="%" size={150} decimals={0} caption="match" />
        <div className="min-w-[200px] flex-1">
          <h3 className="text-lg font-semibold">{jd.title}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{a.summary}</p>
          <p className="mt-2 text-xs text-slate-500">{jd.matchedSkills.length} of {jd.jdSkills.length} required skills found — computed deterministically from your resume.</p>
        </div>
      </div>
      {jd.warnings?.map((w) => <div key={w} className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{w}</div>)}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="label flex items-center gap-1.5 !text-emerald-600 dark:!text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> You have ({jd.matchedSkills.length})</h4>
          <div className="flex flex-wrap gap-1.5">{jd.matchedSkills.map((s) => <Chip key={s} tone="green">{s}</Chip>)}{!jd.matchedSkills.length && <span className="text-sm text-slate-500">No overlap found.</span>}</div>
        </div>
        <div>
          <h4 className="label flex items-center gap-1.5 !text-rose-600 dark:!text-rose-400"><XCircle className="h-3.5 w-3.5" /> Missing ({jd.missingSkills.length})</h4>
          <div className="flex flex-wrap gap-1.5">{jd.missingSkills.map((s) => <Chip key={s} tone="red">{s}</Chip>)}{!jd.missingSkills.length && <span className="text-sm text-slate-500">Nothing missing — great match!</span>}</div>
        </div>
      </div>

      {a.gaps?.length > 0 && (
        <div>
          <h4 className="label">Gap analysis</h4>
          <div className="space-y-2">{a.gaps.map((g) => (
            <div key={g.skill} className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="font-semibold capitalize text-slate-900 dark:text-white">{g.skill}</div>
              {g.whyItMatters && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{g.whyItMatters}</p>}
              {g.howToClose && <p className="mt-1.5 text-sm text-brand-700 dark:text-brand-300">→ {g.howToClose}</p>}
            </div>))}</div>
        </div>
      )}

      {a.missingKeywords?.length > 0 && (
        <div>
          <h4 className="label">ATS keywords to add (where truthful)</h4>
          <div className="flex flex-wrap gap-1.5">{a.missingKeywords.map((k) => <Chip key={k} tone="amber">{k}</Chip>)}</div>
        </div>
      )}

      {a.resumeTips?.length > 0 && (
        <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-500/10">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-800 dark:text-brand-200"><Lightbulb className="h-4 w-4" /> Resume improvement tips</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">{a.resumeTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      <button onClick={onPractice} className="btn btn-primary w-full sm:w-auto"><Mic2 className="h-4 w-4" /> Practice these gaps in a mock interview <ArrowRight className="h-4 w-4" /></button>
    </div>
  );
}

export default function ResumeAnalyzer() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [resume, setResume] = useState(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null); // null | 0-100
  const [parsing, setParsing] = useState(false);
  const [jdText, setJdText] = useState('');
  const [jdTitle, setJdTitle] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/resume/latest'), api.get('/jd/latest'), api.get('/jd')])
      .then(([r, j, h]) => { setResume(r.data.resume); setResult(j.data.jd); setHistory(h.data.items); })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoadingInit(false));
  }, []);

  const upload = useCallback(async (file) => {
    setError('');
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return setError('Please upload a PDF file.');
    if (file.size > 8 * 1024 * 1024) return setError('PDF is too large (max 8MB).');
    const fd = new FormData();
    fd.append('resume', file);
    try {
      setProgress(0);
      const { data } = await api.post('/resume/upload', fd, {
        onUploadProgress: (e) => { const p = Math.round((e.loaded / (e.total || file.size)) * 100); setProgress(p); if (p >= 100) setParsing(true); },
      });
      setResume(data.resume);
      setResult(null);
    } catch (e) { setError(apiError(e)); }
    finally { setProgress(null); setParsing(false); }
  }, []);

  async function analyze() {
    setError('');
    setAnalyzing(true);
    try {
      const { data } = await api.post('/jd/analyze', { text: jdText, title: jdTitle });
      setResult(data.jd);
      setHistory((h) => [{ _id: data.jd._id, title: data.jd.title, matchScore: data.jd.matchScore, createdAt: data.jd.createdAt }, ...h].slice(0, 10));
    } catch (e) { setError(apiError(e)); }
    finally { setAnalyzing(false); }
  }

  async function loadJd(id) {
    try { setResult((await api.get(`/jd/${id}`)).data.jd); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { setError(apiError(e)); }
  }

  const busyUpload = progress !== null;

  return (
    <>
      <PageHeader title="Resume & job match" subtitle="Upload your resume, paste a target job description, and see exactly where you stand." />
      <ErrorBanner message={error} onClose={() => setError('')} />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* LEFT: resume */}
        <div className="space-y-4 lg:col-span-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); }}
            onClick={() => !busyUpload && fileRef.current?.click()}
            role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            className={cx('card cursor-pointer border-2 border-dashed p-8 text-center transition-all',
              drag ? 'scale-[1.01] border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-300 hover:border-brand-400 dark:border-slate-700')}
          >
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            {busyUpload ? (
              <div className="space-y-3">
                <Spinner className="mx-auto h-8 w-8 text-brand-500" />
                <div className="text-sm font-medium">{parsing ? 'AI is reading your resume…' : `Uploading… ${progress}%`}</div>
                <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className={cx('h-full rounded-full bg-brand-500 transition-all', parsing && 'animate-pulse')} style={{ width: `${parsing ? 100 : progress}%` }} />
                </div>
              </div>
            ) : (
              <>
                <UploadCloud className={cx('mx-auto h-10 w-10 transition', drag ? 'text-brand-500' : 'text-slate-400')} />
                <div className="mt-3 font-semibold text-slate-900 dark:text-white">{resume ? 'Replace your resume' : 'Drop your resume here'}</div>
                <div className="mt-1 text-sm text-slate-500">PDF only · max 8MB · or click to browse</div>
              </>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-500" />
              <h2 className="font-semibold">Parsed resume</h2>
              {resume && <span className="ml-auto truncate text-xs text-slate-500">{resume.fileName} · {fmtDate(resume.createdAt)}</span>}
            </div>
            {loadingInit ? <Spinner className="mx-auto h-5 w-5 text-brand-500" /> : resume ? <ResumeView resume={resume} /> :
              <p className="text-sm text-slate-500">Nothing parsed yet. Upload a text-based PDF to extract your skills, projects, experience and education.</p>}
          </div>
        </div>

        {/* RIGHT: JD */}
        <div className="space-y-4 lg:col-span-3">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold">Target job description</h2>
            <label className="label" htmlFor="jdtitle">Role / company (optional)</label>
            <input id="jdtitle" className="input mb-4" placeholder="e.g. SDE Intern · Acme Corp" value={jdTitle} onChange={(e) => setJdTitle(e.target.value)} maxLength={120} />
            <label className="label" htmlFor="jdtext">Paste the job description</label>
            <textarea id="jdtext" rows={8} className="input resize-y leading-relaxed" placeholder="Paste the full job description including requirements and tech stack…"
              value={jdText} onChange={(e) => setJdText(e.target.value)} />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{jdText.length.toLocaleString()} chars</span>
              <button className="btn btn-primary" onClick={analyze} disabled={analyzing || !resume || jdText.trim().length < 50}
                title={!resume ? 'Upload a resume first' : ''}>
                {analyzing ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />} {analyzing ? 'Analyzing…' : 'Analyze match'}
              </button>
            </div>
            {!resume && !loadingInit && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Upload your resume first to enable matching.</p>}
          </div>

          {result && <div className="card p-5 sm:p-6"><MatchResult jd={result} onPractice={() => navigate('/setup', { state: { useGaps: true, role: result.title } })} /></div>}

          {history.length > 1 && (
            <div className="card p-5">
              <h3 className="label">Previous analyses</h3>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((h) => (
                  <li key={h._id}>
                    <button onClick={() => loadJd(h._id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:text-brand-600">
                      <span className="truncate">{h.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{h.matchScore}% · {fmtDate(h.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
