import { registerBlockType } from '@wordpress/blocks';
import edit from './edit';
import save from './save';
import metadata from './block.json';
import './style.scss'; // Frontend Styles
import './editor.scss'; // Editor Styles

registerBlockType(metadata.name, {
  ...metadata,
  edit,
  save,
});
