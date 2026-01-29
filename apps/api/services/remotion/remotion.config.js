import { Config } from '@remotion/cli/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

Config.setEntryPoint(path.join(__dirname, 'index.js'));
Config.setPublicDir(path.join(__dirname, '../../public'));
