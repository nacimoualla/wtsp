import { useState } from "react";
import { Swipeable } from "react-native-gesture-handler";
import { View, Text, Animated as RNAnimated, TouchableOpacity } from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";

interface Message {
  sender: string;
  text: string;
  timestamp: number;
  replyTo?: {
    key: string;
    text: string;
    sender: string;
  };
  reactions?: Record<string, number>;
}

interface Props {
  message: Message;
  currentUsername: string;
  onSwipeToReply: (message: Message) => void;
  onToggleReaction: (messageKey: string, emoji: string) => void;
  onPressReplyQuote?: (messageKey: string) => void;
  onDeleteMessage?: (messageKey: string) => void;
  highlighted?: boolean;
  isDarkMode?: boolean;
}

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢'];

const MessageItem = ({ message, currentUsername, onSwipeToReply, onToggleReaction, onPressReplyQuote, onDeleteMessage, highlighted, isDarkMode = false }: Props) => {
  const isMe = message.sender === currentUsername;
  const messageKey = `${message.timestamp}_${message.sender}`;
  const [showReactions, setShowReactions] = useState(false);

  const bubbleSent = isDarkMode ? '#1e40af' : '#3b82f6';
  const bubbleReceived = isDarkMode ? '#333' : '#e5e7eb';
  const textSent = 'white';
  const textReceived = isDarkMode ? 'white' : 'black';

  // Swipe action for reply (left swipe)
  const renderLeftActions = (progress: RNAnimated.AnimatedInterpolation<number>, dragX: RNAnimated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [0, 50, 100],
      outputRange: [0, 0.5, 1],
      extrapolate: 'clamp',
    });
    return (
      <View style={{ justifyContent: 'center', paddingLeft: 20 }}>
        <RNAnimated.View style={{ transform: [{ scale }] }}>
          <Text style={{ fontSize: 20 }}>↩️</Text>
        </RNAnimated.View>
      </View>
    );
  };

  // Swipe action for delete (right swipe)
  const renderRightActions = (progress: RNAnimated.AnimatedInterpolation<number>, dragX: RNAnimated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1, 0.5, 0],
      extrapolate: 'clamp',
    });
    return (
      <View style={{ justifyContent: 'center', paddingRight: 20 }}>
        <RNAnimated.View style={{ transform: [{ scale }] }}>
          <Text style={{ fontSize: 20 }}>🗑️</Text>
        </RNAnimated.View>
      </View>
    );
  };

  // Render reactions row
  const renderReactions = () => {
    if (!message.reactions || Object.keys(message.reactions).length === 0) return null;
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
        {Object.entries(message.reactions).map(([emoji, count]) => (
          <TouchableOpacity
            key={emoji}
            onPress={() => onToggleReaction(messageKey, emoji)}
            style={{
              backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
              borderRadius: 12,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginRight: 4,
              marginBottom: 2,
            }}
          >
            <Text style={{ fontSize: 12 }}>{emoji} {count}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    );
  };

  // Quick reaction buttons (appear on long press)
  const renderQuickReactions = () => {
    if (!showReactions) return null;
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: 'row', marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
        {EMOJI_LIST.slice(0, 3).map(emoji => (
          <TouchableOpacity
            key={emoji}
            onPress={() => {
              onToggleReaction(messageKey, emoji);
              setShowReactions(false);
            }}
            style={{ paddingHorizontal: 4, paddingVertical: 2 }}
          >
            <Text style={{ fontSize: 14, opacity: 0.7 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    );
  };

  return (
    <Swipeable
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableLeftOpen={() => onSwipeToReply(message)}
      onSwipeableRightOpen={() => onDeleteMessage?.(messageKey)}
    >
      <Animated.View
        entering={FadeInDown.duration(400)}
        style={{
          alignSelf: isMe ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
          marginBottom: 12,
        }}
      >
        {!isMe && (
          <Text style={{ fontSize: 12, color: 'gray', marginLeft: 4, marginBottom: 2 }}>
            {message.sender}
          </Text>
        )}
        <TouchableOpacity
          onLongPress={() => setShowReactions(!showReactions)}
          delayLongPress={500}
          activeOpacity={1}
        >
          <View style={{
            backgroundColor: highlighted ? '#fef08a' : (isMe ? bubbleSent : bubbleReceived),
            padding: 12,
            borderRadius: 20,
            borderBottomRightRadius: isMe ? 4 : 20,
            borderBottomLeftRadius: isMe ? 20 : 4,
          }}>
            {/* Reply quote */}
            {message.replyTo && (
              <TouchableOpacity
                onPress={() => onPressReplyQuote?.(message.replyTo!.key)}
                activeOpacity={0.7}
              >
                <View style={{
                  backgroundColor: isMe 
                    ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)')
                    : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                  borderLeftWidth: 3,
                  borderLeftColor: isMe 
                    ? (isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)')
                    : (isDarkMode ? '#60a5fa' : '#007AFF'),
                  padding: 8,
                  borderRadius: 4,
                  marginBottom: 4,
                }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 12, color: isMe ? (isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.9)') : (isDarkMode ? '#60a5fa' : '#007AFF'), marginBottom: 2 }}>
                    {message.replyTo.sender}
                  </Text>
                  <Text style={{ fontSize: 13, color: isMe ? (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.8)') : (isDarkMode ? '#ccc' : '#555') }} numberOfLines={2}>
                    {message.replyTo.text}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            <Text style={{ color: isMe ? textSent : textReceived, fontSize: 16 }}>
              {message.text}
            </Text>
          </View>
        </TouchableOpacity>
        {/* Reactions */}
        {renderReactions()}
        {/* Quick reaction buttons */}
        {renderQuickReactions()}
      </Animated.View>
    </Swipeable>
  );
};

export default MessageItem;
