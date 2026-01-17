import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

interface HistoryItem {
  id: string;
  input_type: string;
  input_value: string;
  created_at: string;
  status: string;
  bs_score: number | null;
  result_json: any | null;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    console.log('[History] ========== LOADING HISTORY ==========');
    try {
      // Get the current user's ID from the session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      console.log('[History] Session check:', {
        hasSession: !!session,
        sessionError: sessionError?.message,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        isAnonymous: session?.user?.is_anonymous,
        expiresAt: session?.expires_at,
      });

      const userId = session?.user?.id;

      if (!userId) {
        console.log('[History] No authenticated user found - session is null or no user');
        setHistory([]);
        return;
      }

      console.log('[History] Querying with userId:', userId);
      console.log('[History] userId type:', typeof userId);
      console.log('[History] userId length:', userId.length);

      // Fetch user's analysis jobs directly
      const { data, error } = await supabase
        .from('analysis_jobs')
        .select('id, input_type, input_value, created_at, status, bs_score, result_json, user_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      console.log('[History] Query response:', {
        dataCount: data?.length ?? 0,
        error: error?.message,
        errorCode: error?.code,
        errorDetails: error?.details,
      });

      // Debug: Also try a query without user_id filter to see what's in the table
      const { data: allJobs, error: allJobsError } = await supabase
        .from('analysis_jobs')
        .select('id, user_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('[History] Debug - All recent jobs (no user filter):', {
        count: allJobs?.length ?? 0,
        error: allJobsError?.message,
        jobs: allJobs?.map(j => ({ id: j.id?.slice(0, 8), user_id: j.user_id?.slice(0, 8), status: j.status })),
      });

      if (error) {
        console.error('[History] Error loading history:', error);
        setHistory([]);
      } else if (data) {
        console.log(`[History] Loaded ${data.length} items`);
        // Log first item for debugging
        if (data.length > 0) {
          console.log('[History] First item:', JSON.stringify(data[0], null, 2));
        }
        // Transform data - filter out disambiguation-only results
        const items: HistoryItem[] = data
          .filter((item: any) => {
            // Exclude disambiguation results that don't have a real score
            const shouldExclude = item.result_json?.needs_disambiguation && item.bs_score === null;
            if (shouldExclude) {
              console.log('[History] Filtering out disambiguation item:', item.id);
            }
            return !shouldExclude;
          })
          .map((item: any) => ({
            id: item.id,
            input_type: item.input_type,
            input_value: item.input_value,
            created_at: item.created_at,
            status: item.status,
            bs_score: item.bs_score,
            result_json: item.result_json,
          }));
        setHistory(items);
      }
    } catch (error) {
      console.error('[History] Error loading history:', error);
      setHistory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const handleItemPress = async (item: HistoryItem) => {
    // Only navigate if we have a completed result
    if (item.status !== 'done' || !item.result_json) {
      console.log('[History] Item not ready:', item.status);
      return;
    }

    // Construct input object from history item for share functionality
    const input: Record<string, string> = {};
    if (item.input_type === 'url') {
      input.url = item.input_value;
    } else if (item.input_type === 'text') {
      input.text = item.input_value;
    } else if (item.input_type === 'image') {
      input.image_url = item.input_value;
    }

    // Navigate to result screen with the stored result
    router.push({
      pathname: '/result',
      params: {
        result: JSON.stringify(item.result_json),
        jobId: item.id,
        cached: 'true',
        input: JSON.stringify(input),
      },
    });
  };

  const truncateText = (text: string, maxLength: number = 60): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'done':
      case 'completed':
        return '#34C759';
      case 'processing':
        return '#007AFF';
      case 'queued':
        return '#FFD60A';
      case 'failed':
        return '#FF3B30';
      default:
        return '#999';
    }
  };

  const getScoreColor = (score?: number): string => {
    if (!score && score !== 0) return '#999';
    // INVERTED: Higher scores = weaker evidence = RED (bad)
    // Lower scores = stronger evidence = GREEN (good)
    if (score >= 9) return '#FF3B30'; // Red - Very High BS
    if (score >= 7) return '#FF6B6B'; // Light Red - High BS
    if (score >= 5) return '#FF9500'; // Orange - Elevated BS
    if (score >= 3) return '#FFD60A'; // Yellow - Moderate BS
    return '#34C759'; // Green - Low BS
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <TouchableOpacity
      style={styles.historyItem}
      onPress={() => handleItemPress(item)}
      disabled={item.status !== 'done'}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemTypeContainer}>
          <Text style={styles.itemType}>{item.input_type.toUpperCase()}</Text>
        </View>
        <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
      </View>

      <Text style={styles.itemValue}>{truncateText(item.input_value)}</Text>

      <View style={styles.itemFooter}>
        {item.status && (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        )}
        {item.bs_score !== null && item.bs_score !== undefined && (
          <View style={styles.scoreContainer}>
            <Text
              style={[
                styles.scoreText,
                { color: getScoreColor(item.bs_score) },
              ]}
            >
              {item.bs_score.toFixed(1)}/10
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analysis History</Text>
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No analysis history yet</Text>
          <Text style={styles.emptySubtext}>
            Submit a product analysis to see it here
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
  },
  listContent: {
    padding: 16,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTypeContainer: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  itemDate: {
    fontSize: 12,
    color: '#999',
  },
  itemValue: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
    lineHeight: 22,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
});
