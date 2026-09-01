import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, ArrowUpRight, Instagram, Menu, Play, Twitter, X, Youtube } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { siteConfig, type SiteProject, type SocialIconName } from '@/config/siteConfig';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

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

function Reveal({
  children,
  className = '',
  delay = '',
}: {
  children: ReactNode;
  className?: string;
  delay?: string;
}) {
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

  return (
    <div ref={ref} className={`reveal ${delay} ${className}`}>
      {children}
    </div>
  );
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
    void audio.play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
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
      <video
        className="intro-video"
        src={introPath}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        aria-label={siteConfig.brand.introVideoAriaLabel}
      />
      <audio
        ref={audioRef}
        src={introSoundPath}
        autoPlay
        preload="auto"
        aria-hidden="true"
      />
      {soundBlocked && (
        <button
          type="button"
          className="intro-sound"
          onClick={attemptSoundPlayback}
          data-testid="button-enable-intro-sound"
          aria-label={siteConfig.ui.introSoundEnableAriaLabel}
        >
          {siteConfig.ui.introSoundEnableLabel}
        </button>
      )}
      <button
        type="button"
        className="intro-skip"
        onClick={finish}
        data-testid="button-skip-intro"
        aria-label={siteConfig.ui.introSkipAriaLabel}
      >
        {siteConfig.ui.introSkipLabel}
      </button>
      <div
        className="intro-progress"
        aria-hidden="true"
        style={{ '--intro-progress-duration': `${siteConfig.ui.introProgressDurationMs}ms` } as CSSProperties}
      >
        <span />
      </div>
    </div>
  );
}

function ProjectModal({
  project,
  onClose,
}: {
  project: SiteProject;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          data-testid="button-close-project"
          aria-label={siteConfig.ui.closeProjectAriaLabel}
        >
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

function Home() {
  const [introVisible, setIntroVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeProject, setActiveProject] = useState<(typeof projects)[number] | null>(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const closeProject = () => setActiveProject(null);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleNewsletter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (email.trim()) setSubscribed(true);
  };

  return (
    <div className="site-shell">
      {introVisible && <IntroSplash onComplete={() => setIntroVisible(false)} />}

      <header className="site-nav">
        <a href="#top" className="nav-mark" data-testid="link-home" aria-label={siteConfig.ui.homeAriaLabel}>
          <img src={logoPath} alt={siteConfig.brand.logoAlt} />
        </a>
        <button
          type="button"
          className="nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="button-toggle-menu"
          aria-label={menuOpen ? siteConfig.ui.closeMenuAriaLabel : siteConfig.ui.openMenuAriaLabel}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label={siteConfig.ui.primaryNavigationAriaLabel}>
          {siteConfig.navigation.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              data-testid={`link-${item.id}`}
            >
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
              <button
                type="button"
                className="scroll-cue"
                onClick={() => scrollTo(siteConfig.hero.ctaTarget)}
                data-testid="button-explore-games"
              >
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
                <button
                  type="button"
                  className="game-card game-card-image"
                  key={project.id}
                  onClick={() => setActiveProject(project)}
                  data-testid={`button-project-${project.id}`}
                  aria-label={`${siteConfig.ui.projectAriaLabel} ${project.title}`}
                >
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
                index % 2 === 1
                  ? <span key={line}>{line}</span>
                  : <span key={line} className="manifesto-line">{line}</span>
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
          <a className="text-link" href={`mailto:${siteConfig.footer.email}`} data-testid="link-email">
            {siteConfig.footer.emailLabel} <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <form className="newsletter-form" onSubmit={handleNewsletter} aria-label={siteConfig.footer.newsletter.ariaLabel}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => { setEmail(event.target.value); setSubscribed(false); }}
            placeholder={siteConfig.footer.newsletter.placeholder}
            aria-label={siteConfig.ui.emailAriaLabel}
            data-testid="input-newsletter-email"
          />
          <button type="submit" aria-label={siteConfig.footer.newsletter.submitAriaLabel} data-testid="button-subscribe">
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </form>
        {subscribed && (
          <p className="newsletter-success" role="status" data-testid="status-newsletter-success">
            {siteConfig.footer.newsletter.successMessage}
          </p>
        )}
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
                  <a
                    className="social-link"
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={social.label}
                    key={social.id}
                    data-testid={`link-${social.id}`}
                  >
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