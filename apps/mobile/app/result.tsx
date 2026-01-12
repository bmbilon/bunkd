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

type TabType = 'breakdown' | 'evidence' | 'citations';

interface Subscores {
  human_evidence: number;
  authenticity_transparency: number;
  marketing_overclaim: number;
  pricing_value: number;
}

interface SubscoreRowData {
  key: keyof Subscores;
  label: string;
  weight: number;
  weightLabel: string;
}

const SUBSCORE_ROWS: SubscoreRowData[] = [
  { key: 'human_evidence', label: 'Human Evidence', weight: 0.4, weightLabel: '40%' },
  { key: 'authenticity_transparency', label: 'Authenticity/Transparency', weight: 0.25, weightLabel: '25%' },
  { key: 'marketing_overclaim', label: 'Marketing Overclaim', weight: 0.25, weightLabel: '25%' },
  { key: 'pricing_value', label: 'Pricing/Value', weight: 0.1, weightLabel: '10%' },
];

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('breakdown');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  // Helper: extract score from multiple possible field names
  const getScore = (): number => {
    const scoreValue = (result as any).bs_score ?? (result as any).bunk_score ?? (result as any).bunkd_score;
    return typeof scoreValue === 'number' ? scoreValue : 0;
  };

  // Helper: extract subscores from result_json or top-level
  const getSubscores = (): Subscores | null => {
    const data = (result as any).result_json || result;

    if (data.subscores) {
      return data.subscores;
    }

    // Try top-level keys
    if (typeof data.human_evidence === 'number' &&
        typeof data.authenticity_transparency === 'number' &&
        typeof data.marketing_overclaim === 'number' &&
        typeof data.pricing_value === 'number') {
      return {
        human_evidence: data.human_evidence,
        authenticity_transparency: data.authenticity_transparency,
        marketing_overclaim: data.marketing_overclaim,
        pricing_value: data.pricing_value,
      };
    }

    return null;
  };

  const score = getScore();
  const subscores = getSubscores();

  const getScoreColor = (score: number): string => {
    // Higher scores = weaker evidence = RED (bad)
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

  const getSeverityTag = (subscore: number): { label: string; color: string } => {
    if (subscore >= 7) return { label: 'High', color: '#FF3B30' };
    if (subscore >= 4) return { label: 'Med', color: '#FF9500' };
    return { label: 'Low', color: '#34C759' };
  };

  const scoreColor = getScoreColor(score);
  const scoreTier = getScoreTier(score);

  // Extract data from result_json
  const data = (result as any).result_json || result;
  const evidenceBullets = data.evidence_bullets || [];
  const redFlags = data.red_flags || [];
  const keyClaims = data.key_claims || [];
  const citations = data.citations || [];

  // Render breakdown tab
  const renderBreakdownTab = () => {
    if (!subscores) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Score breakdown not available</Text>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {SUBSCORE_ROWS.map((row) => {
          const subscoreValue = subscores[row.key];
          const contribution = row.weight * subscoreValue;
          const severity = getSeverityTag(subscoreValue);
          const isExpanded = expandedRow === row.key;

          return (
            <View key={row.key} style={styles.subscoreSection}>
              <TouchableOpacity
                style={styles.subscoreRow}
                onPress={() => setExpandedRow(isExpanded ? null : row.key)}
              >
                <View style={styles.subscoreHeader}>
                  <View style={styles.subscoreHeaderLeft}>
                    <Text style={styles.subscoreLabel}>{row.label}</Text>
                    <View style={styles.subscoreMetrics}>
                      <Text style={styles.subscoreValue}>{subscoreValue.toFixed(1)}</Text>
                      <Text style={styles.subscoreWeight}>× {row.weightLabel}</Text>
                      <Text style={styles.subscoreEquals}>=</Text>
                      <Text style={styles.subscoreContribution}>{contribution.toFixed(1)}</Text>
                    </View>
                  </View>
                  <View style={styles.subscoreHeaderRight}>
                    <View style={[styles.severityTag, { backgroundColor: severity.color }]}>
                      <Text style={styles.severityTagText}>{severity.label}</Text>
                    </View>
                    <Text style={styles.expandIndicator}>{isExpanded ? '▼' : '▶'}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.subscoreDetail}>
                  {renderSubscoreDetail(row.key)}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.formulaSection}>
          <Text style={styles.formulaLabel}>Score Formula:</Text>
          <Text style={styles.formulaText}>BS = 0.4×HE + 0.25×AT + 0.25×MO + 0.10×PV</Text>
          <View style={styles.computedScore}>
            <Text style={styles.computedScoreLabel}>Computed Total:</Text>
            <Text style={[styles.computedScoreValue, { color: scoreColor }]}>
              {score.toFixed(1)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Render detail content for a specific subscore dimension
  const renderSubscoreDetail = (key: keyof Subscores) => {
    // Try to extract relevant claims, red flags, or evidence for this dimension
    const relevantClaims = keyClaims.filter((claim: any) => {
      const claimText = claim.claim?.toLowerCase() || '';
      const supportLevel = claim.support_level?.toLowerCase() || '';

      // Match keywords to dimension
      if (key === 'human_evidence' && (
        claimText.includes('testimonial') ||
        claimText.includes('review') ||
        claimText.includes('customer') ||
        claimText.includes('user')
      )) return true;

      if (key === 'authenticity_transparency' && (
        claimText.includes('transparent') ||
        claimText.includes('verified') ||
        claimText.includes('certified') ||
        claimText.includes('authentic')
      )) return true;

      if (key === 'marketing_overclaim' && (
        supportLevel.includes('weak') ||
        supportLevel.includes('unsupported') ||
        claimText.includes('claim')
      )) return true;

      if (key === 'pricing_value' && (
        claimText.includes('price') ||
        claimText.includes('cost') ||
        claimText.includes('value') ||
        claimText.includes('discount')
      )) return true;

      return false;
    });

    const hasContent = relevantClaims.length > 0;

    if (!hasContent) {
      return (
        <Text style={styles.detailEmptyText}>
          No detailed notes returned for this dimension.
        </Text>
      );
    }

    // Sort claims by support level: most problematic (red/orange) to strongest (green)
    const sortedClaims = [...relevantClaims].sort((a: any, b: any) => {
      const rankA = getSupportRank(a.support_level || '');
      const rankB = getSupportRank(b.support_level || '');
      return rankA - rankB;
    });

    return (
      <View style={styles.detailContent}>
        {sortedClaims.map((claim: any, index: number) => (
          <View key={index} style={styles.detailClaimCard}>
            <Text style={styles.detailClaimText}>{claim.claim}</Text>
            {claim.support_level && (
              <View style={styles.detailClaimMeta}>
                <View style={[
                  styles.supportBadge,
                  { backgroundColor: getSupportColor(claim.support_level) }
                ]}>
                  <Text style={styles.supportBadgeText}>{claim.support_level}</Text>
                </View>
                {claim.why && (
                  <Text style={styles.detailClaimWhy}>{claim.why}</Text>
                )}
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const getSupportColor = (level: string): string => {
    const l = level?.toLowerCase() || '';
    // Order: RED (contradictory/false) -> ORANGE (unsupported/weak) -> YELLOW (mixed) -> GREEN (supported)
    if (l.includes('contradictory') || l.includes('proven false') || l.includes('false')) {
      return '#FF3B30'; // Red for contradictory/proven false
    }
    if (l.includes('unsupported')) return '#FF9500'; // Orange for unsupported
    if (l.includes('weak')) return '#FF9500'; // Orange for weak
    if (l.includes('mixed')) return '#FFD60A'; // Yellow for mixed
    if (l.includes('supported')) return '#34C759'; // Green for supported
    return '#999'; // Gray for unknown
  };

  const getSupportRank = (level: string): number => {
    const l = level?.toLowerCase() || '';
    // Lower rank = shown first (most problematic claims first)
    if (l.includes('contradictory') || l.includes('proven false') || l.includes('false')) {
      return 0; // RED: Contradictory/Proven False - FIRST
    }
    if (l.includes('unsupported')) return 1; // ORANGE: Unsupported
    if (l.includes('weak')) return 2; // ORANGE: Weak
    if (l.includes('mixed')) return 3; // YELLOW: Mixed
    if (l.includes('supported')) return 4; // GREEN: Supported - LAST
    return 5; // Unknown goes to end
  };

  // Render evidence tab
  const renderEvidenceTab = () => {
    const hasEvidence = evidenceBullets.length > 0;
    const hasFlags = redFlags.length > 0;
    const hasClaims = keyClaims.length > 0;

    if (!hasEvidence && !hasFlags && !hasClaims) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No evidence data available</Text>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {hasEvidence && (
          <View style={styles.evidenceSection}>
            <Text style={styles.evidenceSectionTitle}>Evidence Points</Text>
            {evidenceBullets.map((bullet: string, index: number) => (
              <View key={index} style={styles.bulletItem}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        )}

        {hasFlags && (
          <View style={styles.evidenceSection}>
            <Text style={styles.evidenceSectionTitle}>Red Flags</Text>
            {redFlags.map((flag: string, index: number) => (
              <View key={index} style={styles.bulletItem}>
                <Text style={styles.bulletDot}>🚩</Text>
                <Text style={styles.bulletText}>{flag}</Text>
              </View>
            ))}
          </View>
        )}

        {hasClaims && (
          <View style={styles.evidenceSection}>
            <Text style={styles.evidenceSectionTitle}>Key Claims</Text>
            {[...keyClaims]
              .sort((a: any, b: any) => {
                const rankA = getSupportRank(a.support_level || '');
                const rankB = getSupportRank(b.support_level || '');
                return rankA - rankB; // Ascending: most problematic (red/orange) to strongest (green)
              })
              .map((claim: any, index: number) => (
                <View key={index} style={styles.claimCard}>
                  <Text style={styles.claimText}>{claim.claim}</Text>
                  {claim.support_level && (
                    <View style={styles.claimMeta}>
                      <View style={[
                        styles.supportBadge,
                        { backgroundColor: getSupportColor(claim.support_level) }
                      ]}>
                        <Text style={styles.supportBadgeText}>{claim.support_level}</Text>
                      </View>
                    </View>
                  )}
                  {claim.why && (
                    <Text style={styles.claimWhy}>{claim.why}</Text>
                  )}
                </View>
              ))}
          </View>
        )}
      </View>
    );
  };

  // Render citations tab
  const renderCitationsTab = () => {
    if (citations.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No citations returned for this analysis.</Text>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {citations.map((citation: any, index: number) => (
          <TouchableOpacity
            key={index}
            style={styles.citationCard}
            onPress={() => citation.url && Linking.openURL(citation.url)}
            disabled={!citation.url}
          >
            <Text style={styles.citationTitle}>
              {citation.title || `Citation ${index + 1}`}
            </Text>
            {citation.url && (
              <Text style={styles.citationUrl} numberOfLines={2}>
                {citation.url}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

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
          <View style={styles.scoreContainer}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>
              {score.toFixed(1)}
            </Text>
            <Text style={[styles.scoreMaxValue, { color: scoreColor }]}>
              /10
            </Text>
          </View>
          <Text style={[styles.scoreTier, { color: scoreColor }]}>{scoreTier}</Text>
        </View>

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summaryText}>{result.summary}</Text>
        </View>

        {/* Tabbed Section */}
        <View style={styles.section}>
          {/* Tab Bar */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'breakdown' && styles.tabActive]}
              onPress={() => setActiveTab('breakdown')}
            >
              <Text style={[styles.tabText, activeTab === 'breakdown' && styles.tabTextActive]}>
                Breakdown
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'evidence' && styles.tabActive]}
              onPress={() => setActiveTab('evidence')}
            >
              <Text style={[styles.tabText, activeTab === 'evidence' && styles.tabTextActive]}>
                Evidence
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'citations' && styles.tabActive]}
              onPress={() => setActiveTab('citations')}
            >
              <Text style={[styles.tabText, activeTab === 'citations' && styles.tabTextActive]}>
                Citations
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {activeTab === 'breakdown' && renderBreakdownTab()}
          {activeTab === 'evidence' && renderEvidenceTab()}
          {activeTab === 'citations' && renderCitationsTab()}
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
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  scoreMaxValue: {
    fontSize: 24,
    fontWeight: '400',
    opacity: 0.6,
    marginLeft: 2,
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  // Tab Bar Styles
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  // Tab Content Styles
  tabContent: {
    minHeight: 200,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  // Breakdown Tab Styles
  subscoreSection: {
    marginBottom: 12,
  },
  subscoreRow: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
  },
  subscoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subscoreHeaderLeft: {
    flex: 1,
  },
  subscoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  subscoreMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subscoreValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  subscoreWeight: {
    fontSize: 14,
    color: '#666',
  },
  subscoreEquals: {
    fontSize: 14,
    color: '#666',
  },
  subscoreContribution: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  subscoreHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  severityTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  severityTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  expandIndicator: {
    fontSize: 12,
    color: '#007AFF',
  },
  subscoreDetail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  detailContent: {
    gap: 8,
  },
  detailClaimCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  detailClaimText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    marginBottom: 6,
  },
  detailClaimMeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  supportBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  supportBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  detailClaimWhy: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  detailEmptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  formulaSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#e0e0e0',
  },
  formulaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  formulaText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#666',
    marginBottom: 12,
  },
  computedScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  computedScoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  computedScoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  // Evidence Tab Styles
  evidenceSection: {
    marginBottom: 24,
  },
  evidenceSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bulletDot: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  claimCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  claimText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    marginBottom: 8,
  },
  claimMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  claimWhy: {
    fontSize: 13,
    lineHeight: 19,
    color: '#666',
    marginTop: 4,
  },
  // Citations Tab Styles
  citationCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  citationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  citationUrl: {
    fontSize: 13,
    color: '#007AFF',
    lineHeight: 18,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 100,
  },
});
