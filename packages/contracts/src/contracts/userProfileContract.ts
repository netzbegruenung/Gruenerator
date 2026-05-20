/**
 * ts-rest contract for user profile endpoints. Sole owner of these routes
 * (the legacy apps/api/routes/auth/userProfile.ts router was removed):
 *   GET    /api/auth/profile
 *   PUT    /api/auth/profile
 *   PATCH  /api/auth/profile/avatar
 *   GET    /api/auth/profile/beta-features
 *   PATCH  /api/auth/profile/beta-features
 *   PATCH  /api/auth/profile/message-color
 *   GET    /api/auth/profile/user-defaults
 *   PATCH  /api/auth/profile/user-defaults
 *   DELETE /api/auth/delete-account
 *
 * Notification preferences (GET/PATCH /api/auth/profile/notification-preferences)
 * are owned by notificationsContract, not this contract.
 */
import { initContract } from '@ts-rest/core';

import {
  profileUpdateBodySchema,
  avatarUpdateBodySchema,
  betaFeatureToggleBodySchema,
  messageColorUpdateBodySchema,
  userDefaultUpdateBodySchema,
  deleteAccountBodySchema,
  getProfileResponseSchema,
  updateProfileResponseSchema,
  updateAvatarResponseSchema,
  getBetaFeaturesResponseSchema,
  updateBetaFeaturesResponseSchema,
  updateMessageColorResponseSchema,
  getUserDefaultsResponseSchema,
  updateUserDefaultsResponseSchema,
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
      path: '/api/auth/profile',
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
      path: '/api/auth/profile',
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
      path: '/api/auth/profile/avatar',
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
      path: '/api/auth/profile/beta-features',
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
      path: '/api/auth/profile/beta-features',
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
      path: '/api/auth/profile/message-color',
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
      path: '/api/auth/profile/user-defaults',
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
      path: '/api/auth/profile/user-defaults',
      body: userDefaultUpdateBodySchema,
      responses: {
        200: updateUserDefaultsResponseSchema,
        500: userProfileErrorResponseSchema,
      },
      summary: 'Update a user default',
    },

    /**
     * DELETE /api/auth/delete-account
     * Delete the current user's account (requires confirmation phrase).
     */
    deleteAccount: {
      method: 'DELETE',
      path: '/api/auth/delete-account',
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
