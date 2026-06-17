// Eager, app-facing config. Importing this module loads .env and validates that
// all required environment variables are present, throwing at startup (fail-fast)
// if any are missing. Import this BEFORE any module that reads process.env so the
// validation runs first. All other modules should read values from `config` here
// rather than touching process.env directly.
import 'dotenv/config';
import { loadConfig } from './validate-env.js';

export const config = loadConfig();
