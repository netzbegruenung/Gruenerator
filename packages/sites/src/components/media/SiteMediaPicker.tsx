/**
 * SiteMediaPicker
 * Picks images from the shared media library for the site editor (hero,
 * profile and section images). Driven by `useMediaPickerStore`.
 */

import { useMediaPickerStore } from '@gruenerator/shared/media-library';
import { MediaPickerGrid } from '@gruenerator/shared/media-library/ui';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';

export function SiteMediaPicker() {
  const { isOpen, selectedItems, mediaTypeFilter, closePicker, selectItem, confirmSelection } =
    useMediaPickerStore();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closePicker()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-[800px]"
      >
        <DialogHeader className="border-b border-grey-200 px-5 py-4 dark:border-grey-700">
          <DialogTitle>Mediathek</DialogTitle>
        </DialogHeader>
        <div className="min-h-[200px] flex-1 overflow-y-auto px-5 py-4">
          {isOpen && (
            <MediaPickerGrid
              type={mediaTypeFilter === 'all' ? 'image' : mediaTypeFilter}
              selectedIds={selectedItems.map((item) => item.id)}
              onPick={selectItem}
            />
          )}
        </div>
        <DialogFooter className="border-t border-grey-200 px-5 py-4 dark:border-grey-700">
          <Button variant="outline" onClick={closePicker}>
            Abbrechen
          </Button>
          <Button onClick={confirmSelection} disabled={selectedItems.length === 0}>
            Auswählen {selectedItems.length > 0 && `(${selectedItems.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SiteMediaPicker;
