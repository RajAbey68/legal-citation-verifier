/**
 * Verify microservice — organisation configuration store.
 *
 * Each org_id maps to:
 *  - notebook_id   : the NotebookLM notebook containing that org's curated sources
 *  - defaultSources: which source groups are queried by default
 *  - gatekeeperRules: sector-specific accuracy rules embedded in every prompt
 *  - label         : human-readable name shown in the UI
 *
 * The 'digital-law-firm' entry is the original Legal Citation Verifier (Verify v0.1).
 * New sector tiers (finance, architecture, etc.) can be added here without touching
 * any route code.
 */

export interface OrgConfig {
  label: string;
  notebookId: string;
  defaultSources: string[];
  /** Source group → array of NotebookLM source UUIDs */
  sourceIds: Record<string, string[]>;
  /** Lines injected into the gatekeeper prompt */
  gatekeeperRules: string[];
}

// ---------------------------------------------------------------------------
// Legal sector — The Digital Law Firm (default / original)
// ---------------------------------------------------------------------------
const LEGAL_SOURCES: Record<string, string[]> = {
  sra: [
    'f61bc3cf-11f0-4d84-9431-571b158a2951',
    '4a93811e-ca14-4367-b15d-b040be2207a9',
    '8793eec6-3f09-43af-8cd9-1e10bd8026c6',
    '32a2222f-9f71-4db8-91d5-9e388d5bb02f',
    'ba7db6c8-3bc2-4316-8f42-01384ac3ee40',
    'a3e8d6f7-af5d-4243-8a4d-73b982914db0',
  ],
  fca: [
    '2b8f5b2a-3b99-4e22-aa9b-1b40a5771cc8',
    '571b906a-80d1-4b9b-9002-210b8b6ac2d8',
    'ea54aabb-17b3-4444-b403-590c3663a827',
    'fce4d0f3-b8cb-4423-b46f-cc206fe13ea3',
    '2e209923-fc4b-4eef-b90b-73ea3bb30063',
    '57899ed0-8d19-4b86-b746-f28bfff564af',
  ],
  eu: [
    'ed7f739f-fd05-40c1-8436-876f3409eafc',
    '61dbcb3c-539d-4cca-ab83-4a8d4b311764',
  ],
  lawgazette: ['471b5ebf-cfc1-487a-bf2c-3161379146f2'],
  ico: [
    '1feee333-7717-4e60-9750-6374ba3317bf',
    '58ab671f-7e2d-46ac-af68-b90984f5a498',
  ],
  lawsociety: ['786c220b-9f50-4311-9226-087a2611a01d'],
  iso: [
    '1170b5d7-8434-498f-b274-2b0bced54522',
    '47fc5ca3-d39f-4f79-b792-06fe633ece30',
  ],
  market: [
    '80667dd8-b4ca-4021-8073-56a45efeefcb',
    'c0b1d09a-7089-4761-bcf4-ecc8df2221f4',
  ],
  legal_regulation: [
    '48add209-d24b-4767-b77e-bae0dcba95da',
    'e69c0e47-c71f-4077-b181-42b88a008dc1',
    'eb7bc748-20dd-4140-bd1d-cf356cea0650',
    '5793f39b-b8cb-4f3d-ac95-d9bc21ab9125',
    '26202196-e077-4f7d-bf5c-4f8e3c1ccfee',
  ],
  ncsc: [
    '0373999c-4a19-45ef-ab18-befaea7fc655',
    '153b8cac-a6c6-4637-888b-2e7e43658864',
    'b8a3f484-a62a-490f-85e4-5df892f506d9',
  ],
  gov_uk: [
    'ef1b9912-5fda-4cfe-9fb0-e56438c20296',
    'd4af73f7-934f-49ae-88dd-4922cb422261',
    '19fece01-c9c3-4d06-83d0-7fa196d74ed8',
    '9d4cf3df-bdb6-4d06-a921-56175e41a5be',
    '73887cbb-2c8d-422f-b701-910d3fd1f4f1',
  ],
  bsi: ['af2e3896-512b-4934-b0e1-0c991732309f'],
  // Gatekeeper protocol — always appended regardless of user selection
  _protocol: [
    '8637f37a-5e6a-442d-9549-c637608c0928',
    '4efc2631-1026-4c17-84d3-ce26e88cfb8e',
  ],
};

