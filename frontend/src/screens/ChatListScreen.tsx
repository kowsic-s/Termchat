import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Storage } from '../services/storage';
import axios from 'axios';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'ChatList'>;
};

const API_URL = 'http://localhost:3000';

type Chat = {
  id: string;
  name: string | null;
  is_group: boolean;
  last_message: string | null;
  last_message_at: string | null;
  member_count: number;
};

type User = {
  id: string;
  username: string;
  karma: number;
};

export default function ChatListScreen({ navigation }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [token, setToken] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const savedToken = await Storage.get('accessToken');
      const savedUser = await Storage.get('user');
      if (!savedToken || !savedUser) {
        navigation.replace('Login');
        return;
      }
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      await fetchChats(savedToken);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChats = async (savedToken: string) => {
    try {
      const res = await axios.get(`${API_URL}/chats`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      setChats(res.data);
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChats(token);
    setRefreshing(false);
  };

  const searchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await axios.get(`${API_URL}/users/search?q=${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const startDM = async (userId: string, username: string) => {
    try {
      const res = await axios.post(`${API_URL}/chats/dm`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);
      navigation.navigate('Chat', {
        chatId: res.data.chatId,
        chatName: username,
        isGroup: false
      });
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  };

  const getChatName = (chat: Chat) => {
    return chat.is_group ? `#${chat.name}` : `@${chat.name}`;
  };

  const renderChat = ({ item, index }: { item: Chat; index: number }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => navigation.navigate('Chat', {
        chatId: item.id,
        chatName: item.name || 'unknown',
        isGroup: item.is_group
      })}
    >
      <View style={styles.chatLeft}>
        <Text style={styles.chatIndex}>{String(index + 1).padStart(2, '0')}</Text>
        <View>
          <Text style={styles.chatName}>{getChatName(item)}</Text>
          <Text style={styles.chatPreview} numberOfLines={1}>
            {item.last_message || '── no messages yet'}
          </Text>
        </View>
      </View>
      <View style={styles.chatRight}>
        <Text style={styles.chatTime}>{formatTime(item.last_message_at)}</Text>
        <Text style={styles.chatMeta}>
          {item.is_group ? `${item.member_count} members` : 'dm'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.green} />
        <Text style={styles.loadingText}>loading chats...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>
            {user?.username}@termchat
          </Text>
          <Text style={styles.topBarSub}>
            {currentTime.toLocaleTimeString('en-US', { hour12: false })} ── {chats.length} chats
          </Text>
        </View>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowNewChat(!showNewChat)}
          >
            <Text style={styles.iconBtnText}>{showNewChat ? '✕ close' : '+ new'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={async () => {
              await Storage.clear();
              navigation.replace('Login');
            }}
          >
            <Text style={[styles.iconBtnText, { color: theme.textDim }]}>exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* New chat search panel */}
      {showNewChat && (
        <View style={styles.searchPanel}>
          <Text style={styles.searchLabel}>{'>'} find user to message:</Text>
          <View style={styles.searchRow}>
            <Text style={styles.searchPrompt}>search:~$ </Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={searchUsers}
              placeholder="type username..."
              placeholderTextColor={theme.textDim}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching && <ActivityIndicator size="small" color={theme.green} />}
          </View>
          {searchResults.map(u => (
            <TouchableOpacity
              key={u.id}
              style={styles.searchResult}
              onPress={() => startDM(u.id, u.username)}
            >
              <Text style={styles.searchResultName}>@{u.username}</Text>
              <Text style={styles.searchResultMeta}>karma: {u.karma} ── tap to message</Text>
            </TouchableOpacity>
          ))}
          {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
            <Text style={styles.noResults}>no users found</Text>
          )}
        </View>
      )}

      {/* Directory header */}
      <View style={styles.dirHeader}>
        <Text style={styles.dirHeaderText}>
          {user?.username}@termchat:~$ ls chats/
        </Text>
      </View>

      {/* Chat list */}
      {chats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>total 0</Text>
          <Text style={styles.emptyText}>── no chats yet</Text>
          <Text style={styles.emptyDim}>press [+ new] to start a conversation</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={item => item.id}
          renderItem={renderChat}
          style={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.green}
            />
          }
          ListHeaderComponent={
            <Text style={styles.listHeader}>total {chats.length}</Text>
          }
        />
      )}

      {/* Bottom status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>● online</Text>
        <Text style={styles.statusText}>karma: {user?.karma || 0}</Text>
        <Text style={styles.statusText}>pull to refresh</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  loadingContainer: {
    flex: 1, backgroundColor: theme.bg,
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.sm },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border,
    backgroundColor: theme.bg2,
  },
  topBarTitle: { color: theme.green, fontFamily: theme.fontMono, fontSize: theme.md, fontWeight: 'bold' },
  topBarSub: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs, marginTop: 2 },
  topBarActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 4 },
  iconBtnText: { color: theme.green, fontFamily: theme.fontMono, fontSize: theme.xs },
  searchPanel: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border,
    backgroundColor: theme.bg3,
  },
  searchLabel: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs, marginBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchPrompt: { color: theme.green, fontFamily: theme.fontMono, fontSize: theme.sm },
  searchInput: {
    flex: 1, color: theme.green, fontFamily: theme.fontMono,
    fontSize: theme.sm, padding: 0, outline: 'none',
  } as any,
  searchResult: { paddingVertical: 8, paddingLeft: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  searchResultName: { color: theme.green, fontFamily: theme.fontMono, fontSize: theme.sm },
  searchResultMeta: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs, marginTop: 2 },
  noResults: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.sm, padding: 8 },
  dirHeader: { padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  dirHeaderText: { color: theme.greenDim, fontFamily: theme.fontMono, fontSize: theme.sm },
  listHeader: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs, padding: 8, paddingLeft: 12 },
  list: { flex: 1 },
  chatItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,65,0.05)',
  },
  chatLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  chatIndex: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs, width: 20 },
  chatName: { color: theme.green, fontFamily: theme.fontMono, fontSize: theme.sm, fontWeight: 'bold' },
  chatPreview: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs, marginTop: 2, maxWidth: 200 },
  chatRight: { alignItems: 'flex-end' },
  chatTime: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs },
  chatMeta: { color: 'rgba(0,255,65,0.3)', fontFamily: theme.fontMono, fontSize: theme.xs, marginTop: 2 },
  emptyState: { flex: 1, padding: 16 },
  emptyText: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.sm, marginBottom: 4 },
  emptyDim: { color: 'rgba(0,255,65,0.2)', fontFamily: theme.fontMono, fontSize: theme.xs, marginTop: 8 },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 8, paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.bg2,
  },
  statusText: { color: theme.textDim, fontFamily: theme.fontMono, fontSize: theme.xs },
});