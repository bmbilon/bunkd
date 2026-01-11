import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';

export default function AboutScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>About BS Meter</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Canonical Definition</Text>
          <Text style={styles.definitionText}>
            Bunkd Score (BS) is a numerical measure (0–10) of how well public claims are supported by publicly available evidence.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <Text style={styles.bodyText}>
            The BS Meter analyzes product claims and marketing language to evaluate the quality and availability of supporting evidence.
          </Text>
          <Text style={styles.bodyText}>
            Higher scores indicate better evidence support. Lower scores indicate claims with minimal or no supporting evidence.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Score Interpretation</Text>

          <View style={styles.scoreRow}>
            <View style={[styles.scoreBox, { backgroundColor: '#34C759' }]}>
              <Text style={styles.scoreBoxText}>9-10</Text>
            </View>
            <View style={styles.scoreDescription}>
              <Text style={styles.scoreTierLabel}>Very High Bunkd Score</Text>
              <Text style={styles.scoreDetail}>Claims have comprehensive supporting evidence</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={[styles.scoreBox, { backgroundColor: '#FFD60A' }]}>
              <Text style={styles.scoreBoxText}>7-8</Text>
            </View>
            <View style={styles.scoreDescription}>
              <Text style={styles.scoreTierLabel}>High Bunkd Score</Text>
              <Text style={styles.scoreDetail}>Claims have substantial supporting evidence</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={[styles.scoreBox, { backgroundColor: '#FF9500' }]}>
              <Text style={styles.scoreBoxText}>5-6</Text>
            </View>
            <View style={styles.scoreDescription}>
              <Text style={styles.scoreTierLabel}>Moderate Bunkd Score</Text>
              <Text style={styles.scoreDetail}>Claims have some supporting evidence</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={[styles.scoreBox, { backgroundColor: '#FF6B6B' }]}>
              <Text style={styles.scoreBoxText}>3-4</Text>
            </View>
            <View style={styles.scoreDescription}>
              <Text style={styles.scoreTierLabel}>Low Bunkd Score</Text>
              <Text style={styles.scoreDetail}>Claims have minimal supporting evidence</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={[styles.scoreBox, { backgroundColor: '#FF3B30' }]}>
              <Text style={styles.scoreBoxText}>0-2</Text>
            </View>
            <View style={styles.scoreDescription}>
              <Text style={styles.scoreTierLabel}>Very Low Bunkd Score</Text>
              <Text style={styles.scoreDetail}>Claims have almost no supporting evidence</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Methodology</Text>
          <Text style={styles.bodyText}>
            Our analysis examines:
          </Text>
          <Text style={styles.bulletText}>• Specificity of claims vs. vague superlatives</Text>
          <Text style={styles.bulletText}>• Availability of verifiable technical specifications</Text>
          <Text style={styles.bulletText}>• Presence of comparative context and benchmarks</Text>
          <Text style={styles.bulletText}>• Citations to publicly accessible sources</Text>
          <Text style={styles.bulletText}>• Use of promotional vs. descriptive language</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What BS Meter Is Not</Text>
          <Text style={styles.bodyText}>
            The BS Meter does not determine if a product is "good" or "bad". It only measures how well public claims are supported by publicly available evidence.
          </Text>
          <Text style={styles.bodyText}>
            A low score doesn't mean a product is poor quality—it means the marketing claims lack evidence support.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by Bunkd</Text>
          <Text style={styles.versionText}>v1.0</Text>
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
  backButton: {
    padding: 8,
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#000',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  definitionText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#000',
    fontWeight: '500',
    fontStyle: 'italic',
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 12,
  },
  bulletText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreBox: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  scoreBoxText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scoreDescription: {
    flex: 1,
  },
  scoreTierLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  scoreDetail: {
    fontSize: 14,
    color: '#666',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  footerText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: '#ccc',
  },
});
