/**
 * DOM Selectors Module
 *
 * This module exports the current version of the Discord DOM extractor.
 * When Discord updates their UI and selectors break:
 * 1. Create DiscordDOMExtractor.v2.ts with updated selectors
 * 2. Update this export to use v2
 * 3. No other code changes needed
 */

export { DiscordDOMExtractorV1 as DiscordDOMExtractor } from './DiscordDOMExtractor.v1';
export { RawMessageData } from './types';
