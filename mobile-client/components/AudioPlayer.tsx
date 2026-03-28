import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { Audio } from 'expo-av';
import { isAudioExpired } from '../utils/s3';

interface AudioPlayerProps {
  audioUrl: string;
  duration: number;
  isDarkMode?: boolean;
}

export default function AudioPlayer({ audioUrl, duration, isDarkMode }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Check if audio is expired (20 minutes)
    if (isAudioExpired(audioUrl)) {
      setIsExpired(true);
    }

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [audioUrl]);

  const playAudio = async () => {
    if (isExpired) return;

    try {
      if (soundRef.current) {
        // Resume existing sound
        await soundRef.current.playAsync();
        setIsPlaying(true);
        return;
      }

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Load and play audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setIsPlaying(true);

      // Track playback position
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          const pos = status.positionMillis || 0;
          setPlaybackPosition(pos);
          
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPlaybackPosition(0);
            sound.unloadAsync();
            soundRef.current = null;
          }
        }
      });

    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const pauseAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? playbackPosition / (duration * 1000) : 0;

  if (isExpired) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#2c2c2c' : '#f3f4f6' }]}>
        <Text style={[styles.expiredText, { color: isDarkMode ? '#666' : '#999' }]}>
          🎤 Voice message expired
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#333' : '#f3f4f6' }]}>
      <TouchableOpacity
        onPress={isPlaying ? pauseAudio : playAudio}
        style={[styles.playButton, { backgroundColor: isDarkMode ? '#444' : 'white' }]}
      >
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
      </TouchableOpacity>

      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: isDarkMode ? '#555' : '#ddd' }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(progress * 100, 100)}%` }
            ]}
          />
        </View>
      </View>

      <Text style={[styles.durationText, { color: isDarkMode ? '#aaa' : '#666' }]}>
        {formatTime(playbackPosition * 1000)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    minWidth: 200,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  playIcon: {
    fontSize: 16,
  },
  progressContainer: {
    flex: 1,
    marginRight: 10,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  durationText: {
    fontSize: 12,
    minWidth: 40,
  },
  expiredText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
