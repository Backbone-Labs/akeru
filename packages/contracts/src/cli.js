#!/usr/bin/env node
import { validatePackage } from './index.js';
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: akeru-validate <package-directory>');
  process.exitCode = 2;
} else {
  const result = await validatePackage(args[0]);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.valid ? 0 : 1;
}
