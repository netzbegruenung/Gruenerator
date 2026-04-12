/**
 * ts-rest contract for user profile endpoints.
 *
 * Covers the full surface of apps/api/routes/auth/userProfile.ts:
 *   GET    /api/profile
 *   PUT    /api/profile
 *   PATCH  /api/profile/avatar
 *   GET    /api/profile/beta-features
 *   PATCH  /api/profile/beta-features
 *   PATCH  /api/profile/message-color
 *   GET    /api/profile/user-defaults
 *   PATCH  /api/profile/user-defaults
 *   GET    /api/profile/notification-preferences
 *   PATCH  /api/profile/notification-preferences
 *   DELETE /api/delete-account
 */
import { initContract } from '@ts-rest/core';

import {
  profileUpdateBodySchema,
  avatarUpdateBodySchema,
  betaFeatureToggleBodySchema,
  messageColorUpdateBodySchema,
  userDefaultUpdateBodySchema,
  notificationPreferencesBodySchema,
  deleteAccountBodySchema,
  getProfileResponseSchema,
  updateProfileResponseSchema,
  updateAvatarResponseSchema,
  getBetaFeaturesResponseSchema,
  updateBetaFeaturesResponseSchema,
  updateMessageColorResponseSchema,
  getUserDefaultsResponseSchema,
  updateUserDefaultsResponseSchema,
  getNotificationPreferencesResponseSchema,
  updateNotificationPreferencesResponseSchema,
  deleteAccountResponseSchema,
  userProfileErrorResponseSchema,
  deleteAccountErrorResponseSchema,
} from '../schemas/userProfile.js';

const c = initContract();

export const userProfileContract = c.router(
  {
    /**
     * GET /api/profile
     * Get (or auto-create) the current user's profile.
     */
    getProfile: {
      method: 'GET',
      path: '/api/profile',
      responses: {
        200: getProfileResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Get current user profile',
    },

    /**
     * PUT /api/profile
     * Update profile fields (display name, username, avatar, email, custom prompt).
     */
    updateProfile: {
      method: 'PUT',
      path: '/api/profile',
      body: profileUpdateBodySchema,
      responses: {
        200: updateProfileResponseSchema,
        400: userProfileErrorResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Update user profile',
    },

    /**
     * PATCH /api/profile/avatar
     * Update only the avatar robot ID.
     */
    updateAvatar: {
      method: 'PATCH',
      path: '/api/profile/avatar',
      body: avatarUpdateBodySchema,
      responses: {
        200: updateAvatarResponseSchema,
        400: userProfileErrorResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Update user avatar',
    },

    /**
     * GET /api/profile/beta-features
     * Get merged beta feature flags for the current user.
     */
    getBetaFeatures: {
      method: 'GET',
      path: '/api/profile/beta-features',
      responses: {
        200: getBetaFeaturesResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Get beta feature flags',
    },

    /**
     * PATCH /api/profile/beta-features
     * Toggle a single beta feature on or off.
     */
    updateBetaFeatures: {
      method: 'PATCH',
      path: '/api/profile/beta-features',
      body: betaFeatureToggleBodySchema,
      responses: {
        200: updateBetaFeaturesResponseSchema,
        400: userProfileErrorResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Toggle a beta feature',
    },

    /**
     * PATCH /api/profile/message-color
     * Update the user's chat message color.
     */
    updateMessageColor: {
      method: 'PATCH',
      path: '/api/profile/message-color',
      body: messageColorUpdateBodySchema,
      responses: {
        200: updateMessageColorResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Update chat message color',
    },

    /**
     * GET /api/profile/user-defaults
     * Get per-generator user defaults.
     */
    getUserDefaults: {
      method: 'GET',
      path: '/api/profile/user-defaults',
      responses: {
        200: getUserDefaultsResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Get user defaults',
    },

    /**
     * PATCH /api/profile/user-defaults
     * Save a single user-default value for a generator + key.
     */
    updateUserDefaults: {
      method: 'PATCH',
      path: '/api/profile/user-defaults',
      body: userDefaultUpdateBodySchema,
      responses: {
        200: updateUserDefaultsResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Update a user default',
    },

    /**
     * GET /api/profile/notification-preferences
     * Get per-category, per-channel notification preferences.
     */
    getNotificationPreferences: {
      method: 'GET',
      path: '/api/profile/notification-preferences',
      responses: {
        200: getNotificationPreferencesResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Get notification preferences',
    },

    /**
     * PATCH /api/profile/notification-preferences
     * Update notification preference channels for a single category.
     */
    updateNotificationPreferences: {
      method: 'PATCH',
      path: '/api/profile/notification-preferences',
      body: notificationPreferencesBodySchema,
      responses: {
        200: updateNotificationPreferencesResponseSchema,
        400: userProfileErrorResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Update notification preferences',
    },

    /**
     * DELETE /api/delete-account
     * Delete the current user's account (requires confirmation phrase).
     */
    deleteAccount: {
      method: 'DELETE',
      path: '/api/delete-account',
      body: deleteAccountBodySchema,
      responses: {
        200: deleteAccountResponseSchema,
        400: deleteAccountErrorResponseSchema,
        500: deleteAccountErrorResponseSchema,
      },
      summary: 'Delete user account',
    },
  },
  { pathPrefix: '' }
);
