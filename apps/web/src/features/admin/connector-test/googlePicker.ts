/**
 * Google Picker für den Scope `drive.file`: erst die Auswahl im Picker gibt der
 * App Zugriff auf eine Datei. Dafür müssen Access-Token, API-Key und App-ID
 * (Cloud-Projektnummer) aus demselben Cloud-Projekt stammen wie der OAuth-Client.
 *
 * Das Skript kommt von apis.google.com und wird erst beim ersten Öffnen geladen.
 */

const GAPI_SRC = 'https://apis.google.com/js/api.js';

export interface PickedGoogleFile {
  id: string;
  name: string;
  mimeType: string;
}

interface PickerResponse {
  action: string;
  docs?: PickedGoogleFile[];
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface DocsView {
  setIncludeFolders(include: boolean): DocsView;
  setSelectFolderEnabled(enabled: boolean): DocsView;
}

interface GooglePickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId: string) => DocsView;
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}

// Grenzstelle zu einem fremden, untypisierten Skript — die Form oben ist die Zusicherung.
interface GoogleWindow {
  gapi?: { load(name: string, options: { callback: () => void; onerror: () => void }): void };
  google?: { picker?: GooglePickerNamespace };
}

let loading: Promise<GooglePickerNamespace> | null = null;

function loadPicker(): Promise<GooglePickerNamespace> {
  const w = window as unknown as GoogleWindow;
  if (w.google?.picker) return Promise.resolve(w.google.picker);
  loading ??= new Promise<GooglePickerNamespace>((resolve, reject) => {
    const fail = (message: string) => {
      loading = null;
      reject(new Error(message));
    };
    const script = document.createElement('script');
    script.src = GAPI_SRC;
    script.async = true;
    script.onload = () => {
      if (!w.gapi) return fail('Google-Skript geladen, aber gapi fehlt.');
      w.gapi.load('picker', {
        callback: () =>
          w.google?.picker ? resolve(w.google.picker) : fail('Google Picker fehlt nach dem Laden.'),
        onerror: () => fail('Google Picker konnte nicht geladen werden.'),
      });
    };
    script.onerror = () => fail(`${GAPI_SRC} konnte nicht geladen werden.`);
    document.head.appendChild(script);
  });
  return loading;
}

/** Öffnet den Picker; leeres Array bei Abbruch. */
export async function pickGoogleFiles(config: {
  accessToken: string;
  apiKey: string;
  appId: string;
}): Promise<PickedGoogleFile[]> {
  const picker = await loadPicker();
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) {
          resolve(
            (response.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType }))
          );
        } else if (response.action === picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build()
      .setVisible(true);
  });
}
