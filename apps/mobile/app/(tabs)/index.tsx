import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BunkdAPI, AnalysisResult } from '../../lib/api';

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

// BS Detection Tips for loading screen
const BS_DETECTION_TIPS = [
  "Red flag: 'Clinically proven' without linking the actual study",
  "If it sounds too good to be true, it's probably BS",
  "Celebrity endorsements ≠ scientific evidence",
  "Watch for weasel words: 'may help', 'supports', 'promotes'",
  "'Natural' doesn't mean safe. Arsenic is natural.",
  "Before/after photos can be lighting, angles, or Photoshop",
  "Check if 'studies' were funded by the company selling the product",
  "Proprietary blend = we won't tell you what's actually in it",
  "Real science welcomes scrutiny. BS hides from it.",
  "Five-star reviews can be bought. Look for verified purchases.",
  "Beware of urgent pressure: 'Limited time!', 'Only 3 left!'",
  "'FDA-registered facility' doesn't mean FDA-approved product",
  "Testimonials are cherry-picked. Where's the independent data?",
  "Multiple exclamation marks!!! = trying too hard to convince you",
  "Watch for vague science: 'breakthrough formula', 'revolutionary'",
  "'As seen on TV' just means they bought advertising time",
  "Dramatic discounts (90% off!) suggest inflated original prices",
  "Anonymous experts ('leading scientists say') are red flags",
  "If they hide the ingredient list, they're hiding something",
  "Results 'vary' = most people probably won't see any results",
];

export default function AnalyzeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'url' | 'text' | 'image'>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const loadDemo = (demoKey: keyof typeof DEMO_EXAMPLES) => {
    if (isAnalyzing) return;
    setActiveTab('text');
    setText(DEMO_EXAMPLES[demoKey]);
  };

  // Rotate tips every 4.5 seconds with fade transition
  useEffect(() => {
    if (!isAnalyzing) return;

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Change tip
        setCurrentTipIndex((prev) => (prev + 1) % BS_DETECTION_TIPS.length);
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 4500);

    return () => clearInterval(interval);
  }, [isAnalyzing, fadeAnim]);

  // Reset states when starting analysis
  useEffect(() => {
    if (isAnalyzing) {
      setIsCancelled(false);
      setCurrentTipIndex(0);
      fadeAnim.setValue(1);
    }
  }, [isAnalyzing, fadeAnim]);

  const handleCancel = () => {
    setIsCancelled(true);
    setIsAnalyzing(false);
    setStatusMessage('');
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

      // If cached result, navigate immediately (unless cancelled)
      if (response.status === 'cached' && response.result_json) {
        setIsAnalyzing(false);
        if (!isCancelled) {
          router.push({
            pathname: '/result',
            params: {
              result: JSON.stringify(response.result_json),
              bsScore: response.bs_score?.toString() || '0',
              cached: 'true',
              input: JSON.stringify(input),
            },
          });
        }
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

        // Don't navigate if user cancelled
        if (isCancelled) return;

        if (result.status === 'done' && result.result_json) {
          router.push({
            pathname: '/result',
            params: {
              result: JSON.stringify(result.result_json),
              bsScore: result.bs_score?.toString() || '0',
              jobId: response.job_id,
              input: JSON.stringify(input),
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
        <Text style={styles.title}>Calculate BS (Bunkd Score)</Text>
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

            <Animated.View style={[styles.tipContainer, { opacity: fadeAnim }]}>
              <Text style={styles.tipLabel}>💡 BS Detection Tip:</Text>
              <Text style={styles.tipText}>{BS_DETECTION_TIPS[currentTipIndex]}</Text>
            </Animated.View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
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
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712', // Dark navy background (gray-950)
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: '900', // Font black
    marginBottom: 8,
    color: '#f3f4f6', // White text (gray-100)
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af', // Muted text (gray-400)
    marginBottom: 30,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1f2937', // Dark gray (gray-800)
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
    backgroundColor: '#111827', // Darker gray (gray-900)
  },
  tabText: {
    fontSize: 16,
    color: '#9ca3af', // Gray-400
    fontWeight: '500',
  },
  activeTabText: {
    color: '#f3f4f6', // White when active
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#111827', // Dark card background (gray-900)
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1f2937', // Dark border (gray-800)
    color: '#f3f4f6', // White text
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
    color: '#9ca3af', // Gray-400
  },
  tipContainer: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1f2937', // Dark gray background (gray-800)
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ea580c', // Orange accent (orange-600)
    width: '100%',
  },
  tipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fb923c', // Orange-400
    marginBottom: 6,
  },
  tipText: {
    fontSize: 15,
    color: '#d1d5db', // Gray-300
    lineHeight: 20,
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#374151', // Gray-700
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#9ca3af', // Gray-400
    fontWeight: '500',
  },
  analyzeButton: {
    backgroundColor: '#ea580c', // Orange-600
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  analyzeButtonDisabled: {
    backgroundColor: '#374151', // Gray-700 when disabled
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700', // Bold
  },
  demoContainer: {
    marginBottom: 20,
  },
  demoLabel: {
    fontSize: 14,
    color: '#9ca3af', // Gray-400
    marginBottom: 8,
    fontWeight: '500',
  },
  demoButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoButton: {
    backgroundColor: '#1f2937', // Gray-800
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151', // Gray-700
  },
  demoButtonText: {
    fontSize: 13,
    color: '#9ca3af', // Gray-400
    fontWeight: '500',
  },
});
