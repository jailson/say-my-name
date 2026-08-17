/**
 * Importing this module registers <say-my-name>. It is also what the CDN snippet loads.
 * For manual registration under a different tag name, import from 'say-my-name/element'.
 */
import { defineSayMyName } from './element.js';

export { SayMyNameElement, defineSayMyName } from './element.js';
export type { DisplayMode, Pronunciation, TtsPolicy } from './types.js';

defineSayMyName();