const LEGAL_GATEKEEPER_RULES = [
  'Thomson Reuters data = US market only. Flag if applied to UK without caveat.',
  'Law Gazette / Legal Futures = journalism, NOT regulatory authority. Never use to verify SRA/Law Society obligations.',
  '"Law Society recommends" ≠ "Law Society requires" — flag overclaims.',
  'Practitioner frameworks (Task Classification Matrix, Shadow Efficiency, HITL tiers, Story File) are NOT SRA/Law Society standards — flag misattribution.',
  'Approximations ("approximately X%", "around X%") — check if exact figure exists in source.',
  'Future-tense regulatory claims ("SRA will require...") — only verify if source explicitly announces this.',
];

// ---------------------------------------------------------------------------
// Org registry
// ---------------------------------------------------------------------------
export const ORG_CONFIGS: Record<string, OrgConfig> = {
  'digital-law-firm': {
    label: 'The Digital Law Firm (UK Legal)',
    notebookId: '4af61e2f-a5c4-49c3-84d6-9926ac39e270',
    defaultSources: ['sra', 'fca', 'eu', 'lawgazette', 'ico', 'lawsociety', 'iso', 'market', 'legal_regulation', 'ncsc', 'gov_uk', 'bsi'],
    sourceIds: LEGAL_SOURCES,
    gatekeeperRules: LEGAL_GATEKEEPER_RULES,
  },

  // ---------------------------------------------------------------------------
  // Finance sector placeholder — wire up when FCA/PRA/Basel III notebook exists
  // ---------------------------------------------------------------------------
  // 'finance': {
  //   label: 'Financial Services (UK)',
  //   notebookId: 'NOTEBOOK_ID_HERE',
  //   defaultSources: ['fca', 'pra', 'basel', 'mifid'],
  //   sourceIds: { fca: [], pra: [], basel: [], mifid: [], _protocol: [] },
  //   gatekeeperRules: [
  //     'PRA rules supersede FCA rules for prudential matters.',
  //     'MiFID II applies to EEA; post-Brexit UK rules differ — always caveat.',
  //   ],
  // },

  // ---------------------------------------------------------------------------
  // Architecture / Built Environment placeholder
  // ---------------------------------------------------------------------------
  // 'architecture': {
  //   label: 'Architecture & Built Environment (UK)',
  //   notebookId: 'NOTEBOOK_ID_HERE',
  //   defaultSources: ['riba', 'hse', 'building_regs'],
  //   sourceIds: { riba: [], hse: [], building_regs: [], _protocol: [] },
  //   gatekeeperRules: [
  //     'Building Regulations 2010 (England) ≠ Scottish Building Standards — always specify jurisdiction.',
  //     'RIBA guidance is best practice, not statutory obligation — flag overclaims.',
  //   ],
  // },
};

/** Canonical default org when none is supplied */
export const DEFAULT_ORG_ID = 'digital-law-firm';

/**
 * Resolve an org config, falling back to the default legal config.
 * Unknown org_ids are treated as the default rather than erroring —
 * this keeps existing callers (no org_id) working transparently.
 */
export function resolveOrg(orgId?: string | null): OrgConfig & { orgId: string } {
  const id = orgId && ORG_CONFIGS[orgId] ? orgId : DEFAULT_ORG_ID;
  return { orgId: id, ...ORG_CONFIGS[id] };
}

/**
 * Build the flat source ID list for a query.
 * Always appends _protocol sources when they exist in the org config.
 */
export function resolveSourceIds(org: OrgConfig, selectedGroups: string[]): string[] {
  const ids = selectedGroups.flatMap((g) => org.sourceIds[g] ?? []);
  const protocol = org.sourceIds['_protocol'] ?? [];
  return [...ids, ...protocol];
}

/**
 * Build the gatekeeper prompt section from an org's rules.
 */
export function buildGatekeeperRules(org: OrgConfig): string {
  return org.gatekeeperRules.map((r) => `- ${r}`).join('\n');
}
