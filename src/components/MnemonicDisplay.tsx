import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { colors, borderRadius } from './common/styles';

interface MnemonicDisplayProps {
  words?: string[];
  onReveal?: () => Promise<void>;
  revealed?: boolean;
}

const REDACTED_WORDS = Array(12).fill('').map(() => '•'.repeat(Math.floor(Math.random() * 4) + 4));

function WordPill({ index, word }: { index: number; word: string }) {
  return (
    <View style={styles.wordPill}>
      <Text style={styles.wordIndex}>{index + 1}</Text>
      <Text style={styles.wordText}>{word}</Text>
    </View>
  );
}

export function MnemonicDisplay({ words, onReveal, revealed = false }: MnemonicDisplayProps) {
  const [isRevealed, setIsRevealed] = useState(revealed);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsRevealed(revealed);
  }, [revealed]);

  const displayWords = isRevealed && words ? words : REDACTED_WORDS;

  const handlePress = useCallback(async () => {
    if (!isRevealed) {
      if (onReveal) {
        await onReveal();
      }
      setIsRevealed(true);
    } else if (words) {
      Clipboard.setString(words.join(' '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [isRevealed, onReveal, words]);

  return (
    <View style={styles.container}>
      <View style={styles.wordsContainer}>
        <View style={styles.wordsGrid}>
          {displayWords.map((word, index) => (
            <WordPill key={index} index={index} word={word} />
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.actionButton,
          isRevealed && styles.actionButtonRevealed,
          copied && styles.actionButtonCopied,
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={[
          styles.actionButtonText,
          isRevealed && styles.actionButtonTextRevealed,
          copied && styles.actionButtonTextCopied,
        ]}>
          {isRevealed
            ? (copied ? '✓ COPIED' : 'COPY TO CLIPBOARD')
            : 'TAP TO REVEAL'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

interface MnemonicInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function MnemonicInput({ value, onChange, placeholder }: MnemonicInputProps) {
  const handlePaste = useCallback(async () => {
    const text = await Clipboard.getString();
    if (text) {
      onChange(text.trim());
    }
  }, [onChange]);

  return (
    <View style={styles.inputContainer}>
      <ScrollView style={styles.inputScroll}>
        <Text
          style={[styles.inputText, !value && styles.inputPlaceholder]}
          onPress={() => {}}
        >
          {value || placeholder || 'Enter your 12-word recovery phrase...'}
        </Text>
      </ScrollView>

      <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
        <Text style={styles.pasteButtonText}>PASTE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  wordsContainer: {
    backgroundColor: colors.surface,
    padding: 20,
  },
  wordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  wordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  wordIndex: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    minWidth: 16,
  },
  wordText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  actionButton: {
    backgroundColor: colors.surface,
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButtonRevealed: {
    backgroundColor: colors.text,
  },
  actionButtonCopied: {
    backgroundColor: colors.success,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  actionButtonTextRevealed: {
    color: '#ffffff',
  },
  actionButtonTextCopied: {
    color: '#ffffff',
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 180,
    position: 'relative',
  },
  inputScroll: {
    flex: 1,
    padding: 16,
    paddingBottom: 50,
  },
  inputText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  inputPlaceholder: {
    color: colors.textMuted,
  },
  pasteButton: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pasteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
});
