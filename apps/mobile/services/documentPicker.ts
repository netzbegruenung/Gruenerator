/**
 * Document Picker Service
 *
 * Reusable file picking and upload utilities for the mobile app.
 * Used by scanner, chat document browser, and content picker.
 */

import { FILE_LIMITS, isSupportedFileType, isImageMimeType } from '@gruenerator/chat';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { Alert } from 'react-native';

import { getGlobalApiClient } from './api';

import type { CreateAttachment } from '@assistant-ui/react-native';

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface UploadedDocument {
  id: string;
  title: string;
}

const DOCUMENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
];

const SCANNER_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/**
 * Pick a document using the native file picker.
 * @param types - MIME types to allow (defaults to chat-compatible types)
 * @returns The picked document, or null if cancelled
 */
export async function pickDocument(
  types: string[] = DOCUMENT_TYPES
): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType || 'application/octet-stream',
    size: asset.size || 0,
  };
}

/**
 * Pick a document using the scanner-compatible type list (includes GIF).
 */
export async function pickDocumentForScanner(): Promise<PickedDocument | null> {
  return pickDocument(SCANNER_TYPES);
}

/**
 * Validate a picked document against chat file limits.
 * Shows an Alert on failure and returns false.
 */
export function validatePickedDocument(doc: PickedDocument): boolean {
  if (!isSupportedFileType(doc.mimeType)) {
    Alert.alert('Nicht unterstützt', `Dateityp "${doc.mimeType}" wird nicht unterstützt.`);
    return false;
  }

  if (doc.size > FILE_LIMITS.MAX_FILE_SIZE) {
    const maxMB = Math.round(FILE_LIMITS.MAX_FILE_SIZE / (1024 * 1024));
    Alert.alert('Zu groß', `Datei ist zu groß. Maximum: ${maxMB} MB.`);
    return false;
  }

  return true;
}

/**
 * Upload a picked document to the chat document store.
 * POSTs multipart/form-data to /documents/upload-manual.
 * @returns The created document's id and title, or null on error
 */
export async function uploadDocumentToChat(doc: PickedDocument): Promise<UploadedDocument | null> {
  try {
    const apiClient = getGlobalApiClient();
    const formData = new FormData();

    formData.append('document', {
      uri: doc.uri,
      name: doc.name,
      type: doc.mimeType,
    } as unknown as Blob);

    formData.append('title', doc.name);

    const response = await apiClient.post('/documents/upload-manual', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });

    if (response.data.success) {
      return {
        id: response.data.data.id,
        title: response.data.data.title || doc.name,
      };
    }

    throw new Error(response.data.message || 'Upload fehlgeschlagen');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fehler beim Hochladen';
    Alert.alert('Upload fehlgeschlagen', message);
    return null;
  }
}

/**
 * Convert a picked document into a CreateAttachment for the AUI composer.
 * Reads the file to base64 and constructs the content parts.
 */
export async function pickedDocumentToAttachment(doc: PickedDocument): Promise<CreateAttachment> {
  // Use expo-file-system's native File class instead of Web APIs
  // (fetch → blob → FileReader chain is unreliable in Hermes/RN)
  const file = new ExpoFile(doc.uri);
  const base64 = await file.base64();

  const isImage = isImageMimeType(doc.mimeType);

  return {
    name: doc.name,
    type: isImage ? 'image' : 'document',
    contentType: doc.mimeType,
    content: isImage
      ? [{ type: 'image' as const, image: `data:${doc.mimeType};base64,${base64}` }]
      : [{ type: 'file' as const, data: base64, mimeType: doc.mimeType }],
  };
}

/**
 * Upload a file to the scanner text extraction endpoint.
 * POSTs multipart/form-data to /scanner/extract.
 * @returns Extracted text, file info, and page count
 */
export async function uploadDocumentToScanner(doc: PickedDocument): Promise<{
  text: string;
  pageCount: number;
  fileInfo: { name: string; size: number; mimeType: string };
} | null> {
  try {
    const apiClient = getGlobalApiClient();
    const formData = new FormData();

    formData.append('file', {
      uri: doc.uri,
      name: doc.name,
      type: doc.mimeType,
    } as unknown as Blob);

    const response = await apiClient.post('/scanner/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });

    if (response.data.success) {
      return {
        text: response.data.text,
        pageCount: response.data.pageCount || 0,
        fileInfo: {
          name: response.data.fileInfo?.originalname || doc.name,
          size: response.data.fileInfo?.size || doc.size,
          mimeType: response.data.fileInfo?.mimetype || doc.mimeType,
        },
      };
    }

    throw new Error('Textextraktion fehlgeschlagen');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fehler bei der Textextraktion';
    Alert.alert('Extraktion fehlgeschlagen', message);
    return null;
  }
}
