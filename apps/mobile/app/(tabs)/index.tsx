import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BunkdAPI, AnalysisResult } from '@/lib/api';

// Demo examples for quick testing
const DEMO_EXAMPLES = {
  megaBurn: `MegaBurn Ultra: The Last Weight Loss Solution You'll Ever Need!

🔥 GUARANTEED: Lose 30 lbs in 30 days - without diet or exercise!

Our revolutionary formula combines ancient Himalayan herbs with modern science:

✓ Boosts metabolism by 500%
✓ Burns fat while you sleep
✓ Suppresses appetite naturally
✓ Detoxifies your entire body
✓ Increases energy levels 10x

SCIENTIFICALLY FORMULATED with:
- Garcinia Cambogia Extract (3000mg)
- Green Tea Extract
- African Mango
- Raspberry Ketones
- Proprietary Fat-Burning Blend™

As seen on TV! Featured on major news networks!

CLINICAL STUDY RESULTS:
"Participants lost an average of 2 lbs per day!"
"100% of users reported feeling more energetic!"

FDA-registered facility | GMP-certified | All-natural ingredients

⚠️ HURRY: This special offer expires in 24 hours!

$149.99 $39.99 (73% OFF!)

WARNING: Due to high demand, we can only guarantee this price for the next 100 customers!

*These statements have not been evaluated by the Food and Drug Administration.`,

  luxeGlow: `LuxeGlow Anti-Aging Serum - Clinically Proven Results in Just 7 Days!

Transform your skin with our breakthrough formula:

✨ Reduces wrinkles by up to 90%
🧬 Contains revolutionary bio-peptide complex
🔬 Clinically tested on over 500 women
💧 Penetrates 10x deeper than leading brands
🌿 Natural ingredients from the Swiss Alps

PROVEN RESULTS:
- 90% saw visible wrinkle reduction
- 95% reported smoother skin
- 87% looked 10 years younger

Developed by leading dermatologists using cutting-edge technology. Our proprietary HydraBotox™ formula combines the power of retinol, hyaluronic acid, and our secret ingredient X-27.

⭐⭐⭐⭐⭐ 50,000+ five-star reviews

"I can't believe the results! People think I'm 10 years younger!" - Jennifer, 52

Regular price: $299 | Today only: $59.99
FREE SHIPPING | 60-day guarantee`,

  quantumBoost: `Introducing the QuantumBoost Pro X - the world's most revolutionary wireless charger!

🚀 1000x faster charging than ANY competitor
⚡ Powered by patented quantum energy transfer technology
🧠 AI-optimized charging that learns your device's needs
🌟 Doctor-recommended for healthier battery life
💎 NASA-grade materials ensure lifetime durability

Join 10 million satisfied customers worldwide! Limited time offer - normally $299, now only $49.99!

"This changed my life!" - TechReviewer2024
"Finally, a charger that actually works!" - HappyCustomer

Order now and receive:
- Free quantum energy booster cable ($99 value)
- Lifetime warranty
- 30-day money-back guarantee*

*Some restrictions apply`,
};

