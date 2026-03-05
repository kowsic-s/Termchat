// ─── COMMAND PARSER ───────────────────────────────────────────────────────────
// Parses raw user input into structured commands

export type ParsedCommand =
  | { type: 'LOGIN' }
  | { type: 'REGISTER' }
  | { type: 'LOGOUT' }
  | { type: 'WHOAMI' }
  | { type: 'LS'; flag?: string }
  | { type: 'LS_USERS' }
  | { type: 'CD'; target: string }
  | { type: 'CD_BACK' }
  | { type: 'PWD' }
  | { type: 'FINGER'; username: string }
  | { type: 'WHO' }
  | { type: 'MSG'; content: string }
  | { type: 'ECHO'; content: string }
  | { type: 'TAIL'; lines: number }
  | { type: 'CAT_HISTORY' }
  | { type: 'GREP'; keyword: string }
  | { type: 'CLEAR' }
  | { type: 'HELP' }
  | { type: 'MAN'; command: string }
  | { type: 'MKDIR'; name: string }
  | { type: 'POLL'; question: string; options: string[] }
  | { type: 'VOTE'; option: number }
  | { type: 'FORTUNE' }
  | { type: 'COWSAY'; text: string }
  | { type: 'NEOFETCH' }
  | { type: 'SUDO'; rest: string }
  | { type: 'PING'; username: string }
  | { type: 'UPTIME' }
  | { type: 'LAST' }
  | { type: 'PASSWD' }
  | { type: 'BANNER'; text: string }
  | { type: 'UNKNOWN'; raw: string };

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const parts = raw.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // ── AUTH ──
  if (cmd === 'login') return { type: 'LOGIN' };
  if (cmd === 'register') return { type: 'REGISTER' };
  if (cmd === 'logout' || cmd === 'exit' && parts.length === 1) return { type: 'LOGOUT' };
  if (cmd === 'passwd') return { type: 'PASSWD' };

  // ── PROFILE ──
  if (cmd === 'whoami') return { type: 'WHOAMI' };
  if (cmd === 'neofetch') return { type: 'NEOFETCH' };
  if (cmd === 'uptime') return { type: 'UPTIME' };
  if (cmd === 'last') return { type: 'LAST' };

  // ── NAVIGATION ──
  if (cmd === 'ls') {
    if (parts[1] === 'users' || parts[1] === '-u') return { type: 'LS_USERS' };
    return { type: 'LS', flag: parts[1] };
  }
  if (cmd === 'cd') {
    const target = parts[1];
    if (!target || target === '..') return { type: 'CD_BACK' };
    return { type: 'CD', target };
  }
  if (cmd === 'pwd') return { type: 'PWD' };

  // ── USERS ──
  if (cmd === 'finger') {
    const username = parts[1]?.replace('@', '') || '';
    return { type: 'FINGER', username };
  }
  if (cmd === 'who' || cmd === 'w') return { type: 'WHO' };
  if (cmd === 'ping') {
    const username = parts[1]?.replace('@', '') || '';
    return { type: 'PING', username };
  }

  // ── MESSAGING ──
  if (cmd === 'msg' || cmd === 'echo') {
    // msg "hello world" or msg hello world
    const content = raw.slice(cmd.length).trim().replace(/^["']|["']$/g, '');
    return cmd === 'msg'
      ? { type: 'MSG', content }
      : { type: 'ECHO', content };
  }

  // ── HISTORY ──
  if (cmd === 'tail') {
    const lines = parseInt(parts[1]?.replace('-', '') || '20');
    return { type: 'TAIL', lines: isNaN(lines) ? 20 : lines };
  }
  if (cmd === 'cat' && parts[1] === 'history') return { type: 'CAT_HISTORY' };
  if (cmd === 'history') return { type: 'CAT_HISTORY' };

  // ── SEARCH ──
  if (cmd === 'grep') {
    const keyword = parts[1]?.replace(/["']/g, '') || '';
    return { type: 'GREP', keyword };
  }

  // ── TERMINAL ──
  if (cmd === 'clear') return { type: 'CLEAR' };
  if (cmd === 'help') return { type: 'HELP' };
  if (cmd === 'man') return { type: 'MAN', command: parts[1] || '' };

  // ── GROUPS ──
  if (cmd === 'mkdir') {
    const name = parts[1]?.replace('#', '') || '';
    return { type: 'MKDIR', name };
  }

  // ── TOOLS ──
  if (cmd === '/poll' || cmd === 'poll') {
    // poll "question?" option1 option2 option3
    const match = raw.match(/["']([^"']+)["']\s*(.*)/);
    if (match) {
      const question = match[1];
      const options = match[2].trim().split(/\s+/).filter(Boolean);
      return { type: 'POLL', question, options };
    }
    return { type: 'UNKNOWN', raw };
  }
  if (cmd === 'vote') {
    return { type: 'VOTE', option: parseInt(parts[1] || '0') };
  }

  // ── EASTER EGGS ──
  if (cmd === 'fortune') return { type: 'FORTUNE' };
  if (cmd === 'cowsay') {
    const text = raw.slice(7).trim().replace(/^["']|["']$/g, '');
    return { type: 'COWSAY', text };
  }
  if (cmd === 'sudo') {
    const rest = raw.slice(5).trim();
    return { type: 'SUDO', rest };
  }
  if (cmd === 'banner') {
    const text = raw.slice(7).trim().replace(/^["']|["']$/g, '');
    return { type: 'BANNER', text };
  }

  return { type: 'UNKNOWN', raw };
}

// ─── FORTUNES ─────────────────────────────────────────────────────────────────
export const FORTUNES = [
  "The best way to get a project done faster is to start sooner. — Jim Highsmith",
  "Talk is cheap. Show me the code. — Linus Torvalds",
  "Any fool can write code that a computer can understand. Good programmers write code that humans can understand. — Martin Fowler",
  "First, solve the problem. Then, write the code. — John Johnson",
  "Experience is the name everyone gives to their mistakes. — Oscar Wilde",
  "In order to be irreplaceable, one must always be different. — Coco Chanel",
  "Java is to JavaScript what car is to carpet. — Chris Heilmann",
  "Code is like humor. When you have to explain it, it's bad. — Cory House",
  "Fix the cause, not the symptom. — Steve Maguire",
  "Simplicity is the soul of efficiency. — Austin Freeman",
];

export const randomFortune = () =>
  FORTUNES[Math.floor(Math.random() * FORTUNES.length)];

// ─── HELP TEXT ────────────────────────────────────────────────────────────────
export const HELP_TEXT = `
Available commands:
────────────────────────────────────────
AUTH
  login              sign in to your account
  register           create a new account
  logout             sign out
  whoami             show your profile
  passwd             change password

NAVIGATION
  ls                 list all chats
  ls users           list online users
  cd @username       open DM with user
  cd #group          open group chat
  cd ..              go back to chat list
  pwd                show current location

USERS
  finger @user       view user profile
  who                show online users
  ping @user         notify a user

MESSAGING  (inside a chat)
  msg "text"         send a message
  tail -20           show last 20 messages
  history            show message history
  grep "keyword"     search messages
  clear              clear the screen

GROUPS
  mkdir #name        create a group chat

TOOLS
  poll "q?" a b c    create a poll
  vote 1             vote in a poll
  fortune            random quote
  cowsay "text"      ASCII art message
  neofetch           your profile card
  banner "text"      big ASCII text

EASTER EGGS
  sudo make me a sandwich
  sl
  matrix
  :(){ :|:& };:
────────────────────────────────────────
Type 'man <command>' for details.
`;