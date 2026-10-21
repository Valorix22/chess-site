/* ============================================================
   GAMBIT — demo data
   ============================================================ */
window.GAMBIT = {
  demoUser: {
    name: 'Alex Morgan', handle: '@alexm', rating: 1842, joined: 'March 2021',
    country: 'United Kingdom', flag: '🇬🇧', tone: '', online: true,
    bio: 'Club player, opening nerd, and serial blitz addict. Trying to break 1900 before summer.',
    stats: { rapid: 1842, blitz: 1716, bullet: 1604, puzzles: 2108, games: 2384, wins: 1247, draws: 402, losses: 735 }
  },
  friends: [
    { id: 'f1', name: 'Maya Chen', handle: '@mayachen', rating: 2104, status: 'online', activity: 'Browsing puzzles', tone: 'tone-2', flag: '🇨🇦' },
    { id: 'f2', name: 'Diego Alvarez', handle: '@diegoalv', rating: 1976, status: 'playing', activity: 'Rapid 10+0 vs. @tomas_k', tone: 'tone-3', flag: '🇪🇸' },
    { id: 'f3', name: 'Ingrid Larsen', handle: '@ingridl', rating: 2231, status: 'online', activity: 'In a study: Berlin Endgame', tone: 'tone-4', flag: '🇳🇴' },
    { id: 'f4', name: 'Tomas Kowalski', handle: '@tomas_k', rating: 1888, status: 'playing', activity: 'Rapid 10+0 vs. @diegoalv', tone: 'tone-5', flag: '🇵🇱' },
    { id: 'f5', name: 'Ravi Patel', handle: '@ravip', rating: 1650, status: 'online', activity: 'Analysing a game', tone: 'tone-6', flag: '🇮🇳' },
    { id: 'f6', name: 'Sofia Rossi', handle: '@sofiar', rating: 2020, status: 'offline', activity: 'Last seen 2h ago', tone: 'tone-7', flag: '🇮🇹' },
    { id: 'f7', name: 'Noah Williams', handle: '@noahw', rating: 1744, status: 'online', activity: 'Watching Titled Tuesday', tone: 'tone-8', flag: '🇺🇸' },
    { id: 'f8', name: 'Amara Okafor', handle: '@amarao', rating: 1912, status: 'online', activity: 'In the club lobby', tone: 'tone-3', flag: '🇳🇬' }
  ],
  requests: [
    { id: 'r1', name: 'Lucas Meyer', handle: '@lucasm', rating: 1820, tone: 'tone-5', flag: '🇩🇪', note: 'We played in the Spring Open — rematch?' },
    { id: 'r2', name: 'Yuki Tanaka', handle: '@yukit', rating: 2055, tone: 'tone-2', flag: '🇯🇵', note: 'Follows your Sicilian study.' },
    { id: 'r3', name: 'Elena Petrova', handle: '@elenap', rating: 1738, tone: 'tone-4', flag: '🇧🇬', note: 'From the "London System" club.' }
  ],
  notifications: [
    { id: 'n1', icon: 'users', text: '<b>Maya Chen</b> accepted your friend request.', time: '2 minutes ago', unread: true },
    { id: 'n2', icon: 'sword', text: '<b>Diego Alvarez</b> challenged you to a 3+2 blitz game.', time: '11 minutes ago', unread: true, actions: true },
    { id: 'n3', icon: 'trophy', text: 'You finished <b>#14</b> in the Sunset Blitz Arena.', time: '1 hour ago', unread: true },
    { id: 'n4', icon: 'book', text: 'New lesson unlocked: <b>Converting the Exchange</b>.', time: '3 hours ago', unread: false },
    { id: 'n5', icon: 'flame', text: 'Puzzle streak extended to <b>12 days</b>. Keep it alive!', time: 'Yesterday', unread: false }
  ],
  puzzles: [
    {
      id: 'p1', title: 'Back-rank finish', rating: 860, theme: 'Back-rank mate', moves: 1,
      fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
      solution: [['d1', 'd8']],
      hint: 'The eighth rank is completely undefended. Bring the heavy piece.',
      line: 'Rd8# — the king is boxed in by its own pawns.'
    },
    {
      id: 'p2', title: 'Smothered mate', rating: 1120, theme: 'Mate in 1', moves: 1,
      fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
      solution: [['g5', 'f7']],
      hint: 'The knight can deliver check from a square no one can capture.',
      line: 'Nf7# — the king suffocates behind its own pieces.'
    },
    {
      id: 'p3', title: "Scholar's finish", rating: 980, theme: 'Mate in 1', moves: 1,
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
      solution: [['h5', 'f7']],
      hint: 'Two attackers are already pointed at the weakest square.',
      line: 'Qxf7# — the bishop on c4 covers the escape square.'
    },
    {
      id: 'p4', title: 'Royal fork', rating: 1340, theme: 'Knight fork', moves: 3,
      fen: 'r3k3/7p/4N3/8/8/8/8/4K3 w - - 0 1',
      solution: [['e6', 'c7'], ['e8', 'd8'], ['c7', 'a8']],
      hint: 'Find the square where the knight touches both the king and the rook.',
      line: 'Nc7+ forks king and rook. After the king moves, Nxa8 wins the rook.'
    },
    {
      id: 'p5', title: 'Skewer the queen', rating: 1210, theme: 'Skewer', moves: 1,
      fen: 'k7/q7/8/8/8/8/8/R3K1B1 w - - 0 1',
      solution: [['a1', 'a7']],
      hint: 'The bishop on g1 guards a long diagonal. The queen is not as safe as it looks.',
      line: 'Rxa7+ wins the queen — the bishop covers the king\'s recapture.'
    },
    {
      id: 'p6', title: 'Fork the queen', rating: 1460, theme: 'Knight fork', moves: 3,
      fen: '4k3/8/4N3/3q4/8/8/8/4K3 w - - 0 1',
      solution: [['e6', 'c7'], ['e8', 'd8'], ['c7', 'd5']],
      hint: 'The queen on d5 is attacking your knight. Move it somewhere useful.',
      line: 'Nc7+ forks king and queen. After the king steps aside, Nxd5.'
    }
  ],
  courses: [
    { id: 'c1', title: 'The Complete Openings Bootcamp', level: 'Beginner', lessons: 24, done: 15, hours: 6.5, tone: 'tone-g1', glyph: '♟', desc: 'Build a reliable repertoire from move one — principles, plans, and the traps to avoid.' },
    { id: 'c2', title: 'Tactics: Pattern Recognition', level: 'Intermediate', lessons: 32, done: 9, hours: 8, tone: 'tone-g2', glyph: '♞', desc: 'Train forks, pins, skewers and discovered attacks until they jump off the board.' },
    { id: 'c3', title: 'Endgame Mastery', level: 'Intermediate', lessons: 18, done: 18, hours: 4.5, tone: 'tone-g3', glyph: '♜', desc: 'Convert winning positions with confidence, from Lucena to the dreaded opposite bishops.' },
    { id: 'c4', title: 'The Art of Attack', level: 'Advanced', lessons: 21, done: 3, hours: 7, tone: 'tone-g4', glyph: '♛', desc: 'Sacrifices, Greek gifts and king hunts — learn to finish games in style.' },
    { id: 'c5', title: 'Positional Play, Explained', level: 'Advanced', lessons: 16, done: 0, hours: 5.5, tone: 'tone-g5', glyph: '♝', desc: 'Pawn structures, weak squares and prophylaxis for players who want to outplay, not out-tactic.' },
    { id: 'c6', title: 'Blitz Survival Guide', level: 'All levels', lessons: 12, done: 12, hours: 2.5, tone: 'tone-g6', glyph: '♚', desc: 'Practical time management, opening shortcuts and the psychology of fast chess.' }
  ],
  lessonRows: [
    { n: 13, title: 'The Italian: Giuoco Piano plans', dur: '12 min', done: true },
    { n: 14, title: 'Evans Gambit: punishing ...Nxd4', dur: '16 min', done: true },
    { n: 15, title: 'Two Knights: the Fried Liver', dur: '18 min', done: false, current: true },
    { n: 16, title: 'Positional sacrifice on f7', dur: '14 min', done: false },
    { n: 17, title: 'Structuring your first repertoire', dur: '21 min', done: false },
    { n: 18, title: 'Opening quiz: 20 positions', dur: '10 min', done: false }
  ],
  streams: [
    { id: 's1', title: 'Titled Tuesday — round 7 with 12 seconds left', streamer: 'NadiaPetrova', tone: 'tone-g1', poster: 'Titled Tuesday', viewers: '18.4k', cat: 'Blitz', live: true, toneAv: 'tone-4' },
    { id: 's2', title: 'Road to 2600: rating climb, no engine', streamer: 'GM_Marcus', tone: 'tone-g2', poster: 'Road to 2600', viewers: '9.2k', cat: 'Rapid', live: true, toneAv: 'tone-2' },
    { id: 's3', title: 'Puzzle rush world record attempt (again)', streamer: 'PuzzleQueen', tone: 'tone-g3', poster: 'Puzzle Rush', viewers: '6.7k', cat: 'Puzzles', live: true, toneAv: 'tone-3' },
    { id: 's4', title: 'Sicilian Najdorf deep dive — your lines', streamer: 'CoachElias', tone: 'tone-g4', poster: 'Najdorf Lab', viewers: '3.1k', cat: 'Study', live: true, toneAv: 'tone-5' },
    { id: 's5', title: 'Evening blitz arena with the club', streamer: 'AmaraOkafor', tone: 'tone-g5', poster: 'Club Arena', viewers: '1.8k', cat: 'Blitz', live: true, toneAv: 'tone-3' },
    { id: 's6', title: 'Beginner Q&A: your opening questions', streamer: 'RaviPatel', tone: 'tone-g6', poster: 'Open Clinic', viewers: '940', cat: 'Beginner', live: true, toneAv: 'tone-6' },
    { id: 's7', title: 'Endgame marathon: 100 rook endings', streamer: 'IngridLarsen', tone: 'tone-g2', poster: 'Rook Endings', viewers: '2.4k', cat: 'Endgames', live: true, toneAv: 'tone-4' },
    { id: 's8', title: 'Speedrun: 2,000 puzzle rating before midnight', streamer: 'MayaChen', tone: 'tone-g4', poster: 'Puzzle Speedrun', viewers: '1.2k', cat: 'Puzzles', live: true, toneAv: 'tone-2' }
  ],
  broadcasts: [
    { id: 'b1', name: 'Global Chess League — Finals', flag: '🌍', status: 'LIVE', round: 'Game 4 of 6', pair: 'Alpine Kings vs. Coastal Sharks', viewers: '42.1k' },
    { id: 'b2', name: 'Tata Steel Masters', flag: '🇳🇱', status: 'LIVE', round: 'Round 9', pair: 'Carlsen vs. Gukesh', viewers: '31.7k' },
    { id: 'b3', name: 'Women\'s Candidates', flag: '🇨🇦', status: 'LIVE', round: 'Round 6', pair: 'Ju vs. Goryachkina', viewers: '12.9k' },
    { id: 'b4', name: 'Chessable Masters', flag: '🌐', status: 'Upcoming', round: 'Starts in 2h 14m', pair: 'Open bracket · 128 players', viewers: '—' },
    { id: 'b5', name: 'European Club Cup', flag: '🇪🇺', status: 'Upcoming', round: 'Tomorrow, 14:00', pair: 'Round 1 pairings out', viewers: '—' }
  ],
  tournaments: [
    { id: 't1', name: 'Sunset Blitz Arena', format: '3+2 Arena', players: 1842, starts: '18:00', prize: '500', emblem: '🌅', joined: false, tone: 'tone-g1', status: 'Today' },
    { id: 't2', name: 'Midnight Rapid', format: '10+5 Swiss', players: 764, starts: '23:30', prize: '250', emblem: '🌙', joined: true, tone: 'tone-g2', status: 'Today' },
    { id: 't3', name: 'Weekend Classical', format: '30+0 Swiss', players: 412, starts: 'Sat 14:00', prize: '1,000', emblem: '♜', joined: false, tone: 'tone-g3', status: 'Saturday' },
    { id: 't4', name: 'Rising Stars U1800', format: '5+3 Arena', players: 986, starts: 'Sun 11:00', prize: '300', emblem: '⭐', joined: false, tone: 'tone-g4', status: 'Sunday' },
    { id: 't5', name: 'Puzzle Sprint', format: '30 puzzles', players: 5231, starts: 'Daily', prize: 'Badge', emblem: '🧩', joined: false, tone: 'tone-g5', status: 'Daily' },
    { id: 't6', name: 'Club Champions Cup', format: '10+2 Team', players: 186, starts: 'Sun 18:00', prize: 'Trophy', emblem: '🏆', joined: false, tone: 'tone-g6', status: 'Sunday' }
  ],
  threads: [
    { id: 'th1', votes: 284, title: 'What is the most underrated opening for club players?', excerpt: 'I have been playing the Colle for two years and honestly it just works. Low theory, clear plans, and nobody at 1600 knows the good responses. Curious what everyone else is secretly playing...', author: 'Ravi Patel', tone: 'tone-6', replies: 142, time: '34 min ago', tag: 'Openings' },
    { id: 'th2', votes: 197, title: 'Post your best "I saw this in a blitz game" tactic', excerpt: 'Dropped a queen sac in a 3+0 last night and my opponent took 11 seconds before finding the only move. The chat was worth it. Post yours — coordinates or PGN.', author: 'Diego Alvarez', tone: 'tone-3', replies: 89, time: '1h ago', tag: 'Tactics' },
    { id: 'th3', votes: 156, title: 'How do you actually study endgames without falling asleep?', excerpt: 'I know they matter. I have the books. I open them, read two pages, and suddenly I am watching puzzle rush. Any systems that worked for you?', author: 'Sofia Rossi', tone: 'tone-7', replies: 204, time: '2h ago', tag: 'Training' },
    { id: 'th4', votes: 93, title: 'Club night recap: the 14-move miniature', excerpt: 'Our Tuesday club had a 14-move game finish with a smothered mate. Full annotations and the one move everyone missed in the post-game analysis.', author: 'Noah Williams', tone: 'tone-8', replies: 37, time: '4h ago', tag: 'Community' }
  ],
  leaderboard: [
    { rank: 1, name: 'Magnus C.', rating: 2839, tone: 'tone-3', flag: '🇳🇴' },
    { rank: 2, name: 'Hikaru N.', rating: 2812, tone: 'tone-2', flag: '🇺🇸' },
    { rank: 3, name: 'Fabiano C.', rating: 2794, tone: 'tone-6', flag: '🇺🇸' },
    { rank: 4, name: 'Gukesh D.', rating: 2783, tone: 'tone-4', flag: '🇮🇳' },
    { rank: 5, name: 'Anish G.', rating: 2768, tone: 'tone-5', flag: '🇮🇳' }
  ],
  recentGames: [
    { result: 'win', opponent: 'Maya Chen', tone: 'tone-2', rating: 2104, color: 'White', opening: 'Italian Game', moves: 34, accuracy: 86, tc: 'Rapid 10+0', delta: 8, date: 'Today' },
    { result: 'loss', opponent: 'Ingrid Larsen', tone: 'tone-4', rating: 2231, color: 'Black', opening: 'Queen\'s Gambit', moves: 41, accuracy: 74, tc: 'Rapid 10+0', delta: -6, date: 'Today' },
    { result: 'win', opponent: 'Ravi Patel', tone: 'tone-6', rating: 1650, color: 'Black', opening: 'Caro-Kann', moves: 28, accuracy: 91, tc: 'Blitz 3+2', delta: 4, date: 'Yesterday' },
    { result: 'draw', opponent: 'Tomas Kowalski', tone: 'tone-5', rating: 1888, color: 'White', opening: 'London System', moves: 52, accuracy: 82, tc: 'Blitz 3+2', delta: 1, date: 'Yesterday' },
    { result: 'win', opponent: 'Noah Williams', tone: 'tone-8', rating: 1744, color: 'White', opening: 'Scotch Game', moves: 23, accuracy: 89, tc: 'Bullet 1+0', delta: 3, date: '2 days ago' },
    { result: 'loss', opponent: 'Amara Okafor', tone: 'tone-3', rating: 1912, color: 'Black', opening: 'King\'s Indian', moves: 38, accuracy: 71, tc: 'Rapid 10+0', delta: -7, date: '2 days ago' }
  ],
  achievements: [
    { icon: 'flame', name: '12-day streak', desc: 'Puzzle streak', locked: false },
    { icon: 'trophy', name: 'Arena winner', desc: 'Sunset Blitz', locked: false },
    { icon: 'target', name: '90% accuracy', desc: 'One game', locked: false },
    { icon: 'bolt', name: 'Bullet 1600', desc: 'Rating milestone', locked: false },
    { icon: 'crown', name: 'Beat a 2000', desc: 'Rapid', locked: false },
    { icon: 'star', name: '25 lessons', desc: 'Course progress', locked: true }
  ],
  clubs: [
    { id: 'cl1', name: 'The London System Society', members: '18.2k', desc: 'Quiet openings, loud results.', emblem: '♟', tone: 'tone-g1', joined: false },
    { id: 'cl2', name: 'Tactics Anonymous', members: '42.7k', desc: 'We meet daily. There are no steps.', emblem: '⚔️', tone: 'tone-g2', joined: true },
    { id: 'cl3', name: 'Endgame Study Group', members: '9.4k', desc: 'Rook endings and chill.', emblem: '♜', tone: 'tone-g3', joined: false },
    { id: 'cl4', name: 'Weekend Blitz Club', members: '26.1k', desc: 'Fast games, friendly faces.', emblem: '⚡', tone: 'tone-g4', joined: true }
  ],
  forumChat: [
    { name: 'Maya Chen', tone: 'tone-2', text: 'Anyone up for a team arena at 20:00? We need two more.' },
    { name: 'Noah Williams', tone: 'tone-8', text: 'I am in. Just finished the endgame course, feeling dangerous.' },
    { name: 'Ingrid Larsen', tone: 'tone-4', text: 'Count me in. I will bring the Berlin.' }
  ]
};
