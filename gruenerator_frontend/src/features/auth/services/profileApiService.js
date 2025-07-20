
import apiClient from '../../../components/utils/apiClient';

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const profileApiService = {
  // === PROFILE DATA ===
  async getProfile() {
    const response = await fetch(`${AUTH_BASE_URL}/auth/profile`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Laden der Profildaten. Status: ${response.status}`);
    }

    const data = await response.json();
    const profile = data.user || data.profile || null;

    if (!profile) {
      throw new Error('Profil nicht gefunden');
    }

    const profileData = {
      display_name: profile.display_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email || null,
      avatar_robot_id: profile.avatar_robot_id,
      is_admin: profile.is_admin,
      username: profile.username,
      keycloak_id: profile.keycloak_id,
      // Add missing profile fields that are needed for frontend state management
      bundestag_api_enabled: profile.bundestag_api_enabled || false,
      igel_modus: profile.igel_modus || false,
      beta_features: profile.beta_features || {},
      memory_enabled: profile.memory_enabled || false
    };

    // Log for debugging bundestag API slider issue
    console.log('[ProfileAPI] getProfile returning data:', {
      userId: profile.id || 'unknown',
      igelModus: profileData.igel_modus,
      bundestagApiEnabled: profileData.bundestag_api_enabled,
      source: 'profileApiService.getProfile'
    });

    return profileData;
  },

  async getBundledProfileData(options = {}) {
    const {
      includeAnweisungen = true,
      includeQACollections = true,
      includeCustomGenerators = true,
      includeUserTexts = false,
      includeUserTemplates = false,
      includeMemories = false
    } = options;

    const params = new URLSearchParams({
      anweisungen: includeAnweisungen,
      qa_collections: includeQACollections,
      custom_generators: includeCustomGenerators,
      user_texts: includeUserTexts,
      user_templates: includeUserTemplates,
      memories: includeMemories
    });

    const response = await fetch(`${AUTH_BASE_URL}/auth/profile/bundle?${params}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Laden der Profildaten. Status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Fehler beim Laden der Profildaten');
    }

    return {
      profile: data.profile,
      anweisungenWissen: data.anweisungen_wissen || null,
      qaCollections: data.qa_collections || null,
      customGenerators: data.custom_generators || null,
      userTexts: data.user_texts || null,
      userTemplates: data.user_templates || null,
      memories: data.memories || null
    };
  },

  async updateProfile(profileData) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/profile`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Profil-Update fehlgeschlagen');
    }
    
    return result.profile;
  },

  async updateAvatar(avatarRobotId) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/profile/avatar`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_robot_id: avatarRobotId })
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Avatar-Update fehlgeschlagen');
    }
    
    return result.profile;
  },

  // === ANWEISUNGEN & WISSEN ===
  async getAnweisungenWissen() {
    const response = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden');
    }
    
    const json = await response.json();
    return {
      antragPrompt: json.antragPrompt || '',
      antragGliederung: json.antragGliederung || '',
      socialPrompt: json.socialPrompt || '',
      universalPrompt: json.universalPrompt || '',
      gruenejugendPrompt: json.gruenejugendPrompt || '',
      presseabbinder: json.presseabbinder || '',
      knowledge: json.knowledge || []
    };
  },

  async saveAnweisungenWissen(data) {
    const cleanedKnowledge = data.knowledge.map(entry => ({
      id: typeof entry.id === 'string' && entry.id.startsWith('new-') ? undefined : entry.id,
      title: entry.title,
      content: entry.content
    }));

    const payload = {
      custom_antrag_prompt: data.customAntragPrompt,
      custom_antrag_gliederung: data.customAntragGliederung,
      custom_social_prompt: data.customSocialPrompt,
      custom_universal_prompt: data.customUniversalPrompt,
      custom_gruenejugend_prompt: data.customGruenejugendPrompt,
      presseabbinder: data.presseabbinder,
      knowledge: cleanedKnowledge
    };

    const response = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Fehler beim Speichern' }));
      throw new Error(errorData.message || 'Ein unbekannter Fehler ist aufgetreten.');
    }
    
    return await response.json();
  },

  async deleteKnowledgeEntry(entryId) {
    if (typeof entryId === 'string' && entryId.startsWith('new-')) {
      return;
    }
    
    const response = await fetch(`${AUTH_BASE_URL}/auth/anweisungen-wissen/${entryId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const msg = await response.text();
      throw new Error(msg || 'Fehler beim Löschen');
    }
    
    return entryId;
  },

  // === Q&A COLLECTIONS ===
  async getQACollections() {
    const response = await fetch(`${AUTH_BASE_URL}/auth/qa-collections`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Q&A-Sammlungen');
    }
    
    const json = await response.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch Q&A collections');
    }
    
    return json.collections || [];
  },

  async createQACollection(collectionData) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/qa-collections`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: collectionData.name,
        description: collectionData.description,
        custom_prompt: collectionData.custom_prompt,
        documents: collectionData.documents
      })
    });
    
    if (!response.ok) {
      throw new Error('Fehler beim Erstellen der Q&A-Sammlung');
    }
    
    const json = await response.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to create Q&A collection');
    }
    
    return json.collection;
  },

  async updateQACollection(collectionId, collectionData) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/qa-collections/${collectionId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: collectionData.name,
        description: collectionData.description,
        custom_prompt: collectionData.custom_prompt,
        documents: collectionData.documents
      })
    });
    
    if (!response.ok) {
      throw new Error('Fehler beim Aktualisieren der Q&A-Sammlung');
    }
    
    const json = await response.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to update Q&A collection');
    }
    
    return json;
  },

  async deleteQACollection(collectionId) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/qa-collections/${collectionId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Fehler beim Löschen der Q&A-Sammlung');
    }
    
    const json = await response.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to delete Q&A collection');
    }
    
    return json;
  },

  // === CUSTOM GENERATORS ===
  async getCustomGenerators() {
    const response = await apiClient.get('/auth/custom_generator');
    return response.data || [];
  },

  async deleteCustomGenerator(generatorId) {
    const response = await apiClient.delete(`/auth/custom_generator/${generatorId}`);
    return response.data;
  },

  async getGeneratorDocuments(generatorId) {
    const response = await apiClient.get(`/auth/custom_generator/${generatorId}/documents`);
    return response.data.documents || [];
  },

  async addDocumentsToGenerator(generatorId, documentIds) {
    const response = await apiClient.post(`/auth/custom_generator/${generatorId}/documents`, {
      documentIds: documentIds
    });
    return response.data;
  },

  async removeDocumentFromGenerator(generatorId, documentId) {
    const response = await apiClient.delete(`/auth/custom_generator/${generatorId}/documents/${documentId}`);
    return response.data;
  },

  async createCustomGenerator(generatorData) {
    const response = await apiClient.post('/auth/custom_generator/create', generatorData);
    return response.data;
  },

  // === USER TEXTS ===
  async getUserTexts() {
    const response = await fetch(`${AUTH_BASE_URL}/user-texts`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch texts');
    }
    
    return data.data || [];
  },

  async updateTextTitle(textId, newTitle) {
    const response = await fetch(`${AUTH_BASE_URL}/user-texts/${textId}/metadata`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to update text title');
    }
    
    return result;
  },

  async deleteText(textId) {
    const response = await fetch(`${AUTH_BASE_URL}/user-texts/${textId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to delete text');
    }
    
    return result;
  },

  // === USER TEMPLATES ===
  async getUserTemplates() {
    const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch templates');
    }
    
    return data.data || [];
  },

  async updateTemplateTitle(templateId, newTitle) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates/${templateId}/metadata`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to update template title');
    }
    
    return result;
  },

  async deleteTemplate(templateId) {
    const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates/${templateId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to delete template');
    }
    
    return result;
  },

  // === AVAILABLE DOCUMENTS (for Q&A) ===
  async getAvailableDocuments() {
    const response = await fetch(`${AUTH_BASE_URL}/documents/user`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Dokumente');
    }
    
    const json = await response.json();
    
    if (!json.success) {
      throw new Error(json.message || 'Failed to fetch documents');
    }

    // Filter only completed documents
    const completedDocuments = (json.data || []).filter(doc => doc.status === 'completed');
    return completedDocuments;
  },

  // === MEMORY (MEM0RY) ===
  async getMemories(userId) {
    const response = await fetch(`${AUTH_BASE_URL}/mem0/user/${userId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Fehler beim Laden der Erinnerungen');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch memories');
    }
    
    return result.memories || [];
  },

  async addMemory(text, topic = '') {
    const response = await fetch(`${AUTH_BASE_URL}/mem0/add-text`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, topic })
    });

    if (!response.ok) {
      throw new Error('Fehler beim Hinzufügen der Erinnerung');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to add memory');
    }
    
    return result;
  },

  async deleteMemory(memoryId) {
    const response = await fetch(`${AUTH_BASE_URL}/mem0/${memoryId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Fehler beim Löschen der Erinnerung');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to delete memory');
    }
    
    return result;
  }
};

export default profileApiService;