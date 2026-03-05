import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Storage } from '../services/storage';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

const API_URL = 'http://localhost:3000';

type Message = {
  id: string;
  content: string;
  sender_id: string;
  sender_username: string;
  created_at: string;
  type: string;
  reply_to?: string;
  reply_content?: string;
  reply_username?: string;
  chatId?: string;
};

type CurrentUser = {
  id: string;
  username: string;
  karma: number;
};

export default function ChatScreen({ navigation, route }: Props) {
  const { chatId, chatName, isGroup } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showCursor, setShowCursor] = useState(true);

  const scrollRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<TextInput>(null);
  const typingTimeout = useRef<any>(null);
  const currentUserRef = useRef<CurrentUser | null>(null);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    const t = setInterval(() => setShowCursor(p => !p), 500);
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

  useEffect(() => {
    boot();
    return () => { socketRef.current?.disconnect(); };
  }, []);

  const boot = async () => {
    try {
      const rawToken = await Storage.get('accessToken');
      const rawUser = await Storage.get('user');
      if (!rawToken || !rawUser) { navigation.replace('Boot'); return; }

      const user: CurrentUser = JSON.parse(rawUser);
      setCurrentUser(user);
      currentUserRef.current = user;

      const res = await axios.get(`${API_URL}/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${rawToken}` }
      });
      setMessages(res.data);
      connectSocket(rawToken);
    } catch (err) {
      console.error('Boot error:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectSocket = (token: string) => {
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => { setConnected(true); socket.emit('chat:join', chatId); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('message:new', (msg: Message) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    socket.on('typing', (data: any) => {
      if (data.chatId !== chatId) return;
      if (data.isTyping) {
        setTypingUsers(prev => prev.includes(data.username) ? prev : [...prev, data.username]);
      } else {
        setTypingUsers(prev => prev.filter(u => u !== data.username));
      }
    });
    socketRef.current = socket;
  };

  const handleTyping = () => {
    socketRef.current?.emit('typing', { chatId, isTyping: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketRef.current?.emit('typing', { chatId, isTyping: false });
    }, 1500);
  };

  const sendMessage = () => {
    if (!input.trim() || sending || !connected) return;
    const content = input.trim();

    // "exit" navigates back to the terminal
    if (content.toLowerCase() === 'exit') {
      setInput('');
      socketRef.current?.disconnect();
      navigation.goBack();
      return;
    }

    setInput('');
    setSending(true);
    socketRef.current?.emit('message:send', { chatId, content, replyTo: replyTo?.id || null }, (res: any) => {
      setSending(false);
      if (res?.error) console.error('Send failed:', res.error);
    });
    setReplyTo(null);
    socketRef.current?.emit('typing', { chatId, isTyping: false });
    clearTimeout(typingTimeout.current);
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });

  const isMine = (msg: Message) =>
    currentUserRef.current !== null && String(msg.sender_id) === String(currentUserRef.current.id);

  const scrollDown = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const focusInput = () => inputRef.current?.focus();

  if (loading || !currentUser) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color="#00FF41" />
        <Text style={s.loadingText}>connecting...</Text>
      </View>
    );
  }

  const prompt = `${currentUser.username}@${chatName}:~$ `;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={s.pressable} onPress={focusInput}>
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {/* Header info as terminal lines */}
          <Text style={s.line}>
            <Text style={s.headerName}>{isGroup ? '#' : '@'}{chatName}</Text>
            <Text style={s.dim}> — {isGroup ? 'group' : 'dm'}</Text>
          </Text>
          <Text style={[s.line, { color: connected ? '#00FF41' : '#5A7A5A' }]}>
            {connected ? '● connected' : '○ reconnecting...'}
          </Text>
          <Text style={s.divider}>── session started {new Date().toLocaleDateString()} ──</Text>
          <Text style={s.blank}>{''}</Text>

          {messages.length === 0 && (
            <Text style={s.emptyText}>── no messages yet ──</Text>
          )}

          {messages.map(msg => {
            const mine = isMine(msg);

            if (msg.type === 'system') {
              return <Text key={msg.id} style={s.systemMsg}>── {msg.content} ──</Text>;
            }

            return (
              <TouchableOpacity key={msg.id} onLongPress={() => setReplyTo(msg)} activeOpacity={0.8}>
                {msg.reply_content && (
                  <Text style={s.replyLine}>  ↩ {msg.reply_username}: {msg.reply_content}</Text>
                )}
                <Text style={s.line}>
                  <Text style={s.ts}>[{formatTime(msg.created_at)}] </Text>
                  <Text style={mine ? s.myUser : s.otherUser}>{msg.sender_username}:~$ </Text>
                  <Text style={mine ? s.myText : s.otherText}>{msg.content}</Text>
                </Text>
              </TouchableOpacity>
            );
          })}

          {typingUsers.length > 0 && (
            <Text style={s.typing}>{typingUsers.join(', ')} is typing...</Text>
          )}

          <Text style={s.blank}>{''}</Text>

          {/* Reply indicator inline */}
          {replyTo && (
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Text style={s.replyLine}>  ↩ replying to {replyTo.sender_username}: {replyTo.content}  <Text style={s.dim}>[✕]</Text></Text>
            </TouchableOpacity>
          )}

          {/* Inline input — no box, no border, just prompt + text + cursor */}
          <View style={s.inputLine}>
            <Text style={s.prompt}>{prompt}</Text>
            <View style={s.inputWrap}>
              <Text style={s.inputSizer} pointerEvents="none">
                {input}
              </Text>
              <TextInput
                ref={inputRef}
                style={s.input}
                value={input}
                onChangeText={text => { setInput(text); handleTyping(); }}
                onSubmitEditing={sendMessage}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                caretHidden={true}
                blurOnSubmit={false}
                returnKeyType="send"
                editable={connected}
              />
            </View>
            <Text style={[s.cursor, { opacity: showCursor ? 1 : 0 }]}>█</Text>
          </View>

        </ScrollView>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#070A07' },
  pressable:      { flex: 1 },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 12, paddingBottom: 40, backgroundColor: '#070A07' },
  loading:        { flex: 1, backgroundColor: '#070A07', justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:    { color: '#5A7A5A', fontFamily: 'monospace', fontSize: 12 },

  // terminal lines
  line:           { fontFamily: 'monospace', fontSize: 13, lineHeight: 22, color: '#C8FFC8' },
  blank:          { fontFamily: 'monospace', fontSize: 13, lineHeight: 12 },
  headerName:     { color: '#00FF41', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
  dim:            { color: '#5A7A5A', fontFamily: 'monospace', fontSize: 13 },
  divider:        { color: '#1A3A1A', fontFamily: 'monospace', fontSize: 11, lineHeight: 22, textAlign: 'center' },
  emptyText:      { color: '#2A4A2A', fontFamily: 'monospace', fontSize: 12, lineHeight: 22, textAlign: 'center', marginTop: 8 },

  // timestamp
  ts:             { color: '#1A4A1A', fontFamily: 'monospace', fontSize: 11 },

  // my messages — bright green
  myUser:         { color: '#00FF41', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
  myText:         { color: '#C8FFC8', fontFamily: 'monospace', fontSize: 13 },

  // other messages — bright cyan
  otherUser:      { color: '#00BFFF', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
  otherText:      { color: '#CCE8FF', fontFamily: 'monospace', fontSize: 13 },

  // system / reply / typing
  systemMsg:      { color: '#1A3A1A', fontFamily: 'monospace', fontSize: 11, lineHeight: 22, textAlign: 'center' },
  replyLine:      { color: '#2A5A2A', fontFamily: 'monospace', fontSize: 11, lineHeight: 20, paddingLeft: 8 },
  typing:         { color: '#5A7A5A', fontFamily: 'monospace', fontSize: 11, lineHeight: 22 },

  // inline input
  inputLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    backgroundColor: 'transparent',
  },
  prompt: {
    color: '#00FF41',
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
    color: '#00FF41',
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
    color: '#00FF41',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 22,
  },
});