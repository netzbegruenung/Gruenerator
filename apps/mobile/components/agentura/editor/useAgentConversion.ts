/**
 * Umwandeln eines eigenen Agents in der App — derselbe Ablauf wie der
 * Web-Dialog, als Folge von Rückfragen: Ziel wählen, Probelauf des Servers
 * zeigen (was mitkommt, was nicht), umwandeln, Nachfolger öffnen. Kam beim
 * Umwandeln weniger mit als angekündigt, sagt die letzte Rückfrage das.
 */
import { type AgentConversionItem, type AgentConversionTarget } from '@gruenerator/contracts';
import {
  AGENT_CONVERSION_OUTCOME_LABEL,
  AGENT_CONVERSION_PART_LABEL,
  AGENT_CONVERSION_TARGET_LABEL,
  recommendedConversionTarget,
  requestAgentConversion,
  sameConversionOutcomes,
  useConvertUserAgent,
  type ConvertibleAgent,
} from '@gruenerator/shared/grueneratoren';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { actionUrlToRoute } from '../../../utils/actionUrl';

function describeItems(items: readonly AgentConversionItem[]): string {
  return items
    .map(
      (i) =>
        `${AGENT_CONVERSION_PART_LABEL[i.part]} · ${AGENT_CONVERSION_OUTCOME_LABEL[i.outcome]}${
          i.note ? `\n${i.note}` : ''
        }`
    )
    .join('\n\n');
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Bitte versuche es erneut.';
}

export function useAgentConversion(agent: ConvertibleAgent | null) {
  const convert = useConvertUserAgent(agent?.identifier ?? '');
  const [busy, setBusy] = useState(false);

  const openSuccessor = (path: string) => router.push(actionUrlToRoute(path));

  const run = async (
    target: AgentConversionTarget,
    fresh: boolean,
    planned: AgentConversionItem[]
  ) => {
    const noun = AGENT_CONVERSION_TARGET_LABEL[target];
    setBusy(true);
    // Kein `finally`: der React Compiler der App übersetzt es nicht
    // (test/reactCompilerCoverage.vitest.ts).
    let res;
    try {
      res = await convert.mutateAsync({ target, fresh });
    } catch (err) {
      setBusy(false);
      Alert.alert('Umwandeln hat nicht geklappt', errorText(err));
      return;
    }
    setBusy(false);
    if (!res.result) return;
    const path = res.result.path;
    if (sameConversionOutcomes(planned, res.items)) {
      openSuccessor(path);
      return;
    }
    Alert.alert(
      `${noun} angelegt`,
      `Es kam aber nicht alles mit, was angekündigt war.\n\n${describeItems(res.items)}`,
      [
        { text: 'Schließen', style: 'cancel' },
        { text: `${noun} öffnen`, onPress: () => openSuccessor(path) },
      ]
    );
  };

  const review = async (target: AgentConversionTarget) => {
    if (!agent) return;
    const noun = AGENT_CONVERSION_TARGET_LABEL[target];
    setBusy(true);
    let plan;
    try {
      plan = await requestAgentConversion(
        agent.identifier,
        { target, dryRun: true },
        'Vorschau konnte nicht geladen werden.'
      );
    } catch (err) {
      setBusy(false);
      Alert.alert('Vorschau nicht verfügbar', errorText(err));
      return;
    }
    setBusy(false);

    if (plan.blocked) {
      Alert.alert(`Nicht als ${noun} möglich`, plan.blocked);
      return;
    }
    const existing = plan.result;
    if (existing) {
      Alert.alert(
        'Schon umgewandelt',
        `Du hast diesen Agent schon in ein ${noun} umgewandelt. Du kannst es öffnen oder eine neue Kopie anlegen.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Neue Kopie', onPress: () => void run(target, true, plan.items) },
          { text: `${noun} öffnen`, onPress: () => openSuccessor(existing.path) },
        ]
      );
      return;
    }
    Alert.alert(`In ${noun} umwandeln?`, describeItems(plan.items), [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Umwandeln', onPress: () => void run(target, false, plan.items) },
    ]);
  };

  /** Erste Rückfrage: welches Ziel. Die Empfehlung steht vorn. */
  const start = () => {
    if (!agent) return;
    const recommended = recommendedConversionTarget(agent);
    const other: AgentConversionTarget = recommended === 'recipe' ? 'project' : 'recipe';
    Alert.alert(
      'Agent umwandeln',
      'Agents laufen aus. Dein Agent bleibt dabei unverändert bestehen, wir legen eine Kopie an.\n\nRezept: eine Schreibanweisung für jeden Chat.\nProjekt: Anweisungen, Notebooks und Rezepte an einem Ort.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: `${AGENT_CONVERSION_TARGET_LABEL[recommended]} (empfohlen)`,
          onPress: () => void review(recommended),
        },
        { text: AGENT_CONVERSION_TARGET_LABEL[other], onPress: () => void review(other) },
      ]
    );
  };

  return { start, busy };
}
