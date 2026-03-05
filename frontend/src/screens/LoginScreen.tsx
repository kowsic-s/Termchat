import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  TouchableOpacity, ScrollView, Animated, ActivityIndicator
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { theme } from '../theme';
import axios from 'axios';
import { Storage } from '../services/storage';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Login'>;
};

// ← Change this to your PC's local IP when testing on phone
// For web: keep as localhost
const API_URL = 'http://localhost:3000';

type Step = 'identifier' | 'otp' | 'username' | 'done';

export default function LoginScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [username, setUsername] = useState('');
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<{ text: string; type: 'output' | 'input' | 'error' | 'success' | 'system' }[]>([
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', type: 'system' },
    { text: '  TermChat v1.0.0', type: 'success' },
    { text: '  Secure Messaging Terminal', type: 'system' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', type: 'system' },
    { text: '', type: 'output' },
    { text: 'Enter your email to continue:', type: 'output' },
  ]);
  const [loading, setLoading] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 600, useNativeDriver: true,
    }).start();
    // Cursor blink
    const interval = setInterval(() => setShowCursor(p => !p), 500);
    return () => clearInterval(interval);
  }, []);

  const addLine = (text: string, type: typeof lines[0]['type'] = 'output') => {
    setLines(prev => [...prev, { text, type }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const getPrompt = () => {
    switch (step) {
      case 'identifier': return 'email:~$ ';
      case 'otp': return 'otp:~$ ';
      case 'username': return 'username:~$ ';
      default: return '~$ ';
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    const value = input.trim();
    // Show what user typed (mask OTP)
    addLine(`${getPrompt()}${step === 'otp' ? '••••••' : value}`, 'input');
    setInput('');

    if (step === 'identifier') {
      setIdentifier(value);
      setLoading(true);
      addLine('Sending OTP...', 'output');
      try {
        const res = await axios.post(`${API_URL}/auth/send-otp`, { identifier: value });
        addLine('', 'output');
        addLine('✓ OTP sent to ' + value, 'success');
        // Show OTP in dev mode
        if (res.data.dev_otp) {
          addLine(`  [DEV] Your OTP is: ${res.data.dev_otp}`, 'success');
        } else {
          addLine('  Check your email/phone for the OTP', 'output');
        }
        addLine('', 'output');
        addLine('Enter the 6-digit OTP:', 'output');
        setStep('otp');
      } catch (err: any) {
        addLine('✗ Failed to send OTP. Try again.', 'error');
      } finally {
        setLoading(false);
      }

    } else if (step === 'otp') {
      setOtp(value);
      setLoading(true);
      addLine('Verifying OTP...', 'output');
      try {
        const res = await axios.post(`${API_URL}/auth/verify-otp`, {
          identifier,
          otp: value,
        });

        if (res.data.isNewUser) {
          addLine('', 'output');
          addLine('✓ OTP verified', 'success');
          addLine('', 'output');
          addLine('New user detected. Choose a username:', 'output');
          addLine('  (3-20 chars, letters/numbers/underscore)', 'output');
          setStep('username');
        } else {
          // Existing user — login success
          addLine('', 'output');
          addLine('✓ Authentication successful', 'success');
          addLine(`  Welcome back, ${res.data.user.username}!`, 'success');
          addLine('', 'output');
          addLine('Loading your chats...', 'output');
          setStep('done');
          // Store tokens and navigate
          await Storage.save('accessToken', res.data.accessToken);
          await Storage.save('refreshToken', res.data.refreshToken);
          await Storage.save('user', JSON.stringify(res.data.user));
          setTimeout(() => navigation.replace('ChatList'), 1200);
        }
      } catch (err: any) {
        addLine('✗ Invalid or expired OTP. Try again.', 'error');
        addLine('Enter the 6-digit OTP:', 'output');
      } finally {
        setLoading(false);
      }

    } else if (step === 'username') {
      if (value.length < 3) {
        addLine('✗ Username too short (min 3 chars)', 'error');
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        addLine('✗ Only letters, numbers, underscore allowed', 'error');
        return;
      }
      setLoading(true);
      addLine('Creating account...', 'output');
      try {
        const res = await axios.post(`${API_URL}/auth/verify-otp`, {
          identifier,
          otp,
          username: value,
        });
        addLine('', 'output');
        addLine('✓ Account created successfully!', 'success');
        addLine(`  Welcome to TermChat, ${value}!`, 'success');
        addLine('', 'output');
        addLine('Loading your terminal...', 'output');
        setStep('done');
        await Storage.save('accessToken', res.data.accessToken);
        await Storage.save('refreshToken', res.data.refreshToken);
        await Storage.save('user', JSON.stringify(res.data.user));
        setTimeout(() => navigation.replace('ChatList'), 1200);
      } catch (err: any) {
        const msg = err.response?.data?.error || 'Failed to create account';
        addLine(`✗ ${msg}`, 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Output area */}
      <ScrollView
        ref={scrollRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {lines.map((line, i) => (
          <Text key={i} style={[styles.line, styles[line.type]]}>
            {line.text}
          </Text>
        ))}
      </ScrollView>

      {/* Input area */}
      {step !== 'done' && (
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <Text style={styles.prompt}>{getPrompt()}</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSubmit}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={step === 'otp'}
              editable={!loading}
              placeholderTextColor={theme.textDim}
              returnKeyType="done"
            />
            {loading
              ? <ActivityIndicator size="small" color={theme.green} />
              : <Text style={[styles.cursor, { opacity: showCursor ? 1 : 0 }]}>█</Text>
            }
          </View>
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitText}>
              {loading ? 'processing...' : '↵ submit'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  outputContent: {
    paddingBottom: 16,
  },
  line: {
    fontFamily: theme.fontMono,
    fontSize: theme.sm,
    lineHeight: 22,
    marginBottom: 1,
  },
  output: {
    color: theme.textDim,
  } as any,
  input: {
    color: theme.text,
  } as any,
  error: {
    color: theme.red,
  },
  success: {
    color: theme.green,
  },
  system: {
    color: theme.greenDark,
  },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.bg2,
    padding: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prompt: {
    color: theme.green,
    fontFamily: theme.fontMono,
    fontSize: theme.sm,
  },
  cursor: {
    color: theme.green,
    fontSize: theme.sm,
  },
  submitBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.greenDark,
    padding: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: theme.green,
    fontFamily: theme.fontMono,
    fontSize: theme.sm,
  },
});
