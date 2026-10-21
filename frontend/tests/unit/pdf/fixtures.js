import { basicWardrobe } from '../../../src/domain/presets.js';
import { loadCatalog } from '../domain/helpers.js';

export const catalog = loadCatalog();
export const design = basicWardrobe(catalog);
