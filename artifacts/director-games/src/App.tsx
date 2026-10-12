import {
  useEffect,
  lazy,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  Download,
  Instagram,
  Mail,
  Menu,
  Play,
  RotateCcw,
  Sparkles,
  Twitter,
  X,
  Youtube,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEMBER_ROLES, MEMBER_TITLES } from '../../../lib/api-zod/src/member-options';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { siteConfig, type SiteProject, type SocialIconName } from '@/config/siteConfig';
const MemberCard3DCanvas = lazy(() => import('@/components/member-card-3d').then((module) => ({
  default: module.MemberCard3DCanvas,
})));
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const assetRoot = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const assetPath = (path: string) => `${assetRoot}${path.replace(/^\/+/, '')}`;
const logoPath = assetPath(siteConfig.brand.logo);
const footerLogoPath = assetPath(siteConfig.footer.logo);
const introPath = assetPath(siteConfig.brand.introVideo);
const introSoundPath = assetPath(siteConfig.brand.introSound);
const reelImagePath = assetPath(siteConfig.reel.image);
const projects = siteConfig.games.projects;
const socialIconMap: Record<SocialIconName, typeof Instagram> = {
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
};

type JoinMemberForm = {
  fullName: string;
  email: string;
  role: string;
  title: string;
  city: string;
};

type DirectorMember = JoinMemberForm & {
  memberId: string;
  applicationIp?: string | null;
  issuedAt: string;
  expiresAt: string;
  approvedAt: string | null;
  expiryYear: number;
  active: boolean;
  status: 'pending' | 'approved' | 'rejected';
};

const MEMBER_STORAGE_KEY = 'director-games-members';
const apiRoot = `${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')}/api`;

function readLegacyMembers(): unknown[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(MEMBER_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read locally saved member cards for migration.', error);
    return [];
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || `The request failed (${response.status}).`);
  }
  return payload;
}

function normalizeMember(member: Omit<DirectorMember, 'expiryYear'> & { expiryYear?: number }) {
  return {
    ...member,
    issuedAt: new Date(member.issuedAt).toISOString(),
    expiresAt: new Date(member.expiresAt).toISOString(),
    expiryYear: member.expiryYear ?? new Date(member.expiresAt).getFullYear(),
  };
}

const defaultMemberForm: JoinMemberForm = {
  fullName: '',
  email: '',
  role: 'Member',
  title: 'Creative Operator',
  city: 'Anywhere',
};

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function createMemberCard(memberInput: JoinMemberForm): DirectorMember {
  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()).toISOString();
  const expiryYear = new Date(expiresAt).getFullYear();

  return {
    ...memberInput,
    memberId: '',
    issuedAt,
    expiresAt,
    approvedAt: null,
    expiryYear,
    active: false,
    status: 'pending',
  };
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character] ?? character;
  });
}

