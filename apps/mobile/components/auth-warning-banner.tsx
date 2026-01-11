import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';

interface AuthWarningBannerProps {
  isAnonymousDisabled: boolean;
  error: string | null;
}

export function AuthWarningBanner({ isAnonymousDisabled, error }: AuthWarningBannerProps) {
  if (!error && !isAnonymousDisabled) {
    return null;
  }

  const handlePress = () => {
    // Open Supabase dashboard
    Linking.openURL('https://supabase.com/dashboard/project/qmhqfmkbvyeabftpchex/auth/providers');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>⚠️</Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Authentication Disabled</Text>
          <Text style={styles.message}>
            {isAnonymousDisabled
              ? 'Anonymous sign-ins are disabled. Analysis may fail.'
              : error || 'Authentication error occurred.'}
          </Text>
        </View>
      </View>
      {isAnonymousDisabled && (
        <TouchableOpacity style={styles.button} onPress={handlePress}>
          <Text style={styles.buttonText}>Enable in Dashboard</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3CD',
    borderBottomWidth: 1,
    borderBottomColor: '#FFECB5',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#856404',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
