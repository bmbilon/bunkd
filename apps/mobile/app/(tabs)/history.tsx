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
  job_id: string | null;
  analysis_status?: string;
  bunkd_score?: number;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    try {
      // Use test user ID for now (authentication can be added later)
      const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

      // Fetch user's product inputs with job status
      const { data, error } = await supabase
        .from('product_inputs')
        .select(`
          id,
          input_type,
          input_value,
          created_at,
          job_id,
          analysis_jobs!inner (
            status,
            analysis_results (
              result_data
            )
          )
        `)
        .eq('user_id', TEST_USER_ID)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading history:', error);
      } else if (data) {
        // Transform data
        const items: HistoryItem[] = data.map((item: any) => {
          const resultData = item.analysis_jobs?.analysis_results?.[0]?.result_data;
          // Try multiple field names for the score
          const score = resultData?.bs_score ?? resultData?.bunk_score ?? resultData?.bunkd_score;

          return {
            id: item.id,
            input_type: item.input_type,
            input_value: item.input_value,
            created_at: item.created_at,
            job_id: item.job_id,
            analysis_status: item.analysis_jobs?.status,
            bunkd_score: typeof score === 'number' ? score : undefined,
          };
        });
        setHistory(items);
      }
    } catch (error) {
      console.error('Error loading history:', error);
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
    if (!item.job_id) return;

    // Fetch the full result
    try {
      const { data, error } = await supabase
        .from('analysis_results')
        .select('result_data')
        .eq('job_id', item.job_id)
        .single();

      if (!error && data) {
        router.push({
          pathname: '/result',
          params: {
            result: JSON.stringify(data.result_data),
            jobId: item.job_id,
            cached: 'true',
          },
        });
      }
    } catch (error) {
      console.error('Error fetching result:', error);
    }
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
      disabled={item.analysis_status !== 'done' && item.analysis_status !== 'completed'}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemTypeContainer}>
          <Text style={styles.itemType}>{item.input_type.toUpperCase()}</Text>
        </View>
        <Text style={styles.itemDate}>{formatDate(item.created_at)}</Text>
      </View>

      <Text style={styles.itemValue}>{truncateText(item.input_value)}</Text>

      <View style={styles.itemFooter}>
        {item.analysis_status && (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.analysis_status) },
            ]}
          >
            <Text style={styles.statusText}>
              {item.analysis_status.charAt(0).toUpperCase() + item.analysis_status.slice(1)}
            </Text>
          </View>
        )}
        {item.bunkd_score !== undefined && (
          <View style={styles.scoreContainer}>
            <Text
              style={[
                styles.scoreText,
                { color: getScoreColor(item.bunkd_score) },
              ]}
            >
              {item.bunkd_score.toFixed(1)}/10
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
