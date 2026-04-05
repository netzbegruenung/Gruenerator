import { registerBlockType } from '@wordpress/blocks';
import Edit from './edit';
import save from './save';
import metadata from './block.json';
import './style.scss';
import './editor.scss';

registerBlockType(metadata.name, {
  ...metadata,
  edit: Edit,
  save,
});
