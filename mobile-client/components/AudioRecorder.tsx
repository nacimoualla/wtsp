import React, { useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { uploadAudioToR2 } from '../utils/s3';

interface AudioRecorderProps {
  onAudioRecorded: (audioUrl: string, duration: number) => void;
  isDarkMode?: boolean;
}

export default function AudioRecorder({ onAudioRecorded, isDarkMode }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Audio permission denied');
        return;
      }

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer to track duration
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setIsRecording(false);
      setIsUploading(true);

      // Stop recording
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsUploading(false);
        return;
      }

      // Generate unique message ID
      const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Upload to Cloudflare R2
      const audioUrl = await uploadAudioToR2(uri, messageId);
      
      // Callback with audio URL and duration
      onAudioRecorded(audioUrl, recordingDuration);
      
      setIsUploading(false);
      setRecordingDuration(0);

    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsUploading(false);
    }
  };

  const cancelRecording = async () => {
    if (!recordingRef.current) return;

    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
      
      setIsRecording(false);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isUploading) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#2c2c2c' : '#f3f4f6' }]}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={[styles.uploadingText, { color: isDarkMode ? '#aaa' : '#666' }]}>
          Uploading...
        </Text>
      </View>
    );
  }

  if (isRecording) {
    return (
      <View style={[styles.container, styles.recordingContainer, { backgroundColor: '#fee2e2' }]}>
        <View style={styles.recordingInfo}>
          <View style={styles.pulseIndicator} />
          <Text style={styles.recordingText}>
            Recording {formatDuration(recordingDuration)}
          </Text>
        </View>
        <View style={styles.recordingActions}>
          <TouchableOpacity onPress={cancelRecording} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={stopRecording} style={styles.stopButton}>
            <Text style={styles.stopButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={startRecording}
      style={[styles.micButton, { backgroundColor: isDarkMode ? '#333' : '#f3f4f6' }]}
    >
      <Text style={styles.micIcon}>🎤</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  recordingText: {
    color: '#dc2626',
    fontWeight: '600',
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  stopButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#2563eb',
  },
  stopButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  micIcon: {
    fontSize: 20,
  },
  uploadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
});
