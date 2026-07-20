import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { officeWebUrl } from '../../components/office/officeItem';
import { ReadOnlyTopBar } from '../../components/office/ReadOnlyTopBar';
import { ViewerError, ViewerLoading } from '../../components/office/ViewerStates';
import { SheetGridView } from '../../components/sheets/SheetGridView';
import { type WorkbookSnapshot } from '../../components/sheets/sheetSnapshot';
import { officeApi } from '../../services/office/officeApi';
import { darkTheme, lightTheme } from '../../theme';
import { officeTypeColor } from '../../theme/officeColors';

export default function SheetViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const accent = officeTypeColor('sheet', colorScheme === 'dark').icon;

  const [sheetTitle, setSheetTitle] = useState<string | undefined>(title);
  const [workbook, setWorkbook] = useState<WorkbookSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    officeApi
      .fetchSheetContent(id)
      .then((res) => {
        if (!active) return;
        setSheetTitle(res.title);
        setWorkbook((res.workbook as WorkbookSnapshot | null) ?? null);
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ReadOnlyTopBar
        title={sheetTitle || title || 'Tabelle'}
        webUrl={officeWebUrl('sheet', id)}
        accent={accent}
      />
      {status === 'loading' ? (
        <ViewerLoading />
      ) : status === 'error' ? (
        <ViewerError />
      ) : (
        <SheetGridView workbook={workbook} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
