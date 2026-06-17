#!/usr/bin/env node

/**
 * AIEE Team installer
 *
 * Copies the pack's agents, skills, and commands into a Claude Code harness
 * directory so they can be used without the plugin marketplace flow.
 *
 * Usage:
 *   npx aiee-team install [--scope=project|global] [--force] [--dry-run]
 *   npx aiee-team uninstall [--scope=project|global]
 *   npx aiee-team --help
 *
 * Zero runtime dependencies: only Node's standard library, so `npx` is instant.
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

// Content directories shipped in the package that map 1:1 into a .claude dir.
const CONTENT_DIRS = ['agents', 'skills', 'commands'];
const MANIFEST_NAME = '.aiee-team.json';
const GROUPS_FILE = join(PACKAGE_ROOT, 'groups.json');

function pkgVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function loadGroups() {
  try {
    return JSON.parse(readFileSync(GROUPS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// Resolve which skills and agents to install given --groups. Returns null to
// mean "everything" (no group filter). Core groups (e.g. dev-practices) are
// always folded in because every agent depends on them. Throws on unknown id.
function selectContent(groupIds) {
  if (!groupIds || groupIds.length === 0) return null;
  const groups = loadGroups();
  const known = Object.keys(groups);
  const unknown = groupIds.filter((g) => !known.includes(g));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown group(s): ${unknown.join(', ')}\n  Available: ${known.join(', ')}\n  See: npx aiee-team --list-groups`
    );
  }
  const coreIds = known.filter((g) => groups[g].core);
  const selected = [...new Set([...groupIds, ...coreIds])];
  const skills = new Set();
  const agents = new Set();
  for (const g of selected) {
    for (const s of groups[g].skills || []) skills.add(s);
    for (const a of groups[g].agents || []) agents.add(a);
  }
  return { skills, agents, resolvedGroups: selected };
}

function parseArgs(argv) {
  const opts = { command: undefined, scope: undefined, force: false, dryRun: false, groups: [] };
  for (const arg of argv) {
    if (arg === '--force' || arg === '-f') opts.force = true;
    else if (arg === '--dry-run' || arg === '-n') opts.dryRun = true;
    else if (arg === '--global' || arg === '-g') opts.scope = 'global';
    else if (arg === '--project' || arg === '-p') opts.scope = 'project';
    else if (arg.startsWith('--scope=')) opts.scope = arg.slice('--scope='.length);
    else if (arg.startsWith('--groups=')) {
      opts.groups.push(...arg.slice('--groups='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg === '--list-groups') opts.command = 'list-groups';
    else if (arg === '--help' || arg === '-h') opts.command = 'help';
    else if (arg === '--version' || arg === '-v') opts.command = 'version';
    else if (!arg.startsWith('-') && !opts.command) opts.command = arg;
  }
  return opts;
}

function resolveTarget(scope) {
  // Explicit scope wins; otherwise prefer an existing project ./.claude,
  // then fall back to project (the safe, local default).
  if (scope === 'global') return join(homedir(), '.claude');
  if (scope === 'project') return resolve(process.cwd(), '.claude');
  if (existsSync(resolve(process.cwd(), '.claude'))) return resolve(process.cwd(), '.claude');
  return resolve(process.cwd(), '.claude');
}

function listEntries(dir, { dirsOnly = false } = {}) {
  if (!existsSync(dir)) return [];
  // Skip dotfiles (.gitkeep / .DS_Store) and a dir's own README.md — neither is
  // installable content. dirsOnly additionally drops stray files (skills are dirs).
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && d.name !== 'README.md' && (!dirsOnly || d.isDirectory()))
    .map((d) => d.name);
}

function install(opts) {
  const target = resolveTarget(opts.scope);
  const version = pkgVersion();
  // null = install everything; otherwise Sets of the skills + agents to keep.
  // Commands are always installed in full (there are only a couple).
  const selection = selectContent(opts.groups);

  console.log(`\n  aiee-team v${version}`);
  console.log(`  scope:  ${opts.scope === 'global' ? 'global' : 'project'}`);
  console.log(`  groups: ${selection ? selection.resolvedGroups.join(', ') : 'all'}`);
  console.log(`  target: ${target}${opts.dryRun ? '  (dry run)' : ''}\n`);

  // `copied` drives the console summary; `owned` is the full inventory the
  // pack provides — recorded in the manifest so uninstall stays complete even
  // after an idempotent re-run where nothing new was copied.
  const summary = { copied: 0, skipped: 0, items: {} };
  const owned = {};

  for (const kind of CONTENT_DIRS) {
    const srcDir = join(PACKAGE_ROOT, kind);
    if (!existsSync(srcDir)) continue;
    const destDir = join(target, kind);
    let entries = listEntries(srcDir, { dirsOnly: kind === 'skills' });
    if (selection && kind === 'skills') entries = entries.filter((name) => selection.skills.has(name));
    // Agents are .md files; match on the basename without extension.
    if (selection && kind === 'agents') {
      entries = entries.filter((name) => selection.agents.has(name.replace(/\.md$/, '')));
    }
    summary.items[kind] = [];
    owned[kind] = entries;

    for (const name of entries) {
      const src = join(srcDir, name);
      const dest = join(destDir, name);
      const exists = existsSync(dest);

      if (exists && !opts.force) {
        summary.skipped++;
        continue;
      }

      if (!opts.dryRun) {
        mkdirSync(destDir, { recursive: true });
        if (exists) rmSync(dest, { recursive: true, force: true });
        cpSync(src, dest, { recursive: true });
      }
      summary.copied++;
      summary.items[kind].push(name);
    }

    const n = summary.items[kind].length;
    console.log(`  ${kind.padEnd(9)} ${n} installed${
      entries.length - n > 0 ? `, ${entries.length - n} skipped` : ''
    }`);
  }

  if (!opts.dryRun) {
    mkdirSync(target, { recursive: true });
    // Merge with any prior manifest so incremental group installs accumulate —
    // uninstall must know about everything ever installed at this target.
    const manifestPath = join(target, MANIFEST_NAME);
    const prior = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    const mergedItems = { ...(prior.items || {}) };
    for (const kind of CONTENT_DIRS) {
      mergedItems[kind] = [...new Set([...(prior.items?.[kind] || []), ...(owned[kind] || [])])].sort();
    }
    const priorGroups = Array.isArray(prior.groups) ? prior.groups : [];
    const mergedGroups = selection
      ? [...new Set([...priorGroups, ...selection.resolvedGroups])].sort()
      : 'all';
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: 'aiee-team',
          version,
          scope: opts.scope === 'global' ? 'global' : 'project',
          groups: mergedGroups,
          items: mergedItems,
        },
        null,
        2
      ) + '\n'
    );
  }

  console.log('');
  if (summary.skipped > 0 && !opts.force) {
    console.log(`  ${summary.skipped} item(s) already present — re-run with --force to overwrite.`);
  }
  if (opts.dryRun) {
    console.log('  Dry run complete. No files written.');
  } else {
    console.log(`  Done. ${summary.copied} item(s) installed into ${target}.`);
    console.log('  Restart Claude Code (or run /agents) to pick them up.\n');
  }
}

function uninstall(opts) {
  const target = resolveTarget(opts.scope);
  const manifestPath = join(target, MANIFEST_NAME);
  console.log(`\n  Uninstalling aiee-team from ${target}\n`);

  if (!existsSync(manifestPath)) {
    console.log('  No aiee-team manifest found here. Nothing to remove.');
    console.log('  (Tip: pass --scope=global if you installed globally.)\n');
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let removed = 0;
  for (const [kind, names] of Object.entries(manifest.items || {})) {
    for (const name of names) {
      const dest = join(target, kind, name);
      if (existsSync(dest)) {
        if (!opts.dryRun) rmSync(dest, { recursive: true, force: true });
        removed++;
      }
    }
  }
  if (!opts.dryRun) {
    rmSync(manifestPath, { force: true });
    // Drop now-empty content dirs we created, leaving the harness tidy.
    for (const kind of CONTENT_DIRS) {
      const dir = join(target, kind);
      if (existsSync(dir) && listEntries(dir).length === 0) rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`  Removed ${removed} item(s)${opts.dryRun ? ' (dry run)' : ''}.\n`);
}

function listGroups() {
  const groups = loadGroups();
  const ids = Object.keys(groups);
  console.log('\n  Available groups (install with --groups=<id,id,...>):\n');
  console.log(`  ${'group'.padEnd(16)} ${'skills'.padStart(6)} ${'agents'.padStart(6)}  description`);
  let totalS = 0;
  let totalA = 0;
  for (const id of ids) {
    const s = (groups[id].skills || []).length;
    const a = (groups[id].agents || []).length;
    totalS += s;
    totalA += a;
    const tag = groups[id].core ? ' [core, always installed]' : '';
    console.log(`  ${id.padEnd(16)} ${String(s).padStart(6)} ${String(a).padStart(6)}  ${groups[id].description || ''}${tag}`);
  }
  console.log(`\n  ${totalS} skills, ${totalA} agents across ${ids.length} groups. Omit --groups to install all.`);

  // Surface anything on disk not covered by a group (full install only).
  const groupedSkills = new Set(ids.flatMap((id) => groups[id].skills || []));
  const groupedAgents = new Set(ids.flatMap((id) => groups[id].agents || []));
  const ungroupedSkills = listEntries(join(PACKAGE_ROOT, 'skills'), { dirsOnly: true }).filter((s) => !groupedSkills.has(s));
  const ungroupedAgents = listEntries(join(PACKAGE_ROOT, 'agents'))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''))
    .filter((a) => !groupedAgents.has(a));
  if (ungroupedSkills.length > 0) {
    console.log(`  Note: ${ungroupedSkills.length} skill(s) not in any group (full install only): ${ungroupedSkills.join(', ')}`);
  }
  if (ungroupedAgents.length > 0) {
    console.log(`  Note: ${ungroupedAgents.length} agent(s) not in any group (full install only): ${ungroupedAgents.join(', ')}`);
  }
  console.log('');
}

function help() {
  console.log(`
  aiee-team — install AIEE specialist agents, skills, and commands into Claude Code

  Usage:
    npx aiee-team install [options]      Copy agents/skills/commands into a .claude dir
    npx aiee-team uninstall [options]    Remove items recorded in the install manifest
    npx aiee-team --list-groups          List skill groups and their counts
    npx aiee-team --version              Print version
    npx aiee-team --help                 Show this help

  Options:
    --scope=project       Install into ./.claude (default)
    --scope=global        Install into ~/.claude (all projects)
    -g, --global          Shorthand for --scope=global
    --groups=a,b          Install only these groups' skills + agents (dev-practices always included)
    -f, --force           Overwrite items that already exist
    -n, --dry-run         Show what would change without writing

  Examples:
    npx aiee-team install
    npx aiee-team install --groups=frontend-web,backend-api
    npx aiee-team install --global --groups=cloud-infra
    npx github:ai-enhanced-engineer/aiee-team install
`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cmd = opts.command || 'install';

  if (cmd === 'help') return help();
  if (cmd === 'version') return console.log(pkgVersion());
  if (cmd === 'list-groups' || cmd === 'groups') return listGroups();
  if (cmd === 'install') return install(opts);
  if (cmd === 'uninstall' || cmd === 'remove') return uninstall(opts);

  console.error(`  Unknown command: ${cmd}\n`);
  help();
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
}