async function downloadMemberCard(member: DirectorMember) {
  if (member.status !== 'approved' || !member.approvedAt) {
    throw new Error('A member card is available after Director approval.');
  }
  const logoResponse = await fetch(logoPath);
  if (!logoResponse.ok) {
    throw new Error('The studio logo could not be loaded for the member card.');
  }
  const logoBlob = await logoResponse.blob();
  const logoData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The studio logo could not be prepared for download.'));
    };
    reader.onerror = () => reject(new Error('The studio logo could not be prepared for download.'));
    reader.readAsDataURL(logoBlob);
  });
  const nameFontSize = Math.min(
    48,
    Math.max(23, Math.floor(400 / Math.max(member.fullName.length * 0.54, 1))),
  );
  const nameTextLength = Math.min(410, member.fullName.length * nameFontSize * 0.54);
  const memberIdTextLength = Math.min(400, member.memberId.length * 10.8);
  const cityTextLength = Math.min(350, member.city.length * 9);
  const titleTextLength = Math.min(350, member.title.length * 7.8);
  const roleTextLength = Math.min(350, member.role.length * 7.8);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="1224" viewBox="0 0 512 816">
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e5dcc4"/><stop offset=".18" stop-color="#686b70"/>
          <stop offset=".47" stop-color="#c4c2ba"/><stop offset=".78" stop-color="#45474c"/>
          <stop offset="1" stop-color="#c4b99e"/>
        </linearGradient>
        <linearGradient id="face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#292722"/><stop offset=".52" stop-color="#171715"/>
          <stop offset="1" stop-color="#24221d"/>
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e4d7b7" stop-opacity=".13"/><stop offset=".3" stop-color="#6a6252" stop-opacity=".03"/>
          <stop offset=".55" stop-color="#10100f" stop-opacity="0"/><stop offset="1" stop-color="#c4bba7" stop-opacity=".12"/>
        </linearGradient>
        <pattern id="brush" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 1H6M0 4H6" stroke="#fff" stroke-opacity=".035"/>
        </pattern>
        <clipPath id="clip"><rect x="14" y="14" width="484" height="788" rx="40"/></clipPath>
        <filter id="shadow" x="-30%" y="-15%" width="160%" height="145%">
          <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity=".4"/>
        </filter>
      </defs>
      <rect width="512" height="816" fill="#e8e4dc"/>
      <rect x="8" y="8" width="496" height="800" rx="46" fill="url(#edge)" filter="url(#shadow)"/>
      <rect x="14" y="14" width="484" height="788" rx="40" fill="url(#face)" stroke="#e3d7bd" stroke-opacity=".3"/>
      <g clip-path="url(#clip)">
        <rect x="14" y="14" width="484" height="788" fill="url(#brush)"/>
        <rect x="14" y="14" width="484" height="788" fill="url(#sheen)"/>
      </g>
      <image href="${logoData}" x="48" y="48" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>
      <text x="112" y="69" fill="#f5f7fa" font-size="17" font-family="Arial, sans-serif" letter-spacing="2.1">THE DIRECTOR GAMES</text>
      <text x="113" y="91" fill="#cdd3de" font-size="9" font-family="Arial, sans-serif" letter-spacing="2.8">MEMBERSHIP</text>
      <line x1="52" y1="176" x2="460" y2="176" stroke="#dcd3be" stroke-opacity=".25"/>
      <text x="54" y="226" fill="#cdd3de" font-size="10" font-family="Arial, sans-serif" letter-spacing="2.3">MEMBER</text>
      <text x="50" y="286" fill="#f5f7fa" font-size="${nameFontSize}" textLength="${nameTextLength}" lengthAdjust="spacingAndGlyphs" font-family="Georgia, serif">${escapeXml(member.fullName)}</text>
      <line x1="52" y1="328" x2="460" y2="328" stroke="#dcd3be" stroke-opacity=".2"/>
      <text x="54" y="369" fill="#cdd3de" font-size="10" font-family="Arial, sans-serif" letter-spacing="2">MEMBER NO.</text>
      <text x="54" y="405" fill="#f5f7fa" font-size="18" textLength="${memberIdTextLength}" lengthAdjust="spacingAndGlyphs" font-family="Consolas, monospace">${escapeXml(member.memberId)}</text>
      <text x="54" y="462" fill="#cdd3de" font-size="10" font-family="Arial, sans-serif" letter-spacing="2">BASED IN</text>
      <text x="54" y="491" fill="#f5f7fa" font-size="16" textLength="${cityTextLength}" lengthAdjust="spacingAndGlyphs" font-family="Arial, sans-serif">${escapeXml(member.city)}</text>
      <text x="54" y="535" fill="#cdd3de" font-size="9" font-family="Arial, sans-serif" letter-spacing="2">TITLE</text>
      <text x="54" y="556" fill="#f5f7fa" font-size="14" textLength="${titleTextLength}" lengthAdjust="spacingAndGlyphs" font-family="Arial, sans-serif">${escapeXml(member.title)}</text>
      <text x="54" y="582" fill="#cdd3de" font-size="9" font-family="Arial, sans-serif" letter-spacing="2">ROLE</text>
      <text x="54" y="603" fill="#f5f7fa" font-size="14" textLength="${roleTextLength}" lengthAdjust="spacingAndGlyphs" font-family="Arial, sans-serif">${escapeXml(member.role)}</text>
      <line x1="52" y1="624" x2="460" y2="624" stroke="#dcd3be" stroke-opacity=".25"/>
      <text x="459" y="685" text-anchor="end" fill="#e2dbca" font-size="30" font-style="italic" font-family="Segoe Script, 'Brush Script MT', cursive">The Director</text>
      <text x="459" y="712" text-anchor="end" fill="#cdd3de" font-size="9" font-family="Arial, sans-serif">ISSUED ${escapeXml(formatDate(member.approvedAt))}</text>
    </svg>
  `;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 768;
          canvas.height = 1224;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('The member card image could not be created.');
          context.fillStyle = '#171714';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `${member.fullName.toLowerCase().replace(/\s+/g, '-')}-director-games-card.png`;
          link.click();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error('The member card preview could not be rendered for download.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function memberExpiryYear(member: Partial<DirectorMember>) {
  return member.expiryYear ?? (member.expiresAt
    ? new Date(member.expiresAt).getFullYear()
    : new Date().getFullYear() + 2);
}

function Reveal({ children, className = '', delay = '' }: { children: ReactNode; className?: string; delay?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          element.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`reveal ${delay} ${className}`}>{children}</div>;
}

function IntroSplash({ onComplete }: { onComplete: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.setTimeout(onComplete, siteConfig.ui.introExitDurationMs);
  };

  const attemptSoundPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = siteConfig.ui.introSoundVolume;
    void audio.play().then(() => setSoundBlocked(false)).catch(() => setSoundBlocked(true));
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.readyState >= 2) {
      attemptSoundPlayback();
    } else {
      audio.addEventListener('canplay', attemptSoundPlayback, { once: true });
    }

    return () => {
      audio.removeEventListener('canplay', attemptSoundPlayback);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    const fallback = window.setTimeout(finish, siteConfig.ui.introFallbackDurationMs);
    return () => window.clearTimeout(fallback);
  }, []);

  return (
    <div className={`intro-screen ${leaving ? 'is-leaving' : ''}`} aria-label={siteConfig.brand.introAriaLabel}>
      <video className="intro-video" src={introPath} autoPlay muted playsInline onEnded={finish} aria-label={siteConfig.brand.introVideoAriaLabel} />
      <audio ref={audioRef} src={introSoundPath} autoPlay preload="auto" aria-hidden="true" />
      {soundBlocked && (
        <button type="button" className="intro-sound" onClick={attemptSoundPlayback} data-testid="button-enable-intro-sound" aria-label={siteConfig.ui.introSoundEnableAriaLabel}>
          {siteConfig.ui.introSoundEnableLabel}
        </button>
      )}
      <button type="button" className="intro-skip" onClick={finish} data-testid="button-skip-intro" aria-label={siteConfig.ui.introSkipAriaLabel}>
        {siteConfig.ui.introSkipLabel}
      </button>
      <div className="intro-progress" aria-hidden="true" style={{ '--intro-progress-duration': `${siteConfig.ui.introProgressDurationMs}ms` } as CSSProperties}>
        <span />
      </div>
    </div>
  );
}

function ProjectModal({ project, onClose }: { project: SiteProject; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="project-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} data-testid="button-close-project" aria-label={siteConfig.ui.closeProjectAriaLabel}>
          <X size={18} />
        </button>
        <span className="eyebrow">{project.id} / {project.type}</span>
        <h2 id="project-modal-title" className="display">{project.title}</h2>
        <p>{project.description} {project.modalDescription}</p>
        <div className="modal-film" aria-label={`${project.title} ${siteConfig.ui.projectPreviewAriaLabelSuffix}`}>
          <Play size={16} fill="currentColor" aria-hidden="true" />
          {siteConfig.ui.projectPreviewLabel}
        </div>
      </div>
    </div>
  );
}

function SiteHeader({ menuItems = siteConfig.navigation }: { menuItems?: readonly { id: string; label: string; href: string }[] }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-nav">
      <a href="/" className="nav-mark" data-testid="link-home" aria-label={siteConfig.ui.homeAriaLabel}>
        <img src={logoPath} alt={siteConfig.brand.logoAlt} />
      </a>
      <button type="button" className="nav-menu" onClick={() => setMenuOpen((open) => !open)} data-testid="button-toggle-menu" aria-label={menuOpen ? siteConfig.ui.closeMenuAriaLabel : siteConfig.ui.openMenuAriaLabel} aria-expanded={menuOpen}>
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label={siteConfig.ui.primaryNavigationAriaLabel}>
        {menuItems.map((item) => (
          <a key={item.id} href={item.href} onClick={() => setMenuOpen(false)} data-testid={`link-${item.id}`}>
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

function MemberCard3D({ member }: { member: Partial<DirectorMember> }) {
  const [flipped, setFlipped] = useState(false);
  const displayName = member.fullName || 'Your Name';
  const isApproved = member.status === 'approved' && Boolean(member.approvedAt);
  const flipCard = () => setFlipped((value) => !value);

  return (
    <div className="member-card-view">
      <Suspense fallback={<div className="member-card-scene member-card-loading" role="status">Preparing the 3D membership card…</div>}>
        <MemberCard3DCanvas
          member={member}
          logoPath={logoPath}
          flipped={flipped}
          onFlip={flipCard}
          label={`Director Games ${isApproved ? 'membership card' : 'membership application'} for ${displayName}. Drag to rotate or double-click to flip.`}
        />
      </Suspense>
      <button className="member-card-flip" type="button" onClick={flipCard} aria-label={flipped ? 'Show card front' : 'Show card back'}>
        {flipped ? 'FRONT' : 'BACK'} <RotateCcw size={11} aria-hidden="true" />
      </button>
    </div>
  );
}

function JoinPage() {
  const [form, setForm] = useState<JoinMemberForm>(defaultMemberForm);
  const [status, setStatus] = useState('');
  const [applicationInProcess, setApplicationInProcess] = useState(false);

  const updateField = (field: keyof JoinMemberForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      setStatus('Please add your name and email so the member card can be issued.');
      return;
    }

    setSubmitting(true);
    setStatus('');
    try {
      await apiRequest<{ applicationInProcess: true }>('/members', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setApplicationInProcess(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The member card could not be issued.');
    } finally {
      setSubmitting(false);
    }
  };

  const cardSummary = createMemberCard(form);

  if (applicationInProcess) {
    return (
      <main className="application-process" role="status" aria-live="polite">
        <p>Your application is in process.</p>
      </main>
    );
  }

  return (
    <div className="brand-page join-page">
      <SiteHeader
        menuItems={[
          { id: 'home', label: 'Home', href: '/' },
          { id: 'games', label: 'Games', href: '/#games' },
        ]}
      />

      <main className="join-plate">
        <section className="join-header">
          <span className="eyebrow">Membership / apply</span>
          <h1 className="display">Join The Director Games.</h1>
          <p>Become part of the room where strange worlds are built with care, curiosity, and better rules.</p>
        </section>

        <div className="join-grid">
          <aside className="member-preview-panel">
            <div className="member-card-shell">
              <div className="member-card-header">
                <span className="eyebrow">Studio membership</span>
                <span className="badge">Pending approval</span>
              </div>
              <MemberCard3D member={cardSummary} />
              <p className="member-card-explainer">Your card is issued after the Director approves your application.</p>
            </div>
          </aside>

          <form className="member-form" onSubmit={handleSubmit}>
            <div className="join-form-heading">
              <span className="eyebrow">Membership application</span>
              <h2>Your details</h2>
            </div>
            <label>
              Full name
              <input value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} placeholder="Your name" />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="you@studio.com" />
            </label>
            <div className="form-row">
              <label>
                Role
                <select value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                  {MEMBER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <label>
                Title
                <select value={form.title} onChange={(event) => updateField('title', event.target.value)}>
                  {MEMBER_TITLES.map((title) => <option key={title} value={title}>{title}</option>)}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                City
                <input value={form.city} onChange={(event) => updateField('city', event.target.value)} placeholder="Anywhere" />
              </label>
            </div>

            {status && <p className="form-status">{status}</p>}

            <p className="application-privacy-notice">
              One application is accepted per IP address and email. Your IP is stored with the application; shared networks share this limit.
            </p>

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? 'Sending application…' : 'Apply for membership'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function DirectorDashboard() {
  const [members, setMembers] = useState<DirectorMember[]>([]);
  const [legacyMembers, setLegacyMembers] = useState<unknown[]>([]);
  const [broadcasts, setBroadcasts] = useState<Array<{
    id: number;
    subject: string;
    recipientCount: number;
    failedCount: number;
    sentAt: string;
  }>>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminConfigured, setAdminConfigured] = useState(true);
  const [googleSignInConfigured, setGoogleSignInConfigured] = useState(false);
  const [gmailAddress, setGmailAddress] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [password, setPassword] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<JoinMemberForm>(defaultMemberForm);

  useEffect(() => {
    setLegacyMembers(readLegacyMembers());
    const gmailResult = new URLSearchParams(window.location.search).get('gmail');
    if (gmailResult === 'connected') setNotice('Studio Gmail is connected.');
    if (gmailResult === 'error') setNotice('Google could not connect. Check the OAuth setup and try again.');
    if (gmailResult === 'cancelled') setNotice('Google email connection was cancelled.');
    if (gmailResult === 'state-error') setNotice('The Google sign-in expired. Please try connecting again.');
    if (gmailResult === 'sign-in-required') setNotice('Sign in to the dashboard before connecting Gmail.');
    const googleResult = new URLSearchParams(window.location.search).get('google');
    if (googleResult === 'connected') setNotice('Signed in with Google.');
    if (googleResult === 'denied') setNotice('This Google account is not authorized for Director access.');
    if (googleResult === 'cancelled') setNotice('Google sign-in was cancelled.');
    if (googleResult === 'state-error') setNotice('The Google sign-in expired. Please try again.');
    if (googleResult === 'error') setNotice('Google sign-in failed. Check the OAuth setup and try again.');

    apiRequest<{
      authenticated: boolean;
      adminConfigured: boolean;
      googleSignInConfigured: boolean;
      gmailConnected: boolean;
      gmailAddress?: string | null;
    }>('/admin/status')
      .then(async (status) => {
        setAuthenticated(status.authenticated);
        setAdminConfigured(status.adminConfigured);
        setGoogleSignInConfigured(status.googleSignInConfigured);
        setGmailConnected(status.gmailConnected);
        setGmailAddress(status.gmailAddress ?? '');
        if (status.authenticated) {
          const [memberResult, broadcastResult] = await Promise.all([
            apiRequest<{ members: Array<Omit<DirectorMember, 'expiryYear'> & { expiryYear?: number }> }>('/admin/members'),
            apiRequest<{ broadcasts: typeof broadcasts }>('/admin/broadcasts'),
          ]);
          setMembers(memberResult.members.map(normalizeMember));
          setBroadcasts(broadcastResult.broadcasts);
        }
      })
      .catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : 'The dashboard API is unavailable.');
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshMembers = async () => {
    const result = await apiRequest<{ members: Array<Omit<DirectorMember, 'expiryYear'> & { expiryYear?: number }> }>('/admin/members');
    setMembers(result.members.map(normalizeMember));
  };

  const refreshBroadcasts = async () => {
    const result = await apiRequest<{ broadcasts: typeof broadcasts }>('/admin/broadcasts');
    setBroadcasts(result.broadcasts);
  };

  const importLegacyMembers = async () => {
    if (!window.confirm(`Import ${legacyMembers.length} locally saved member card${legacyMembers.length === 1 ? '' : 's'} into the studio ledger?`)) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ importedCount: number; skippedCount: number }>('/admin/members/import', {
        method: 'POST',
        body: JSON.stringify({ members: legacyMembers }),
      });
      window.localStorage.removeItem(MEMBER_STORAGE_KEY);
      setLegacyMembers([]);
      await refreshMembers();
      setNotice(`Imported ${result.importedCount} member${result.importedCount === 1 ? '' : 's'}; ${result.skippedCount} duplicate or invalid card${result.skippedCount === 1 ? '' : 's'} skipped.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import locally saved members.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      await apiRequest('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setAuthenticated(true);
      const [status, memberResult, broadcastResult] = await Promise.all([
        apiRequest<{ gmailConnected: boolean; gmailAddress?: string | null }>('/admin/status'),
        apiRequest<{ members: Array<Omit<DirectorMember, 'expiryYear'> & { expiryYear?: number }> }>('/admin/members'),
        apiRequest<{ broadcasts: typeof broadcasts }>('/admin/broadcasts'),
      ]);
      setGmailConnected(status.gmailConnected);
      setGmailAddress(status.gmailAddress ?? '');
      setMembers(memberResult.members.map(normalizeMember));
      setBroadcasts(broadcastResult.broadcasts);
      setNotice('Signed in to the Director dashboard.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await apiRequest('/admin/logout', { method: 'POST' });
      setAuthenticated(false);
      setMembers([]);
      setBroadcasts([]);
      setGmailConnected(false);
      setGmailAddress('');
      setNotice('Signed out.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  const handleBroadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const activeCount = members.filter((member) => member.active).length;
    if (!activeCount || !window.confirm(`Send this email individually to ${activeCount} active member${activeCount === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await apiRequest<{
        sentCount: number;
        failedCount: number;
      }>('/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ subject, body: message }),
      });
      setNotice(`Broadcast complete: ${result.sentCount} sent, ${result.failedCount} failed.`);
      setSubject('');
      setMessage('');
      await refreshBroadcasts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The broadcast could not be completed.');
      try {
        await refreshBroadcasts();
      } catch (refreshError) {
        setNotice(
          `${error instanceof Error ? error.message : 'The broadcast could not be completed.'} Broadcast history could not be refreshed: ${refreshError instanceof Error ? refreshError.message : 'unknown error'}`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMemberEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMemberId) return;
    const original = members.find((member) => member.memberId === editingMemberId);
    if (!original) {
      setNotice('The member could not be found. Refresh the dashboard and try again.');
      return;
    }
    const updates: Partial<JoinMemberForm> = {};
    for (const field of Object.keys(editingForm) as Array<keyof JoinMemberForm>) {
      if (editingForm[field] !== original[field]) updates[field] = editingForm[field];
    }
    if (Object.keys(updates).length === 0) {
      setEditingMemberId(null);
      setNotice('No member details changed.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/admin/members/${encodeURIComponent(editingMemberId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await refreshMembers();
      setEditingMemberId(null);
      setNotice('Member details updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this member.');
    } finally {
      setBusy(false);
    }
  };

  const toggleMemberActive = async (member: DirectorMember) => {
    setBusy(true);
    try {
      await apiRequest(`/admin/members/${encodeURIComponent(member.memberId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !member.active }),
      });
      await refreshMembers();
      setNotice(`${member.fullName} is now ${member.active ? 'inactive' : 'active'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update member status.');
    } finally {
      setBusy(false);
    }
  };

  const approveMember = async (member: DirectorMember) => {
    setBusy(true);
    try {
      const result = await apiRequest<{
        member: Omit<DirectorMember, 'expiryYear'> & { expiryYear?: number };
        welcomeEmailSent: boolean;
        emailError?: string;
      }>(`/admin/members/${encodeURIComponent(member.memberId)}/approve`, {
        method: 'POST',
      });
      await refreshMembers();
      setNotice(
        result.welcomeEmailSent
          ? `${member.fullName} approved. Their signed membership card is now issued and the welcome email has been sent.`
          : `${member.fullName} approved and card issued, but the welcome email was not sent: ${result.emailError ?? 'Reconnect Gmail and resend it from the member ledger.'}`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not approve this application.');
    } finally {
      setBusy(false);
    }
  };

  const rejectMember = async (member: DirectorMember) => {
    if (!window.confirm(`Reject the membership application from ${member.fullName}?`)) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/members/${encodeURIComponent(member.memberId)}/reject`, {
        method: 'POST',
      });
      await refreshMembers();
      setNotice(`${member.fullName}'s application was rejected.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reject this application.');
    } finally {
      setBusy(false);
    }
  };

  const resendWelcome = async (member: DirectorMember) => {
    setBusy(true);
    try {
      await apiRequest(`/admin/members/${encodeURIComponent(member.memberId)}/welcome`, {
        method: 'POST',
      });
      setNotice(`Welcome email sent to ${member.email}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the welcome email.');
    } finally {
      setBusy(false);
    }
  };

  const deleteMember = async (member: DirectorMember) => {
    if (!window.confirm(`Permanently remove ${member.fullName} (${member.email})?`)) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/members/${encodeURIComponent(member.memberId)}`, {
        method: 'DELETE',
      });
      await refreshMembers();
      setNotice(`${member.fullName} was removed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not remove this member.');
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (member: DirectorMember) => {
    setEditingMemberId(member.memberId);
    setEditingForm({
      fullName: member.fullName,
      email: member.email,
      role: member.role,
      title: member.title,
      city: member.city,
    });
  };

  const pendingApplications = members.filter((member) => member.status === 'pending');
  const approvedMembers = members.filter((member) => member.status === 'approved');
  const rejectedApplications = members.filter((member) => member.status === 'rejected');

  return (
    <div className="brand-page dashboard-page">
      <SiteHeader menuItems={[{ id: 'home', label: 'Home', href: '/' }]} />

      <main className="dashboard-plate">
        <section className="join-header dashboard-header">
          <span className="eyebrow">Director dashboard</span>
          <h1 className="display">Membership control room.</h1>
          <p>Manage the member ledger, studio email, and messages from one place.</p>
        </section>

        {notice && <p className="dashboard-notice" role="status">{notice}</p>}
        {loading ? (
          <div className="empty-state"><p>Connecting to the studio ledger…</p></div>
        ) : !authenticated ? (
          <section className="member-form admin-login-form">
            <span className="eyebrow">Studio admin</span>
            <h2 className="display">Sign in to manage members.</h2>
            {!adminConfigured && !googleSignInConfigured && <p className="form-status">Admin access is not configured on the API.</p>}
            <div className="google-sign-in-panel">
              <span className="google-sign-in-mark" aria-hidden="true">G</span>
              <div className="google-sign-in-copy">
                <strong>Google email sign-in</strong>
                <span>Use your authorized Google account to enter the Director dashboard.</span>
              </div>
              {googleSignInConfigured ? (
                <a className="primary-button google-sign-in-button" href={`${apiRoot}/admin/google/sign-in`}>
                  Continue with Google
                </a>
              ) : (
                <>
                  <button className="primary-button google-sign-in-button" type="button" disabled>
                    Continue with Google
                  </button>
                  <span className="google-sign-in-setup">
                    Set the Director email in the API’s private Google OAuth JSON and add its redirect URI to the Google Cloud OAuth client.
                  </span>
                </>
              )}
            </div>
            {adminConfigured && (
              <>
                {googleSignInConfigured && <p className="form-hint">Or use the admin password.</p>}
                <form className="admin-password-form" onSubmit={handleLogin}>
                  <label>
                    Admin password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <button type="submit" className="primary-button" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
              </>
            )}
          </section>
        ) : (
          <div className="dashboard-content">
            <div className="dashboard-toolbar">
              <div>
                <span className="eyebrow">Studio sender</span>
                <p>
                  {gmailConnected
                    ? `Connected as ${gmailAddress}`
                    : 'Connect Google Workspace to send welcome messages and broadcasts.'}
                </p>
              </div>
              <div className="dashboard-toolbar-actions">
                <button
                  type="button"
                  className="tool-button"
                  onClick={() => window.location.assign(`${apiRoot}/admin/gmail/connect`)}
                  disabled={busy}
                >
                  <Mail size={15} /> {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
                </button>
                <button type="button" className="tool-button secondary" onClick={handleLogout} disabled={busy}>
                  Sign out
                </button>
              </div>
            </div>

            <section className="broadcast-panel">
              <div className="broadcast-heading">
                <div>
                  <span className="eyebrow">Member communications</span>
                  <h2 className="display">Write to the room.</h2>
                </div>
                <span className="tag">{members.filter((member) => member.status === 'approved' && member.active).length} active members</span>
              </div>
              <form className="member-form broadcast-form" onSubmit={handleBroadcast}>
                <label>
                  Subject
                  <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required />
                </label>
                <label>
                  Message
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={10000} rows={6} required />
                </label>
                <button type="submit" className="primary-button" disabled={busy || !gmailConnected || members.every((member) => member.status !== 'approved' || !member.active)}>
                  {busy ? 'Working…' : 'Send to all active members'}
                </button>
                {!gmailConnected && <p className="form-hint">Connect studio Gmail before sending.</p>}
              </form>
            </section>

            <div className="dashboard-section-heading">
              <div>
                <span className="eyebrow">Applications awaiting review</span>
                <h2 className="display">{pendingApplications.length} pending.</h2>
              </div>
            </div>
            {legacyMembers.length > 0 && (
              <div className="legacy-import-notice">
                <p>{legacyMembers.length} member card{legacyMembers.length === 1 ? '' : 's'} saved in this browser can be imported into the shared ledger.</p>
                <button type="button" className="tool-button" onClick={importLegacyMembers} disabled={busy}>
                  Import saved cards
                </button>
              </div>
            )}
            {pendingApplications.length === 0 ? (
              <div className="empty-state"><p>There are no membership applications waiting for approval.</p></div>
            ) : (
              <div className="dashboard-grid pending-grid">
                {pendingApplications.map((member) => (
                  <article key={member.memberId} className="dashboard-card pending-application-card">
                    <div className="dashboard-topline">
                      <span className="eyebrow">{member.memberId}</span>
                      <span className="tag pending-tag">Awaiting review</span>
                    </div>
                    <h3 className="display">{member.fullName}</h3>
                    <p>{member.email}</p>
                    <p>{member.title} · {member.role} · {member.city}</p>
                    <p className="application-date">Applied {formatDate(member.issuedAt)}</p>
                    {member.applicationIp && <p className="application-date">Application IP · {member.applicationIp}</p>}
                    <MemberCard3D member={member} />
                    <div className="dashboard-actions">
                      <button type="button" className="tool-button approve-button" onClick={() => approveMember(member)} disabled={busy}>
                        Approve &amp; issue card
                      </button>
                      <button type="button" className="tool-button danger-button" onClick={() => rejectMember(member)} disabled={busy}>
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="dashboard-section-heading">
              <div>
                <span className="eyebrow">Approved membership ledger</span>
                <h2 className="display">{approvedMembers.length} member{approvedMembers.length === 1 ? '' : 's'}.</h2>
              </div>
            </div>
            {approvedMembers.length === 0 ? (
              <div className="empty-state"><p>Approved membership cards will appear here after you approve an application.</p></div>
            ) : (
              <div className="dashboard-grid">
                {approvedMembers.map((member) => (
                  <article key={member.memberId} className={`dashboard-card${member.active ? '' : ' is-inactive'}`}>
                    <div className="dashboard-topline">
                      <span className="eyebrow">{member.memberId}</span>
                      <span className="tag">{member.active ? 'Active' : 'Inactive'} · valid through {member.expiryYear}</span>
                    </div>
                    <p>{member.email}</p>
                    <p>{member.title} · {member.role}</p>
                    <MemberCard3D member={member} />
                    <ul>
                      <li><strong>City</strong> {member.city}</li>
                      <li><strong>Approved</strong> {member.approvedAt ? formatDate(member.approvedAt) : '—'}</li>
                      {member.applicationIp && <li><strong>Application IP</strong> {member.applicationIp}</li>}
                    </ul>
                    {editingMemberId === member.memberId ? (
                      <form className="member-form member-edit-form" onSubmit={handleMemberEdit}>
                        {(Object.keys(editingForm) as Array<keyof JoinMemberForm>).map((field) => (
                          <label key={field}>
                            {field === 'fullName' ? 'Full name' : field.charAt(0).toUpperCase() + field.slice(1)}
                            {field === 'role' ? (
                              <select value={editingForm.role} onChange={(event) => setEditingForm((current) => ({ ...current, role: event.target.value }))} required>
                                {!MEMBER_ROLES.some((role) => role === editingForm.role) && <option value={editingForm.role} disabled>{editingForm.role} (legacy)</option>}
                                {MEMBER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                              </select>
                            ) : field === 'title' ? (
                              <select value={editingForm.title} onChange={(event) => setEditingForm((current) => ({ ...current, title: event.target.value }))} required>
                                {!MEMBER_TITLES.some((title) => title === editingForm.title) && <option value={editingForm.title} disabled>{editingForm.title} (legacy)</option>}
                                {MEMBER_TITLES.map((title) => <option key={title} value={title}>{title}</option>)}
                              </select>
                            ) : (
                              <input
                                type={field === 'email' ? 'email' : 'text'}
                                value={editingForm[field]}
                                onChange={(event) => setEditingForm((current) => ({ ...current, [field]: event.target.value }))}
                                required
                              />
                            )}
                          </label>
                        ))}
                        <div className="dashboard-actions">
                          <button type="submit" className="tool-button" disabled={busy}>Save changes</button>
                          <button type="button" className="tool-button secondary" onClick={() => setEditingMemberId(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="dashboard-actions dashboard-member-actions">
                        <button type="button" className="tool-button" onClick={() => {
                          void downloadMemberCard(member).catch((error: unknown) => {
                            setNotice(error instanceof Error ? error.message : 'The member card could not be downloaded.');
                          });
                        }}>
                          <Download size={15} /> Signed card
                        </button>
                        <button type="button" className="tool-button" onClick={() => beginEdit(member)} disabled={busy}>Edit</button>
                        <button type="button" className="tool-button" onClick={() => resendWelcome(member)} disabled={busy || !gmailConnected}>
                          <Mail size={15} /> Welcome
                        </button>
                        <button type="button" className="tool-button secondary" onClick={() => toggleMemberActive(member)} disabled={busy}>
                          {member.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button type="button" className="tool-button danger-button" onClick={() => deleteMember(member)} disabled={busy}>Remove</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {rejectedApplications.length > 0 && (
              <section className="rejected-applications">
                <div className="dashboard-section-heading">
                  <div>
                    <span className="eyebrow">Closed applications</span>
                    <h2 className="display">{rejectedApplications.length} rejected.</h2>
                  </div>
                </div>
                <div className="rejected-application-list">
                  {rejectedApplications.map((member) => (
                    <article key={member.memberId}>
                      <div>
                        <strong>{member.fullName}</strong>
                        <span>{member.email} · {member.memberId}</span>
                      </div>
                      <button type="button" className="tool-button danger-button" onClick={() => deleteMember(member)} disabled={busy}>
                        Remove record
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="broadcast-history">
              <span className="eyebrow">Recent sends</span>
              <h2 className="display">Broadcast history.</h2>
              {broadcasts.length === 0 ? (
                <p>No broadcasts have been sent.</p>
              ) : (
                <ul>
                  {broadcasts.map((broadcast) => (
                    <li key={broadcast.id}>
                      <span>{broadcast.subject}</span>
                      <span>{broadcast.recipientCount - broadcast.failedCount}/{broadcast.recipientCount} delivered</span>
                      <span>{formatDate(broadcast.sentAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Home() {
  const [introVisible, setIntroVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<(typeof projects)[number] | null>(null);

  const closeProject = () => setActiveProject(null);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="site-shell">
      {introVisible && <IntroSplash onComplete={() => setIntroVisible(false)} />}

      <header className="site-nav">
        <a href="#top" className="nav-mark" data-testid="link-home" aria-label={siteConfig.ui.homeAriaLabel}>
          <img src={logoPath} alt={siteConfig.brand.logoAlt} />
        </a>
        <button type="button" className="nav-menu" onClick={() => setMenuOpen((open) => !open)} data-testid="button-toggle-menu" aria-label={menuOpen ? siteConfig.ui.closeMenuAriaLabel : siteConfig.ui.openMenuAriaLabel} aria-expanded={menuOpen}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label={siteConfig.ui.primaryNavigationAriaLabel}>
          {siteConfig.navigation.map((item) => (
            <a key={item.id} href={item.href} onClick={() => setMenuOpen(false)} data-testid={`link-${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title" className="display">
              {siteConfig.hero.title.leading}
              <em>{siteConfig.hero.title.accent}</em>
            </h1>
            <div className="hero-bottom">
              <p className="hero-intro">
                <strong>{siteConfig.hero.introduction.lead}</strong>{' '}
                {siteConfig.hero.introduction.body}
              </p>
              <button type="button" className="scroll-cue" onClick={() => scrollTo(siteConfig.hero.ctaTarget)} data-testid="button-explore-games">
                <i aria-hidden="true" />
                {siteConfig.hero.ctaLabel}
              </button>
            </div>
          </div>
        </section>

        <section className="section reel-section" aria-labelledby="reel-title">
          <Reveal className="section-head">
            <div>
              <h2 id="reel-title" className="section-title display">{siteConfig.reel.title}</h2>
            </div>
            <p className="section-note">{siteConfig.reel.description}</p>
          </Reveal>
          <Reveal delay="delay-1">
            <div className="reel-frame">
              <div className="reel-screen">
                <img className="reel-image" src={reelImagePath} alt={siteConfig.reel.imageAlt} />
                <span className="reel-screen-caption">{siteConfig.reel.caption}</span>
              </div>
            </div>
          </Reveal>
        </section>

        <section id="games" className="section games-section" aria-labelledby="games-title">
          <Reveal className="section-head">
            <div>
              <h2 id="games-title" className="section-title display">{siteConfig.games.title}</h2>
            </div>
            <p className="section-note">{siteConfig.games.description}</p>
          </Reveal>
          <Reveal delay="delay-1">
            <div className="games-grid">
              {projects.map((project) => (
                <button type="button" className="game-card game-card-image" key={project.id} onClick={() => setActiveProject(project)} data-testid={`button-project-${project.id}`} aria-label={`${siteConfig.ui.projectAriaLabel} ${project.title}`}>
                  <img className="game-card-image-media" src={assetPath(project.image)} alt={project.imageAlt} />
                </button>
              ))}
            </div>
          </Reveal>
          <div className="games-cta">
            <a className="text-link" href={siteConfig.games.readMoreTarget} data-testid="link-more-notes">
              {siteConfig.games.readMoreLabel} <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="studio" className="section manifesto-section" aria-labelledby="manifesto-title">
          <Reveal className="manifesto-content">
            <h2 id="manifesto-title" className="display">
              {siteConfig.studio.manifesto.lines.map((line, index) => (
                index % 2 === 1 ? <span key={line}>{line}</span> : <span key={line} className="manifesto-line">{line}</span>
              ))}
            </h2>
            <div className="manifesto-foot">
              <p>{siteConfig.studio.manifesto.body}</p>
              <span className="mono">{siteConfig.studio.manifesto.attribution}</span>
            </div>
          </Reveal>
        </section>

        <section className="section studio-section" aria-labelledby="method-title">
          <Reveal className="section-head">
            <div>
              <h2 id="method-title" className="section-title display">{siteConfig.studio.title}</h2>
            </div>
            <p className="section-note">{siteConfig.studio.description}</p>
          </Reveal>
          <div className="studio-layout">
            <Reveal className="studio-intro" delay="delay-1">
              <span className="mono">{siteConfig.studio.workingBriefLabel}</span>
              {siteConfig.studio.introduction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </Reveal>
            <div className="studio-list">
              {siteConfig.studio.methods.map((method, index) => (
                <Reveal key={method.number} delay={`delay-${index + 1}`}>
                  <article className="studio-row">
                    <span className="number">{method.number}</span>
                    <div>
                      <h3 className="display">{method.title}</h3>
                      <p>{method.description}</p>
                    </div>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="notes" className="section notes-section" aria-labelledby="notes-title">
          <Reveal className="section-head">
            <div>
              <h2 id="notes-title" className="section-title display">{siteConfig.notes.title}</h2>
            </div>
            <p className="section-note">{siteConfig.notes.description}</p>
          </Reveal>
          <div className="notes-layout">
            <Reveal className="notes-aside">
              <p>{siteConfig.notes.aside}</p>
            </Reveal>
            <div className="notes-list">
              {siteConfig.notes.entries.map((note, index) => (
                <Reveal key={note.title} delay={`delay-${index + 1}`}>
                  <a className="note" href={note.href} data-testid={`link-note-${index + 1}`}>
                    <span className="note-date">{note.date}</span>
                    <span>
                      <h3>{note.title}</h3>
                      <p>{note.description}</p>
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="footer">
        <div className="footer-top">
          <img className="footer-logo" src={footerLogoPath} alt={siteConfig.footer.logoAlt} />
          <p>{siteConfig.footer.description}</p>
        </div>
        <div className="footer-call">
          <h2 className="display">
            {siteConfig.footer.headline.leading}
            <br />
            <em>{siteConfig.footer.headline.accent}</em>
          </h2>
        </div>
        <a className="conversation-button" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(siteConfig.footer.email)}`} target="_blank" rel="noreferrer" aria-label={siteConfig.footer.emailLabel} data-testid="button-start-conversation">
          {siteConfig.footer.emailLabel}
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <div className="footer-bottom">
          <span>{siteConfig.footer.copyright}</span>
          <div className="footer-links">
            <a className="back-to-top" href="#top" data-testid="link-back-top">
              <ArrowUp size={14} aria-hidden="true" />
              {siteConfig.footer.backToTopLabel}
            </a>
            <div className="social-links" aria-label={siteConfig.ui.socialLinksAriaLabel}>
              {siteConfig.footer.socialLinks.map((social) => {
                const Icon = socialIconMap[social.icon];
                return (
                  <a className="social-link" href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} key={social.id} data-testid={`link-${social.id}`}>
                    <Icon size={social.icon === 'youtube' ? 18 : 17} aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </footer>

      {activeProject && <ProjectModal project={activeProject} onClose={closeProject} />}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/join" component={JoinPage} />
        <Route path="/dir" component={DirectorDashboard} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  useEffect(() => {
    document.title = siteConfig.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', siteConfig.meta.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', siteConfig.meta.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', siteConfig.meta.description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', siteConfig.meta.title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', siteConfig.meta.description);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;