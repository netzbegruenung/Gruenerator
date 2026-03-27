# Subtitler Beta

Rich subtitle editor with Canvas rendering, drag-to-reposition, undo/redo history, and a 3-panel layout.

## Credits

The video player, Canvas subtitle overlay, subtitle list editor, subtitle settings panel, and history store
are ported from [flycut-caption](https://github.com/x007xyz/flycut-caption) by x007xyz, licensed under MIT.

Adaptations:

- Replaced i18n with hardcoded German strings
- Replaced `ahooks/useSize` with a local `useElementSize` hook
- Replaced flycut's client-side video export (WebAV/FFmpeg.wasm) with the existing server-side export pipeline
- Added integration with the existing subtitler upload/transcription flow
- Import paths adapted for the gruenerator monorepo
