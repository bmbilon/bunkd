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
import { AnalysisResult, AnalyzeInput } from '@/lib/api';

export default function ShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Parse result from params with error handling
  let result: AnalysisResult | null = null;
  let parseError: string | null = null;

  if (params.result) {
    try {
      result = JSON.parse(params.result as string);
    } catch (e: any) {
      parseError = e?.message || 'Failed to parse result data';
      console.error('[ShareScreen] JSON parse error:', e);
    }
  }

  // Parse original input from params
  let originalInput: AnalyzeInput | null = null;
  console.log('[ShareScreen] params.input:', params.input);
  if (params.input) {
    try {
      originalInput = JSON.parse(params.input as string);
      console.log('[ShareScreen] Parsed originalInput:', originalInput);
    } catch (e: any) {
      console.error('[ShareScreen] Input parse error:', e);
    }
  } else {
    console.log('[ShareScreen] No input param received');
  }

  // Determine input type and value
  const getInputDisplay = (): { type: 'url' | 'text'; value: string } | null => {
    if (!originalInput) return null;
    if (originalInput.url) {
      return { type: 'url', value: originalInput.url };
    }
    if (originalInput.text) {
      return { type: 'text', value: originalInput.text };
    }
    return null;
  };

  const inputDisplay = getInputDisplay();

  // Default product name based on input
  const getDefaultProductName = (): string => {
    if (!inputDisplay) return 'Product Analysis';
    if (inputDisplay.type === 'url') {
      try {
        const url = new URL(inputDisplay.value);
        return url.hostname.replace('www.', '');
      } catch {
        return 'Product Analysis';
      }
    }
    // For text input, truncate if needed
    const text = inputDisplay.value;
    return text.length > 40 ? text.substring(0, 40) + '...' : text;
  };

  const [productName, setProductName] = useState(getDefaultProductName());

  if (!result || parseError) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.errorText}>
            {parseError || 'No result data found'}
          </Text>
        </View>
      </View>
    );
  }

  // Extract score from multiple possible field names (same as result.tsx)
  const getScore = (): number | null => {
    const data = (result as any).result_json || result;
    if (data.unable_to_score === true) {
      return null;
    }
    const scoreValue = (result as any).bs_score ?? (result as any).bunk_score ?? (result as any).bunkd_score;
    return typeof scoreValue === 'number' ? scoreValue : null;
  };

  const score = getScore();

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

  const scoreColor = score !== null ? getScoreColor(score) : '#999';
  const scoreTier = score !== null ? getScoreTier(score) : 'Unable to Score';
  const verdict = score !== null ? getVerdict(score) : 'Insufficient data to evaluate claims';
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleShare = async () => {
    try {
      // Build score line
      const scoreText = score !== null
        ? `Bunkd Score: ${score.toFixed(1)}/10 (${scoreTier.replace('Bunkd Score', 'BS Risk').trim()})`
        : `Bunkd Score: Unable to Score`;

      // Build analyzed line based on input type
      let analyzedLine = '';
      if (inputDisplay) {
        if (inputDisplay.type === 'url') {
          analyzedLine = `Analyzed: ${inputDisplay.value}`;
        } else {
          // For text, truncate if too long
          const truncatedText = inputDisplay.value.length > 100
            ? inputDisplay.value.substring(0, 100) + '...'
            : inputDisplay.value;
          analyzedLine = `Analyzed: "${truncatedText}"`;
        }
      }

      const shareMessage = `🔍 ${scoreText}
${analyzedLine ? `\n${analyzedLine}\n` : ''}
${verdict}

Check your products at bunkd.app`;

      const shareResult = await Share.share({
        message: shareMessage,
        title: `${productName} - Bunkd Analysis`,
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
          <Text style={styles.cardTitle}>🔍 Bunkd Analysis</Text>

          <View style={[styles.scoreContainer, { borderColor: scoreColor }]}>
            <Text style={styles.bsMeterLabel}>Bunkd Score</Text>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>
              {score !== null ? `${score.toFixed(1)}/10` : 'N/A'}
            </Text>
            <Text style={[styles.scoreTier, { color: scoreColor }]}>
              {scoreTier.replace('Bunkd Score', 'BS Risk').trim()}
            </Text>
          </View>

          {inputDisplay && (
            <View style={styles.analyzedContainer}>
              <Text style={styles.analyzedLabel}>Analyzed:</Text>
              <Text style={styles.analyzedText} numberOfLines={2}>
                {inputDisplay.type === 'url'
                  ? inputDisplay.value
                  : `"${inputDisplay.value.length > 60 ? inputDisplay.value.substring(0, 60) + '...' : inputDisplay.value}"`}
              </Text>
            </View>
          )}

          <View style={styles.verdictContainer}>
            <Text style={styles.verdictLabel}>Verdict:</Text>
            <Text style={styles.verdictText}>{verdict}</Text>
          </View>

          <View style={styles.brandingContainer}>
            <Text style={styles.brandingText}>Check your products at bunkd.app</Text>
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
            <Text style={styles.infoText}>Bunkd score and risk level</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>Original URL or text analyzed</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>One-line verdict</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>Link to bunkd.app</Text>
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
  analyzedContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  analyzedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  analyzedText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
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
  brandingContainer: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  brandingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
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
