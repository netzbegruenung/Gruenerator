import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';

/**
 * Custom Keycloak Strategy extending passport-openidconnect
 * Handles Keycloak-specific parameters like kc_idp_hint
 */
class KeycloakStrategy extends OpenIDConnectStrategy {
  constructor(options, verify) {
    super(options, verify);
    this.name = 'keycloak-oidc';
  }

  /**
   * Override authorizationParams to include Keycloak-specific parameters
   * This method is called when building the authorization URL
   */
  authorizationParams(options) {
    const params = {};
    
    // Include kc_idp_hint if specified (for identity provider routing)
    if (options.kc_idp_hint) {
      params.kc_idp_hint = options.kc_idp_hint;
    }
    
    // Include any other custom parameters that might be needed
    if (options.prompt && options.prompt !== 'none') {
      // Let the base strategy handle prompt, but we can add custom logic here if needed
    }
    
    // Log for debugging
    if (Object.keys(params).length > 0) {
      console.log('[KeycloakStrategy] Adding authorization params:', params);
    }
    
    return params;
  }
}

export { KeycloakStrategy };