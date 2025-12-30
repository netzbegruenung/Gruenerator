import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import {
  getAvatarDisplayProps,
  getRobotAvatarUrl,
  validateRobotId,
} from '@gruenerator/shared/avatar';
import { colors } from '../../theme';

interface ProfileAvatarProps {
  avatarRobotId?: string | number;
  displayName?: string;
  email?: string;
  size?: 'small' | 'medium' | 'large';
}

const SIZE_MAP = {
  small: 32,
  medium: 40,
  large: 80,
};

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  avatarRobotId,
  displayName,
  email,
  size = 'medium',
}) => {
  const avatarProps = getAvatarDisplayProps({
    avatar_robot_id: avatarRobotId,
    display_name: displayName,
    email,
  });

  const dimension = SIZE_MAP[size];

  if (avatarProps.type === 'robot' && avatarProps.robotId) {
    const robotId = validateRobotId(avatarProps.robotId);
    const imageUrl = getRobotAvatarUrl(robotId);

    return (
      <View style={[styles.container, { width: dimension, height: dimension }]}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
          contentFit="cover"
          accessibilityLabel={avatarProps.alt}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.initialsContainer,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: colors.primary[100],
        },
      ]}
    >
      <Text
        style={[
          styles.initialsText,
          {
            fontSize: dimension * 0.4,
            color: colors.primary[700],
          },
        ]}
      >
        {avatarProps.initials}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  initialsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontWeight: '600',
  },
});

export default ProfileAvatar;
