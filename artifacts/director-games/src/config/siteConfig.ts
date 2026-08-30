export type SocialIconName = 'instagram' | 'youtube' | 'twitter';

export const siteConfig = {
  meta: {
    title: 'The Director Games — Independent Game Studio',
    description:
      'The Director Games makes strange, warm, replayable worlds for people who look a little closer.',
  },

  brand: {
    name: 'The Director Games',
    logo: 'assets/director-logo.png',
    logoAlt: 'The Director Games mascot logo',
    introVideo: 'assets/director-intro-new.mp4',
    introSound: 'assets/director-loading-sound.mp3',
    introAriaLabel: 'The Director Games intro',
    introVideoAriaLabel: 'The Director Games animated logo intro',
  },

  navigation: [
    { id: 'games', label: 'Games', href: '#games' },
    { id: 'studio', label: 'Studio', href: '#studio' },
    { id: 'notes', label: 'Notes', href: '#notes' },
    { id: 'contact', label: 'Say hello', href: '#contact' },
  ],

  hero: {
    title: {
      leading: 'Games with',
      accent: 'direction.',
    },
    introduction: {
      lead: 'The Director Games',
      body: 'is a tiny studio making strange, warm, replayable worlds for people who look a little closer.',
    },
    ctaLabel: 'Explore the slate',
    ctaTarget: '#games',
  },

  reel: {
    title: 'A first look.',
    description: 'A small selection from the worlds we are building.',
    displayLines: ["Director's", 'cut'],
    caption: 'Director Games / 2025',
    body: 'We build games with a clear point of view — intimate stories, tactile systems, and spaces that stay with you.',
    ctaLabel: 'View current work',
    projectId: '01',
  },

  games: {
    title: 'Selected games.',
    description: 'Three projects, each with its own rhythm and reason to play.',
    readMoreLabel: 'Read the notes',
    readMoreTarget: '#notes',
    projects: [
      {
        id: '01',
        title: 'Morrow',
        type: 'Narrative adventure',
        year: 'In production',
        description:
          'A quiet world with loud consequences. Follow the light, then decide what it means.',
        visual: 'game-visual-one',
        modalDescription:
          'We are building this one slowly, with a small team and an unreasonable amount of care.',
      },
      {
        id: '02',
        title: 'Split / Second',
        type: 'Arcade experiment',
        year: 'Prototype',
        description:
          'Make a choice. Make it fast. The room remembers everything.',
        visual: 'game-visual-two',
        modalDescription:
          'A compact experiment in timing, consequence, and the moment before you commit.',
      },
      {
        id: '03',
        title: 'Soft Reset',
        type: 'Playable short',
        year: '2024',
        description:
          'A five-minute game about the things we keep rehearsing.',
        visual: 'game-visual-three',
        modalDescription:
          'A finished playable short about memory, repetition, and the comfort of trying again.',
      },
    ],
  },

  studio: {
    title: 'On set.',
    description: 'A small, senior crew. Fewer meetings. Better weirdness.',
    workingBriefLabel: 'Our working brief',
    introduction: [
      'Leave room for surprise. Keep the controls honest. Stop polishing the wrong thing.',
      'We work from first sketch to final mix, with friends joining us when a project needs a new lens.',
    ],
    manifesto: {
      lines: ['We make', 'the kind of', 'games we', 'talk about later.'],
      body: 'Not because they are loud. Because something in them follows you home. That is the whole job.',
      attribution: 'A note from the director',
    },
    methods: [
      {
        number: '01',
        title: 'Start with a feeling',
        description:
          'Before mechanics, a mood. Before a mood, a question worth playing.',
      },
      {
        number: '02',
        title: 'Cut the noise',
        description:
          'Small scope is not a compromise. It is how the good details get loud.',
      },
      {
        number: '03',
        title: 'Invite the player in',
        description:
          'A little ambiguity is generous. We leave space for your version of the story.',
      },
    ],
  },

  notes: {
    title: 'From the edit.',
    description: 'Dispatches from the workbench, written between builds.',
    aside:
      'Production diaries, tiny discoveries, and things we learned the hard way.',
    entries: [
      {
        date: '14.02.25',
        title: 'The tyranny of the good idea',
        description: 'On editing a game until it can breathe.',
        href: '#contact',
      },
      {
        date: '03.12.24',
        title: 'A room should remember you',
        description: 'Designing spaces that hold a little history.',
        href: '#contact',
      },
      {
        date: '19.08.24',
        title: 'The sound of almost',
        description: 'Why the best audio cue is sometimes the one you miss.',
        href: '#contact',
      },
    ],
  },

  footer: {
    logo: 'assets/director-footer-logo.png',
    logoAlt: 'The Director Games footer logo',
    description:
      'Independent games from a small room somewhere with very good speakers.',
    headline: {
      leading: "Let's make something",
      accent: 'worth playing.',
    },
    email: 'hello@thedirectorgames.com',
    emailLabel: 'Start a conversation',
    newsletter: {
      ariaLabel: 'Join studio mailing list',
      placeholder: 'Your email, if you want the next scene',
      submitAriaLabel: 'Subscribe to studio notes',
      successMessage: 'You are on the list. More soon.',
    },
    copyright: '© 2025 The Director Games',
    backToTopLabel: 'Back to top',
    socialLinks: [
      {
        id: 'instagram',
        label: 'Instagram',
        href: 'https://www.instagram.com',
        icon: 'instagram' as SocialIconName,
      },
      {
        id: 'youtube',
        label: 'YouTube',
        href: 'https://www.youtube.com',
        icon: 'youtube' as SocialIconName,
      },
      {
        id: 'twitter',
        label: 'Twitter',
        href: 'https://twitter.com',
        icon: 'twitter' as SocialIconName,
      },
    ],
  },

  ui: {
    introSkipLabel: 'Skip intro',
    introSkipAriaLabel: 'Skip intro animation',
    introExitDurationMs: 720,
    introFallbackDurationMs: 5600,
    introProgressDurationMs: 5000,
    introSoundVolume: 0.72,
    primaryNavigationAriaLabel: 'Primary navigation',
    homeAriaLabel: 'The Director Games home',
    openMenuAriaLabel: 'Open navigation menu',
    closeMenuAriaLabel: 'Close navigation menu',
    emailAriaLabel: 'Email address',
    socialLinksAriaLabel: 'Social links',
    projectPreviewLabel: 'Preview reel arriving soon',
    projectPreviewAriaLabelSuffix: 'project preview',
    closeProjectAriaLabel: 'Close project details',
    projectAriaLabel: 'View details for',
  },
} as const;

export type SiteProject = (typeof siteConfig.games.projects)[number];