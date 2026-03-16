import { AIPromptInput } from '@gruenerator/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../../../components/utils/apiClient';
import { useBoards } from '../../boards/hooks/useBoards';

import { cn } from '@/utils/cn';

type CreationType = 'dokument' | 'board';

const EXAMPLES = [
  { label: 'Wahlkampf', text: 'Wahlkampf für die Kommunalwahl planen' },
  { label: 'Pressemitteilung', text: 'Pressemitteilung zum Klimaschutz in unserer Kommune' },
  { label: 'Veranstaltung', text: 'Eine Mitgliederversammlung organisieren' },
  { label: 'Antrag', text: 'Antrag für den Kreisparteitag zum Thema nachhaltige Mobilität' },
  { label: 'Social Media', text: 'Social-Media-Kampagne zum Klimaschutz' },
];

const toggleBtnClass = (active: boolean) =>
  cn(
    'px-3 py-1 text-xs font-medium rounded-md transition-all border-none cursor-pointer',
    active
      ? 'bg-background-pure text-foreground shadow-sm'
      : 'bg-transparent text-grey-500 hover:text-foreground'
  );

export function UnifiedAICreator() {
  const [type, setType] = useState<CreationType>('dokument');
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { generateBoard } = useBoards();

  const generateDoc = useMutation({
    mutationFn: async (desc: string) => {
      const res = await apiClient.post('/docs/generate', { description: desc });
      return res.data as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workplace-recent-docs'] });
    },
  });

  const isLoading = generateBoard.isPending || generateDoc.isPending;

  const handleSubmit = useCallback(() => {
    const trimmed = description.trim();
    if (!trimmed || isLoading) return;

    if (type === 'dokument') {
      generateDoc.mutate(trimmed, {
        onSuccess: (data) => navigate(`/docs/${data.id}`),
      });
    } else {
      generateBoard.mutate(trimmed, {
        onSuccess: (data) => {
          navigate(`/boards/${data.board.id}`, {
            state: { generatedStructure: data.generatedStructure ?? undefined },
          });
        },
      });
    }
  }, [description, isLoading, type, generateDoc, generateBoard, navigate]);

  return (
    <AIPromptInput
      value={description}
      onChange={setDescription}
      onSubmit={handleSubmit}
      placeholder="Beschreibe, was du erstellen möchtest…"
      isLoading={isLoading}
      examples={EXAMPLES}
      className="max-w-3xl mx-auto mb-xl"
      footer={
        <div className="flex gap-0.5 p-0.5 bg-grey-100 dark:bg-grey-800 rounded-md shrink-0">
          <button
            type="button"
            onClick={() => setType('dokument')}
            className={toggleBtnClass(type === 'dokument')}
          >
            Dokument
          </button>
          <button
            type="button"
            onClick={() => setType('board')}
            className={toggleBtnClass(type === 'board')}
          >
            Board
          </button>
        </div>
      }
    />
  );
}
