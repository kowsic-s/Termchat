import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { theme } from '../theme';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Boot'>;
};

const BOOT_LINES = [
  'Linux 6.5.0-termchat #1 SMP PREEMPT_DYNAMIC',
  'Initializing kernel modules... [ OK ]',
  'Starting system logger... [ OK ]',
  'Loading network interfaces... [ OK ]',
  'Connecting to termchat.io... [ OK ]',
  'Starting encryption service... [ OK ]',
  'Loading user preferences... [ OK ]',
  '',
  'TermChat v1.0.0 — Type. Connect. Hack.',
  '',
  'Starting session...',
];

export default function BootScreen({ navigation }: Props) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Fade in
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Boot sequence
  useEffect(() => {
    if (currentIndex >= BOOT_LINES.length) {
      // All lines shown — navigate to login after short delay
      setTimeout(() => {
        navigation.replace('Terminal');
      }, 800);
      return;
    }

    const delay = BOOT_LINES[currentIndex] === '' ? 150 : 
                  BOOT_LINES[currentIndex].includes('TermChat') ? 400 : 200;

    const timer = setTimeout(() => {
      setVisibleLines(prev => [...prev, BOOT_LINES[currentIndex]]);
      setCurrentIndex(prev => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.terminal}>
        {visibleLines.map((line, index) => (
          <Text
            key={index}
            style={[
              styles.line,
              line.includes('TermChat') && styles.titleLine,
              line.includes('[ OK ]') && styles.okLine,
              line === '' && styles.emptyLine,
            ]}
          >
            {line}
          </Text>
        ))}
        {currentIndex < BOOT_LINES.length && (
          <Text style={styles.cursor}>
            {showCursor ? '█' : ' '}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    justifyContent: 'center',
    padding: 24,
  },
  terminal: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 40,
  },
  line: {
    fontFamily: theme.fontMono,
    fontSize: theme.sm,
    color: theme.textDim,
    marginBottom: 4,
    lineHeight: 20,
  },
  titleLine: {
    color: theme.green,
    fontSize: theme.lg,
    fontWeight: 'bold',
    marginVertical: 8,
    textShadowColor: 'rgba(0,255,65,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  okLine: {
    color: theme.green,
  },
  emptyLine: {
    height: 8,
  },
  cursor: {
    color: theme.green,
    fontSize: theme.md,
    marginTop: 4,
  },
});
