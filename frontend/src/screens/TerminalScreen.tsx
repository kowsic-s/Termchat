import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Pressable
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { Storage } from '../services/storage';
import { parseCommand, randomFortune, HELP_TEXT } from '../services/commandParser';
import axios from 'axios';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Terminal'>;
};

const API_URL = 'http://localhost:3000';

type Line = {
  id: string;
  text: string;
  color: string;
};

type User = {
  id: string;
  username: string;
  karma: number;
  createdAt?: string;
};

type Chat = {
  id: string;
  name: string | null;
  is_group: boolean;
  last_message: string | null;
  last_message_at: string | null;
  member_count: number;
};

// Colors
const C = {
  green:   '#00FF41',
  dim:     '#2A5A2A',
  dimmer:  '#1A3A1A',
  text:    '#C8FFC8',
  error:   '#FF4444',
  cyan:    '#00BFFF',
  yellow:  '#FFB700',
  bg:      '#070A07',
};

let _id = 0;
const uid = () => String(_id++);

export default function TerminalScreen({ navigation }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [authStep, setAuthStep] = useState<'none' | 'identifier' | 'otp' | 'username'>('none');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authOtp, setAuthOtp] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const userRef = useRef<User | null>(null);
  const tokenRef = useRef('');

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Cursor blink
  useEffect(() => {
    const t = setInterval(() => setShowCursor(p => !p), 530);
    return () => clearInterval(t);
  }, []);

  // Inject global CSS to nuke all input styling on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `
      input, textarea {
        outline: none !important;
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
        -webkit-appearance: none !important;
      }
      input:focus, textarea:focus {
        outline: none !important;
        border: none !important;
        box-shadow: none !important;
      }
      ::-webkit-scrollbar { display: none; }
      * { scrollbar-width: none; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Boot
  useEffect(() => { boot(); }, []);

  const scrollDown = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
  };

  const addLine = (text: string, color = C.text) => {
    setLines(prev => [...prev, { id: uid(), text, color }]);
    scrollDown();
  };

  const addLines = (texts: string[], color = C.text) => {
    const newLines = texts.map(t => ({ id: uid(), text: t, color }));
    setLines(prev => [...prev, ...newLines]);
    scrollDown();
  };

  const boot = async () => {
    const savedToken = await Storage.get('accessToken');
    const savedUser = await Storage.get('user');

    addLine('TermChat v1.0.0', C.green);
    addLine('────────────────────────────────', C.dimmer);

    if (savedToken && savedUser) {
      const u: User = JSON.parse(savedUser);
      setToken(savedToken);
      setUser(u);
      userRef.current = u;
      tokenRef.current = savedToken;
      addLine(`Last login: ${new Date().toDateString()}`, C.dim);
      addLine(`Welcome back, ${u.username}!`, C.green);
      addLine(`Type 'help' for commands.`, C.dim);
    } else {
      addLine(`Type 'login' to sign in or 'register' to create an account.`, C.dim);
    }
    addLine('', C.bg);
  };

  const getPrompt = () => {
    if (authStep === 'identifier') return 'identifier: ';
    if (authStep === 'otp') return 'otp: ';
    if (authStep === 'username') return 'username: ';
    if (userRef.current) return `${userRef.current.username}@termchat:~$ `;
    return 'termchat:~$ ';
  };

  // ── AUTH ────────────────────────────────────────────────────────────────────
  const handleAuth = async (value: string) => {
    if (authStep === 'identifier') {
      setAuthIdentifier(value);
      setLoading(true);
      addLine(`Sending OTP to ${value}...`, C.dim);
      try {
        const res = await axios.post(`${API_URL}/auth/send-otp`, { identifier: value });
        addLine('✓ OTP sent', C.green);
        if (res.data.dev_otp) addLine(`  [DEV] OTP: ${res.data.dev_otp}`, C.yellow);
        addLine('Enter the 6-digit OTP:', C.text);
        setAuthStep('otp');
      } catch {
        addLine('✗ Failed to send OTP. Try again.', C.error);
        setAuthStep('none');
      } finally {
        setLoading(false);
      }

    } else if (authStep === 'otp') {
      setAuthOtp(value);
      setLoading(true);
      addLine('Verifying...', C.dim);
      try {
        const res = await axios.post(`${API_URL}/auth/verify-otp`, {
          identifier: authIdentifier,
          otp: value,
        });
        if (res.data.isNewUser) {
          addLine('✓ OTP verified', C.green);
          addLine('Choose a username (letters, numbers, underscore):', C.text);
          setAuthStep('username');
        } else {
          await loginSuccess(res.data);
        }
      } catch {
        addLine('✗ Invalid or expired OTP.', C.error);
        setAuthStep('none');
      } finally {
        setLoading(false);
      }

    } else if (authStep === 'username') {
      if (value.length < 3) { addLine('✗ Too short (min 3 chars)', C.error); return; }
      if (!/^[a-zA-Z0-9_]+$/.test(value)) { addLine('✗ Only letters, numbers, underscore', C.error); return; }
      setLoading(true);
      try {
        const res = await axios.post(`${API_URL}/auth/verify-otp`, {
          identifier: authIdentifier,
          otp: authOtp,
          username: value,
        });
        await loginSuccess(res.data);
      } catch (err: any) {
        addLine(`✗ ${err.response?.data?.error || 'Failed'}`, C.error);
      } finally {
        setLoading(false);
      }
    }
  };

  const loginSuccess = async (data: any) => {
    await Storage.save('accessToken', data.accessToken);
    await Storage.save('refreshToken', data.refreshToken);
    await Storage.save('user', JSON.stringify(data.user));
    setToken(data.accessToken);
    tokenRef.current = data.accessToken;
    setUser(data.user);
    userRef.current = data.user;
    setAuthStep('none');
    addLine('', C.bg);
    addLine(`✓ Welcome, ${data.user.username}!`, C.green);
    addLine(`Type 'help' to see available commands.`, C.dim);
    addLine('', C.bg);
  };

  // ── COMMANDS ────────────────────────────────────────────────────────────────
  const handleCommand = async (raw: string) => {
    const cmd = parseCommand(raw);
    const u = userRef.current;
    const t = tokenRef.current;

    switch (cmd.type) {

      case 'LOGIN':
        if (u) { addLine(`Already logged in as ${u.username}. Type 'logout' first.`, C.error); break; }
        setAuthMode('login');
        addLine('Enter your email or phone:', C.text);
        setAuthStep('identifier');
        break;

      case 'REGISTER':
        if (u) { addLine(`Already logged in. Type 'logout' first.`, C.error); break; }
        setAuthMode('register');
        addLine('Enter your email to register:', C.text);
        setAuthStep('identifier');
        break;

      case 'LOGOUT':
        if (!u) { addLine('Not logged in.', C.error); break; }
        await Storage.clear();
        const name = u.username;
        setUser(null);
        userRef.current = null;
        setToken('');
        tokenRef.current = '';
        addLine('', C.bg);
        addLine(`✓ Goodbye, ${name}!`, C.green);
        addLine(`Type 'login' to sign in again.`, C.dim);
        addLine('', C.bg);
        break;

      case 'WHOAMI':
        if (!u) { addLine('Not logged in.', C.error); break; }
        addLines([
          '',
          `  user:   ${u.username}`,
          `  karma:  +${u.karma}`,
          `  status: ● online`,
          '',
        ], C.text);
        break;

      case 'NEOFETCH':
        if (!u) { addLine('Not logged in.', C.error); break; }
        addLines([
          '',
          `        .            ${u.username}@termchat`,
          `       /M\\           ─────────────────`,
          `      /MMMM\\         OS:     TermChat v1.0`,
          `     /MMMMMM\\        Karma:  +${u.karma}`,
          `    /MMMMMMMMM\\      Status: ● online`,
          `   /MMMMMMMMMMMM\\    Shell:  termsh`,
          '',
        ], C.green);
        break;

      case 'LS':
        if (!u) { addLine(`Not logged in. Type 'login' first.`, C.error); break; }
        setLoading(true);
        try {
          const res = await axios.get(`${API_URL}/chats`, { headers: { Authorization: `Bearer ${t}` } });
          const chats: Chat[] = res.data;
          addLine('', C.bg);
          if (chats.length === 0) {
            addLine('total 0  ── no chats yet', C.dim);
            addLine(`Use 'cd @username' to start a DM`, C.dim);
          } else {
            addLine(`total ${chats.length}`, C.dim);
            chats.forEach((chat, i) => {
              const name = chat.is_group ? `#${chat.name}` : `@${chat.name}`;
              const meta = chat.is_group ? `${chat.member_count} members` : 'dm     ';
              const preview = (chat.last_message || 'no messages').slice(0, 25);
              addLine(`  ${String(i+1).padStart(2,'0')}  ${name.padEnd(18)} [${meta}]  "${preview}"`, C.text);
            });
          }
          addLine('', C.bg);
        } catch { addLine('✗ Failed to load chats', C.error); }
        finally { setLoading(false); }
        break;

      case 'LS_USERS':
        if (!u) { addLine('Not logged in.', C.error); break; }
        setLoading(true);
        try {
          const res = await axios.get(`${API_URL}/users/search?q=a`, { headers: { Authorization: `Bearer ${t}` } });
          addLine('', C.bg);
          addLine('Users:', C.dim);
          addLine('────────────────────────────────', C.dimmer);
          res.data.forEach((usr: any) => {
            const status = usr.is_online ? '●' : '○';
            addLine(`  ${status}  ${usr.username.padEnd(20)} karma: ${usr.karma}`, usr.is_online ? C.green : C.dim);
          });
          addLine('', C.bg);
        } catch { addLine('✗ Failed', C.error); }
        finally { setLoading(false); }
        break;

      case 'CD':
        if (!u) { addLine('Not logged in.', C.error); break; }
        const target = cmd.target.replace('@', '').replace('#', '');
        setLoading(true);
        addLine(`→ Connecting to ${cmd.target}...`, C.dim);
        try {
          const searchRes = await axios.get(`${API_URL}/users/search?q=${target}`, { headers: { Authorization: `Bearer ${t}` } });
          const found = searchRes.data.find((usr: any) => usr.username.toLowerCase() === target.toLowerCase());
          if (!found) { addLine(`✗ User '${target}' not found`, C.error); break; }
          const dmRes = await axios.post(`${API_URL}/chats/dm`, { userId: found.id }, { headers: { Authorization: `Bearer ${t}` } });
          addLine(`✓ Opening chat with @${found.username}`, C.green);
          navigation.navigate('Chat', { chatId: dmRes.data.chatId, chatName: found.username, isGroup: false });
        } catch { addLine('✗ Failed to connect', C.error); }
        finally { setLoading(false); }
        break;

      case 'CD_BACK':
        addLine('Already at root.', C.dim);
        break;

      case 'PWD':
        addLine(`/termchat/${u?.username ?? 'guest'}`, C.text);
        break;

      case 'FINGER':
        if (!u) { addLine('Not logged in.', C.error); break; }
        setLoading(true);
        try {
          const res = await axios.get(`${API_URL}/users/search?q=${cmd.username}`, { headers: { Authorization: `Bearer ${t}` } });
          const found = res.data.find((usr: any) => usr.username.toLowerCase() === cmd.username.toLowerCase());
          if (!found) { addLine('✗ User not found', C.error); break; }
          addLines([
            '',
            `  user:      ${found.username}`,
            `  karma:     +${found.karma}`,
            `  status:    ${found.is_online ? '● online' : '○ offline'}`,
            `  last seen: ${found.last_seen ? new Date(found.last_seen).toLocaleString() : 'unknown'}`,
            '',
          ], C.text);
        } catch { addLine('✗ Failed', C.error); }
        finally { setLoading(false); }
        break;

      case 'WHO':
        if (!u) { addLine('Not logged in.', C.error); break; }
        addLine(`${u.username}   pts/0   ${new Date().toLocaleTimeString()}   ● online`, C.text);
        break;

      case 'MKDIR':
        if (!u) { addLine('Not logged in.', C.error); break; }
        if (!cmd.name) { addLine('Usage: mkdir #groupname', C.error); break; }
        setLoading(true);
        try {
          await axios.post(`${API_URL}/chats/group`, { name: cmd.name, memberIds: [] }, { headers: { Authorization: `Bearer ${t}` } });
          addLine(`✓ Group #${cmd.name} created`, C.green);
          addLine(`Use 'cd #${cmd.name}' to open it`, C.dim);
        } catch { addLine('✗ Failed to create group', C.error); }
        finally { setLoading(false); }
        break;

      case 'CLEAR':
        setLines([]);
        break;

      case 'HELP':
        addLines(HELP_TEXT.split('\n'), C.dim);
        break;

      case 'MAN':
        addLine('', C.bg);
        addLine(`man: no manual for '${cmd.command}'. Try 'help'.`, C.dim);
        addLine('', C.bg);
        break;

      case 'FORTUNE':
        addLine('', C.bg);
        addLine(`"${randomFortune()}"`, C.yellow);
        addLine('', C.bg);
        break;

      case 'COWSAY': {
        const txt = cmd.text || 'moo';
        const bar = '─'.repeat(txt.length + 2);
        addLines([
          '', `  ┌${bar}┐`, `  │ ${txt} │`, `  └${bar}┘`,
          `       \\   ^__^`, `        \\  (oo)\\_______`,
          `           (__)\\       )\\/\\`,
          `               ||----w |`, `               ||     ||`, '',
        ], C.green);
        break;
      }

      case 'SUDO':
        if (cmd.rest.toLowerCase().includes('make me a sandwich')) {
          addLine('What? Make it yourself.', C.error);
          addLine('(You are not in the sudoers file. This incident will be reported.)', C.dim);
        } else {
          addLine(`sudo: permission denied`, C.error);
        }
        break;

      case 'UPTIME':
        addLine(`up ${Math.floor(Math.random()*24)}h ${Math.floor(Math.random()*60)}m,  1 user,  load average: 0.0${Math.floor(Math.random()*9)}`, C.text);
        break;

      case 'LAST':
        addLine(`${u?.username ?? 'guest'}  pts/0  ${new Date().toDateString()}  still logged in`, C.text);
        break;

      case 'PING':
        addLine(`PING ${cmd.username}: 56 bytes`, C.text);
        addLine(`64 bytes from ${cmd.username}: time=23ms`, C.green);
        addLine(`→ Notification sent to @${cmd.username}`, C.green);
        break;

      case 'BANNER':
        addLine('', C.bg);
        addLine(cmd.text.toUpperCase().split('').join('  '), C.green);
        addLine('', C.bg);
        break;

      case 'MSG':
      case 'ECHO':
      case 'TAIL':
      case 'CAT_HISTORY':
      case 'GREP':
        addLine(`Use 'cd @username' to enter a chat first.`, C.error);
        break;

      case 'UNKNOWN':
        if (!raw.trim()) break;
        addLine(`termchat: command not found: ${raw}`, C.error);
        addLine(`Type 'help' to see available commands.`, C.dim);
        break;
    }
  };

  // ── SUBMIT ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const value = input.trim();
    setInput('');

    // Show typed line (mask OTP)
    const display = authStep === 'otp' ? '••••••' : value;
    addLine(`${getPrompt()}${display}`, C.green);

    if (!value) return;

    if (authStep !== 'none') {
      await handleAuth(value);
    } else {
      await handleCommand(value);
    }
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  const focusInput = () => inputRef.current?.focus();

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable style={s.pressable} onPress={focusInput}>
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {/* all output lines */}
          {lines.map(line => (
            <Text key={line.id} style={[s.line, { color: line.color }]}>
              {line.text}
            </Text>
          ))}

          {/* loading indicator inline */}
          {loading && (
            <Text style={[s.line, { color: C.dim }]}>processing...</Text>
          )}

          {/* current input line — inline with prompt */}
          {!loading && (
            <View style={s.inputLine}>
              <Text style={s.prompt}>{getPrompt()}</Text>
              <View style={s.inputWrap}>
                {/* Hidden text that sizes the input to its content */}
                <Text style={s.inputSizer} pointerEvents="none">
                  {authStep === 'otp' ? '•'.repeat(input.length) : input}
                </Text>
                <TextInput
                  ref={inputRef}
                  style={s.input}
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSubmit}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  secureTextEntry={authStep === 'otp'}
                  caretHidden={true}
                  blurOnSubmit={false}
                  returnKeyType="send"
                />
              </View>
              <Text style={[s.cursor, { opacity: showCursor ? 1 : 0 }]}>█</Text>
            </View>
          )}

        </ScrollView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  pressable: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 40,
    backgroundColor: C.bg,
  },
  line: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 22,
  },
  inputLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  prompt: {
    color: C.green,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 22,
    fontWeight: 'bold',
  },
  inputWrap: {
    position: 'relative' as const,
    justifyContent: 'center' as const,
  },
  inputSizer: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 22,
    color: 'transparent',
    pointerEvents: 'none' as const,
    minWidth: 1,
  },
  input: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: C.green,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 0,
    margin: 0,
    lineHeight: 22,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    caretColor: 'transparent',
    WebkitAppearance: 'none',
    boxShadow: 'none',
    width: '100%',
  } as any,
  cursor: {
    color: C.green,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 22,
  },
});