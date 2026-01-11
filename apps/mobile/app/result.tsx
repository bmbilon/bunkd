import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AnalysisResult } from '@/lib/api';

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [expandedClaims, setExpandedClaims] = useState(false);
  const [expandedBias, setExpandedBias] = useState(false);

  // Parse result from params
  const result: AnalysisResult = params.result
    ? JSON.parse(params.result as string)
    : null;
  const isCached = params.cached === 'true';

  if (!result) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No result data found</Text>
      </View>
    );
  }

  const getScoreColor = (score: number): string => {
    // INVERTED: Higher scores = weaker evidence = RED (bad)
    // Lower scores = stronger evidence = GREEN (good)
    if (score >= 9) return '#FF3B30'; // Red - Very High BS
    if (score >= 7) return '#FF6B6B'; // Light Red - High BS
    if (score >= 5) return '#FF9500'; // Orange - Elevated BS
    if (score >= 3) return '#FFD60A'; // Yellow - Moderate BS
    return '#34C759'; // Green - Low BS
  };

  const getScoreTier = (score: number): string => {
    if (score >= 9) return 'Very High Bunkd Score';
    if (score >= 7) return 'High Bunkd Score';
    if (score >= 5) return 'Elevated Bunkd Score';
    if (score >= 3) return 'Moderate Bunkd Score';
    return 'Low Bunkd Score';
  };

  const scoreColor = getScoreColor(result.bunkd_score);
  const scoreTier = getScoreTier(result.bunkd_score);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            {isCached && (
              <View style={styles.cachedBadge}>
                <Text style={styles.cachedText}>Cached Result</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/share',
                  params: { result: JSON.stringify(result) },
                })
              }
              style={styles.shareButton}
            >
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.title}>Analysis Result</Text>

        {/* Big Score Card */}
        <View style={[styles.scoreCard, { borderColor: scoreColor }]}>
          <Text style={styles.primaryLabel}>BS Meter</Text>
          <Text style={styles.secondaryLabel}>Bunkd Score</Text>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>
            {result.bunkd_score.toFixed(1)}/10
          </Text>
          <Text style={[styles.scoreTier, { color: scoreColor }]}>{scoreTier}</Text>
        </View>

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summaryText}>{result.summary}</Text>
        </View>

        {/* Bias Indicators - Expandable */}
        {result.bias_indicators && result.bias_indicators.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setExpandedBias(!expandedBias)}
            >
              <Text style={styles.sectionTitle}>
                Bias Indicators ({result.bias_indicators.length})
              </Text>
              <Text style={styles.expandIcon}>{expandedBias ? '−' : '+'}</Text>
            </TouchableOpacity>
            {expandedBias && (
              <View style={styles.listContainer}>
                {result.bias_indicators.map((indicator, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.listItemText}>{indicator}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Factual Claims - Expandable */}
        {result.factual_claims && result.factual_claims.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setExpandedClaims(!expandedClaims)}
            >
              <Text style={styles.sectionTitle}>
                Factual Claims ({result.factual_claims.length})
              </Text>
              <Text style={styles.expandIcon}>{expandedClaims ? '−' : '+'}</Text>
            </TouchableOpacity>
            {expandedClaims && (
              <View style={styles.listContainer}>
                {result.factual_claims.map((claim, index) => (
                  <View key={index} style={styles.claimCard}>
                    <Text style={styles.claimText}>{claim.claim}</Text>
                    {claim.verified !== undefined && (
                      <View style={styles.claimMeta}>
                        <Text
                          style={[
                            styles.verifiedBadge,
                            claim.verified ? styles.verifiedTrue : styles.verifiedFalse,
                          ]}
                        >
                          {claim.verified ? 'Verified' : 'Unverified'}
                        </Text>
                        {claim.confidence !== undefined && (
                          <Text style={styles.confidenceText}>
                            {Math.round(claim.confidence * 100)}% confidence
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Sources */}
        {result.sources && result.sources.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sources</Text>
            <View style={styles.listContainer}>
              {result.sources.map((source, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.sourceCard}
                  onPress={() => source.url && Linking.openURL(source.url)}
                  disabled={!source.url}
                >
                  <Text style={styles.sourceTitle}>
                    {source.title || `Source ${index + 1}`}
                  </Text>
                  {source.snippet && (
                    <Text style={styles.sourceSnippet} numberOfLines={3}>
                      {source.snippet}
                    </Text>
                  )}
                  {source.url && <Text style={styles.sourceUrl}>{source.url}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Reasoning */}
        {result.reasoning && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Analysis Reasoning</Text>
            <Text style={styles.reasoningText}>{result.reasoning}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cachedBadge: {
    backgroundColor: '#FFD60A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  cachedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  shareButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#000',
  },
  scoreCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 3,
  },
  primaryLabel: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 2,
    marginBottom: 4,
  },
  secondaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  scoreTier: {
    fontSize: 20,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  expandIcon: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: '600',
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  listContainer: {
    marginTop: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
    marginTop: 2,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  claimCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  claimText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 8,
  },
  claimMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verifiedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  verifiedTrue: {
    backgroundColor: '#34C759',
    color: '#fff',
  },
  verifiedFalse: {
    backgroundColor: '#FF9500',
    color: '#fff',
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
  },
  sourceCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  sourceSnippet: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
    marginBottom: 8,
  },
  sourceUrl: {
    fontSize: 12,
    color: '#007AFF',
  },
  reasoningText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 100,
  },
});