export default function AnalyzeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'url' | 'text' | 'image'>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadDemo = (demoKey: keyof typeof DEMO_EXAMPLES) => {
    if (isAnalyzing) return;
    setActiveTab('text');
    setText(DEMO_EXAMPLES[demoKey]);
  };

  const handleAnalyze = async () => {
    // Validate input
    const input: any = {};
    if (activeTab === 'url' && url.trim()) {
      input.url = url.trim();
    } else if (activeTab === 'text' && text.trim()) {
      input.text = text.trim();
    } else if (activeTab === 'image' && imageUrl.trim()) {
      input.image_url = imageUrl.trim();
    } else {
      Alert.alert('Error', 'Please enter some content to analyze');
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage('Submitting analysis...');

    try {
      // Submit analysis
      const response = await BunkdAPI.analyzeProduct(input);

      // If cached result, navigate immediately
      if (response.status === 'cached' && response.result_json) {
        setIsAnalyzing(false);
        router.push({
          pathname: '/result',
          params: {
            result: JSON.stringify(response.result_json),
            bsScore: response.bs_score?.toString() || '0',
            cached: 'true',
          },
        });
        return;
      }

      // Otherwise, poll for completion
      if (response.job_id && response.job_token) {
        setStatusMessage('Analyzing product...');

        const result = await BunkdAPI.pollJobStatus(
          response.job_id,
          response.job_token,
          (status) => {
            if (status.status === 'running') {
              setStatusMessage('Processing analysis...');
            } else if (status.status === 'queued') {
              setStatusMessage('Waiting in queue...');
            }
          }
        );

        setIsAnalyzing(false);

        if (result.status === 'done' && result.result_json) {
          router.push({
            pathname: '/result',
            params: {
              result: JSON.stringify(result.result_json),
              bsScore: result.bs_score?.toString() || '0',
              jobId: response.job_id,
            },
          });
        } else if (result.status === 'failed') {
          Alert.alert(
            'Analysis Failed',
            result.last_error_message || 'An error occurred during analysis'
          );
        }
      }
    } catch (error: any) {
      setIsAnalyzing(false);
      Alert.alert('Error', error.message || 'Failed to analyze product');
    }
  };

  const renderInput = () => {
    switch (activeTab) {
      case 'url':
        return (
          <TextInput
            style={styles.input}
            placeholder="Enter product URL..."
            placeholderTextColor="#999"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            editable={!isAnalyzing}
          />
        );
      case 'text':
        return (
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Enter product description..."
            placeholderTextColor="#999"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            editable={!isAnalyzing}
          />
        );
      case 'image':
        return (
          <TextInput
            style={styles.input}
            placeholder="Enter image URL..."
            placeholderTextColor="#999"
            value={imageUrl}
            onChangeText={setImageUrl}
            autoCapitalize="none"
            keyboardType="url"
            editable={!isAnalyzing}
          />
        );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Analyze Product</Text>
        <Text style={styles.subtitle}>
          Get an objective analysis of marketing claims and bias
        </Text>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'url' && styles.activeTab]}
            onPress={() => setActiveTab('url')}
            disabled={isAnalyzing}
          >
            <Text style={[styles.tabText, activeTab === 'url' && styles.activeTabText]}>
              URL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'text' && styles.activeTab]}
            onPress={() => setActiveTab('text')}
            disabled={isAnalyzing}
          >
            <Text style={[styles.tabText, activeTab === 'text' && styles.activeTabText]}>
              Text
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'image' && styles.activeTab]}
            onPress={() => setActiveTab('image')}
            disabled={isAnalyzing}
          >
            <Text style={[styles.tabText, activeTab === 'image' && styles.activeTabText]}>
              Image
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.demoContainer}>
          <Text style={styles.demoLabel}>Try a demo:</Text>
          <View style={styles.demoButtons}>
            <TouchableOpacity
              style={styles.demoButton}
              onPress={() => loadDemo('megaBurn')}
              disabled={isAnalyzing}
            >
              <Text style={styles.demoButtonText}>Weight Loss Supplement</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.demoButton}
              onPress={() => loadDemo('luxeGlow')}
              disabled={isAnalyzing}
            >
              <Text style={styles.demoButtonText}>Anti-Aging Serum</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.demoButton}
              onPress={() => loadDemo('quantumBoost')}
              disabled={isAnalyzing}
            >
              <Text style={styles.demoButtonText}>Tech Gadget</Text>
            </TouchableOpacity>
          </View>
        </View>

        {renderInput()}

        {isAnalyzing && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.analyzeButton, isAnalyzing && styles.analyzeButtonDisabled]}
          onPress={handleAnalyze}
          disabled={isAnalyzing}
        >
          <Text style={styles.analyzeButtonText}>
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Text>
        </TouchableOpacity>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#000',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 150,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  analyzeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  analyzeButtonDisabled: {
    backgroundColor: '#ccc',
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  demoContainer: {
    marginBottom: 20,
  },
  demoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  demoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d0d0',
  },
  demoButtonText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
});
