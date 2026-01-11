import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AnalysisResult } from '@/lib/api';

export default function ShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Parse result from params
  const result: AnalysisResult = params.result
    ? JSON.parse(params.result as string)
    : null;

  const [productName, setProductName] = useState('Product Analysis');

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

  const getVerdict = (score: number): string => {
    // INVERTED: Higher scores = less evidence support
    if (score >= 9) return 'Claims have almost no supporting evidence';
    if (score >= 7) return 'Claims have minimal supporting evidence';
    if (score >= 5) return 'Claims have some gaps in evidence support';
    if (score >= 3) return 'Claims have decent evidence support';
    return 'Claims have comprehensive supporting evidence';
  };

  const scoreColor = getScoreColor(result.bunkd_score);
  const scoreTier = getScoreTier(result.bunkd_score);
  const verdict = getVerdict(result.bunkd_score);
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleShare = async () => {
    try {
      const shareMessage = `${productName}

BS Meter Score: ${result.bunkd_score.toFixed(1)}/10 - ${scoreTier}

${verdict}

Calculated from public claims + evidence (${currentDate})

Analyzed with Bunkd - BS Meter for product claims`;

      const shareResult = await Share.share({
        message: shareMessage,
        title: `${productName} - BS Meter Analysis`,
      });

      if (shareResult.action === Share.sharedAction) {
        Alert.alert('Success', 'Shared successfully!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Share Analysis</Text>
        <Text style={styles.subtitle}>
          Customize and share this analysis result
        </Text>

        {/* Product Name Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Product/Analysis Name</Text>
          <TextInput
            style={styles.input}
            value={productName}
            onChangeText={setProductName}
            placeholder="Enter product name..."
            placeholderTextColor="#999"
          />
        </View>

        {/* Share Card Preview */}
        <View style={styles.shareCard}>
          <Text style={styles.cardTitle}>{productName}</Text>

          <View style={[styles.scoreContainer, { borderColor: scoreColor }]}>
            <Text style={styles.bsMeterLabel}>BS Meter</Text>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>
              {result.bunkd_score.toFixed(1)}/10
            </Text>
            <Text style={[styles.scoreTier, { color: scoreColor }]}>{scoreTier}</Text>
          </View>

          <View style={styles.verdictContainer}>
            <Text style={styles.verdictLabel}>Verdict:</Text>
            <Text style={styles.verdictText}>{verdict}</Text>
          </View>

          <View style={styles.metaContainer}>
            <Text style={styles.metaText}>
              Calculated from public claims + evidence
            </Text>
            <Text style={styles.dateText}>{currentDate}</Text>
          </View>

          <View style={styles.brandingContainer}>
            <Text style={styles.brandingText}>Analyzed with Bunkd</Text>
            <Text style={styles.brandingSubtext}>BS Meter for product claims</Text>
          </View>
        </View>

        {/* Share Button */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>Share Analysis</Text>
        </TouchableOpacity>

        {/* Summary Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>What gets shared:</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>Product name</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>BS Meter score and tier</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>One-line verdict</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>Analysis date</Text>
          </View>
        </View>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  shareCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 20,
    textAlign: 'center',
  },
  scoreContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    marginBottom: 20,
  },
  bsMeterLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 1,
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  scoreTier: {
    fontSize: 16,
    fontWeight: '600',
  },
  verdictContainer: {
    marginBottom: 20,
  },
  verdictLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  verdictText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  metaContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginBottom: 16,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  dateText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  brandingContainer: {
    alignItems: 'center',
  },
  brandingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  brandingSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  shareButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoBullet: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#333',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 100,
  },
});
