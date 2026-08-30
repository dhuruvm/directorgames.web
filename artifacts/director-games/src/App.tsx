import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, ArrowUpRight, Instagram, Menu, Play, Twitter, X, Youtube } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
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
const logoPath = `${assetRoot}assets/director-logo.png`;
const introPath = `${assetRoot}assets/director-intro-new.mp4`;
const introSoundPath = `${assetRoot}assets/director-loading-sound.mp3`;

const projects = [
  {
    id: '01',
    title: 'Morrow',
    type: 'Narrative adventure',
    year: 'In production',
    description: 'A quiet world with loud consequences. Follow the light, then decide what it means.',
    visual: 'game-visual-one',
  },
  {
    id: '02',
    title: 'Split / Second',
    type: 'Arcade experiment',
    year: 'Prototype',
    description: 'Make a choice. Make it fast. The room remembers everything.',
    visual: 'game-visual-two',
  },
  {
    id: '03',
    title: 'Soft Reset',
    type: 'Playable short',
    year: '2024',
    description: 'A five-minute game about the things we keep rehearsing.',
    visual: 'game-visual-three',
  },
];

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const finish = () => {
    if (leaving) return;
    setLeaving(true);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    window.setTimeout(onComplete, 720);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.72;

    const attemptPlayback = () => {
      void audio.play().catch(() => undefined);
    };

    if (audio.readyState >= 2) {
      attemptPlayback();
    } else {
      audio.addEventListener('canplay', attemptPlayback, { once: true });
    }

    return () => {
      audio.removeEventListener('canplay', attemptPlayback);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    const fallback = window.setTimeout(finish, 5600);
    return () => window.clearTimeout(fallback);
  }, []);

  return (
    <div className={`intro-screen ${leaving ? 'is-leaving' : ''}`} aria-label="The Director Games intro">
      <video
        className="intro-video"
        src={introPath}
        autoPlay
        muted
        playsInline
        onEnded={finish}
        aria-label="The Director Games animated logo intro"
      />
      <audio
        ref={audioRef}
        src={introSoundPath}
        autoPlay
        preload="auto"
        aria-hidden="true"
      />
      <button
        type="button"
        className="intro-skip"
        onClick={finish}
        data-testid="button-skip-intro"
        aria-label="Skip intro animation"
      >
        Skip intro
      </button>
      <div className="intro-progress" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function ProjectModal({
  project,
  onClose,
}: {
  project: (typeof projects)[number];
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
          aria-label="Close project details"
        >
          <X size={18} />
        </button>
        <span className="eyebrow">{project.id} / {project.type}</span>
        <h2 id="project-modal-title" className="display">{project.title}</h2>
        <p>{project.description} We are building this one slowly, with a small team and an unreasonable amount of care.</p>
        <div className="modal-film" aria-label={`${project.title} project preview`}>
          <Play size={16} fill="currentColor" aria-hidden="true" />
          Preview reel arriving soon
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
        <a href="#top" className="nav-mark" data-testid="link-home" aria-label="The Director Games home">
          <img src={logoPath} alt="The Director Games mascot logo" />
        </a>
        <button
          type="button"
          className="nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
          data-testid="button-toggle-menu"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={`nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
          <a href="#games" onClick={() => setMenuOpen(false)} data-testid="link-games">Games</a>
          <a href="#studio" onClick={() => setMenuOpen(false)} data-testid="link-studio">Studio</a>
          <a href="#notes" onClick={() => setMenuOpen(false)} data-testid="link-notes">Notes</a>
          <a href="#contact" onClick={() => setMenuOpen(false)} data-testid="link-contact">Say hello</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title" className="display">
              Games with
              <em>direction.</em>
            </h1>
            <div className="hero-bottom">
              <p className="hero-intro">
                <strong>The Director Games</strong> is a tiny studio making strange, warm, replayable worlds for people who look a little closer.
              </p>
              <button type="button" className="scroll-cue" onClick={() => scrollTo('#games')} data-testid="button-explore-games">
                <i aria-hidden="true" />
                Explore the slate
              </button>
            </div>
          </div>
        </section>

        <section className="section reel-section" aria-labelledby="reel-title">
          <Reveal className="section-head">
            <div>
              <h2 id="reel-title" className="section-title display">A first look.</h2>
            </div>
            <p className="section-note">A small selection from the worlds we are building.</p>
          </Reveal>
          <Reveal delay="delay-1">
            <div className="reel-frame">
              <div className="reel-screen">
                <div className="reel-word display">
                  Director's
                  <br />
                  cut
                </div>
                <span className="reel-screen-caption">Director Games / 2025</span>
              </div>
              <div className="reel-copy">
                <p>We build games with a clear point of view — intimate stories, tactile systems, and spaces that stay with you.</p>
                <button
                  type="button"
                  className="reel-play mono"
                  onClick={() => setActiveProject(projects[0])}
                  data-testid="button-watch-reel"
                >
                  <Play size={14} aria-hidden="true" />
                  View current work
                </button>
              </div>
            </div>
          </Reveal>
        </section>

        <section id="games" className="section games-section" aria-labelledby="games-title">
          <Reveal className="section-head">
            <div>
              <h2 id="games-title" className="section-title display">Selected games.</h2>
            </div>
            <p className="section-note">Three projects, each with its own rhythm and reason to play.</p>
          </Reveal>
          <Reveal delay="delay-1">
            <div className="games-grid">
              {projects.map((project) => (
                <button
                  type="button"
                  className="game-card"
                  key={project.id}
                  onClick={() => setActiveProject(project)}
                  data-testid={`button-project-${project.id}`}
                  aria-label={`View details for ${project.title}`}
                >
                  <div className={`game-visual ${project.visual}`} aria-hidden="true" />
                  <div className="game-meta">
                    <span>{project.id} / {project.type}</span>
                    <span>{project.year}</span>
                  </div>
                  <h3 className="game-name display">{project.title}</h3>
                  <p className="game-description">{project.description}</p>
                </button>
              ))}
            </div>
          </Reveal>
          <div className="games-cta">
            <a className="text-link" href="#notes" data-testid="link-more-notes">
              Read the notes <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="studio" className="section manifesto-section" aria-labelledby="manifesto-title">
          <Reveal className="manifesto-content">
            <h2 id="manifesto-title" className="display">
              We make
              <span>the kind of</span>
              games we
              <span>talk about later.</span>
            </h2>
            <div className="manifesto-foot">
              <p>Not because they are loud. Because something in them follows you home. That is the whole job.</p>
              <span className="mono">A note from the director</span>
            </div>
          </Reveal>
        </section>

        <section className="section studio-section" aria-labelledby="method-title">
          <Reveal className="section-head">
            <div>
              <h2 id="method-title" className="section-title display">On set.</h2>
            </div>
            <p className="section-note">A small, senior crew. Fewer meetings. Better weirdness.</p>
          </Reveal>
          <div className="studio-layout">
            <Reveal className="studio-intro" delay="delay-1">
              <span className="mono">Our working brief</span>
              <p>Leave room for surprise. Keep the controls honest. Stop polishing the wrong thing.</p>
              <p>We work from first sketch to final mix, with friends joining us when a project needs a new lens.</p>
            </Reveal>
            <div className="studio-list">
              {[
                ['01', 'Start with a feeling', 'Before mechanics, a mood. Before a mood, a question worth playing.'],
                ['02', 'Cut the noise', 'Small scope is not a compromise. It is how the good details get loud.'],
                ['03', 'Invite the player in', 'A little ambiguity is generous. We leave space for your version of the story.'],
              ].map(([number, title, description], index) => (
                <Reveal key={number} delay={`delay-${index + 1}`}>
                  <article className="studio-row">
                    <span className="number">{number}</span>
                    <div>
                      <h3 className="display">{title}</h3>
                      <p>{description}</p>
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
              <h2 id="notes-title" className="section-title display">From the edit.</h2>
            </div>
            <p className="section-note">Dispatches from the workbench, written between builds.</p>
          </Reveal>
          <div className="notes-layout">
            <Reveal className="notes-aside">
              <p>Production diaries, tiny discoveries, and things we learned the hard way.</p>
            </Reveal>
            <div className="notes-list">
              {[
                ['14.02.25', 'The tyranny of the good idea', 'On editing a game until it can breathe.'],
                ['03.12.24', 'A room should remember you', 'Designing spaces that hold a little history.'],
                ['19.08.24', 'The sound of almost', 'Why the best audio cue is sometimes the one you miss.'],
              ].map(([date, title, description], index) => (
                <Reveal key={title} delay={`delay-${index + 1}`}>
                  <a className="note" href="#contact" data-testid={`link-note-${index + 1}`}>
                    <span className="note-date">{date}</span>
                    <span>
                      <h3>{title}</h3>
                      <p>{description}</p>
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
          <img className="footer-logo" src={logoPath} alt="The Director Games mascot logo" />
          <p>Independent games from a small room somewhere with very good speakers.</p>
        </div>
        <div className="footer-call">
          <h2 className="display">Let's make something<br /><em>worth playing.</em></h2>
          <a className="text-link" href="mailto:hello@thedirectorgames.com" data-testid="link-email">
            Start a conversation <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <form className="newsletter-form" onSubmit={handleNewsletter} aria-label="Join studio mailing list">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => { setEmail(event.target.value); setSubscribed(false); }}
            placeholder="Your email, if you want the next scene"
            aria-label="Email address"
            data-testid="input-newsletter-email"
          />
          <button type="submit" aria-label="Subscribe to studio notes" data-testid="button-subscribe">
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </form>
        {subscribed && <p className="newsletter-success" role="status" data-testid="status-newsletter-success">You are on the list. More soon.</p>}
        <div className="footer-bottom">
          <span>© 2025 The Director Games</span>
          <div className="footer-links">
            <a className="back-to-top" href="#top" data-testid="link-back-top">
              <ArrowUp size={14} aria-hidden="true" />
              Back to top
            </a>
            <div className="social-links" aria-label="Social links">
              <a className="social-link" href="https://www.instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram" data-testid="link-instagram">
                <Instagram size={17} aria-hidden="true" />
              </a>
              <a className="social-link" href="https://www.youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube" data-testid="link-youtube">
                <Youtube size={18} aria-hidden="true" />
              </a>
              <a className="social-link" href="https://twitter.com" target="_blank" rel="noreferrer" aria-label="Twitter" data-testid="link-twitter">
                <Twitter size={17} aria-hidden="true" />
              </a>
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