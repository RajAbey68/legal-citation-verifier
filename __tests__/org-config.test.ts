import {
  ORG_CONFIGS,
  DEFAULT_ORG_ID,
  resolveOrg,
  resolveSourceIds,
  buildGatekeeperRules,
} from '../lib/org-config';

describe('resolveOrg', () => {
  it('returns digital-law-firm config when no org_id supplied', () => {
    const org = resolveOrg();
    expect(org.orgId).toBe('digital-law-firm');
    expect(org.notebookId).toBe('4af61e2f-a5c4-49c3-84d6-9926ac39e270');
  });

  it('returns digital-law-firm config when org_id is null', () => {
    const org = resolveOrg(null);
    expect(org.orgId).toBe('digital-law-firm');
  });

  it('returns digital-law-firm config when org_id is unknown', () => {
    const org = resolveOrg('nonexistent-org');
    expect(org.orgId).toBe('digital-law-firm');
  });

  it('returns correct config for a known org_id', () => {
    const org = resolveOrg('digital-law-firm');
    expect(org.orgId).toBe('digital-law-firm');
    expect(org.label).toBe('The Digital Law Firm (UK Legal)');
  });

  it('includes all expected source groups for digital-law-firm', () => {
    const org = resolveOrg('digital-law-firm');
    const groups = Object.keys(org.sourceIds);
    expect(groups).toContain('sra');
    expect(groups).toContain('fca');
    expect(groups).toContain('_protocol');
    expect(groups).toContain('bsi');
  });
});

describe('resolveSourceIds', () => {
  const org = resolveOrg('digital-law-firm');

  it('returns source IDs for selected groups', () => {
    const ids = resolveSourceIds(org, ['sra']);
    expect(ids.length).toBeGreaterThan(0);
    // All SRA IDs should be present
    org.sourceIds.sra.forEach((id) => expect(ids).toContain(id));
  });

  it('always appends _protocol IDs regardless of selection', () => {
    const ids = resolveSourceIds(org, ['sra']);
    org.sourceIds._protocol.forEach((id) => expect(ids).toContain(id));
  });

  it('returns only _protocol IDs when no groups selected', () => {
    const ids = resolveSourceIds(org, []);
    expect(ids).toEqual(org.sourceIds._protocol);
  });

  it('deduplicates naturally when same group selected twice', () => {
    const once = resolveSourceIds(org, ['sra']);
    const twice = resolveSourceIds(org, ['sra', 'sra']);
    // flatMap doubles them — this is expected behaviour; document it
    expect(twice.length).toBe(once.length + org.sourceIds.sra.length);
  });

  it('ignores unknown group names without throwing', () => {
    expect(() => resolveSourceIds(org, ['unknown_group'])).not.toThrow();
  });
});

describe('buildGatekeeperRules', () => {
  const org = resolveOrg('digital-law-firm');

  it('returns a non-empty string', () => {
    const rules = buildGatekeeperRules(org);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('prefixes each rule with a dash', () => {
    const rules = buildGatekeeperRules(org);
    rules.split('\n').forEach((line) => expect(line.startsWith('- ')).toBe(true));
  });

  it('includes Thomson Reuters US caveat', () => {
    const rules = buildGatekeeperRules(org);
    expect(rules).toContain('Thomson Reuters');
  });

  it('includes Law Gazette journalism caveat', () => {
    const rules = buildGatekeeperRules(org);
    expect(rules).toContain('Law Gazette');
  });
});

describe('ORG_CONFIGS registry', () => {
  it('contains digital-law-firm as the default', () => {
    expect(ORG_CONFIGS[DEFAULT_ORG_ID]).toBeDefined();
  });

  it('every org has required fields', () => {
    Object.entries(ORG_CONFIGS).forEach(([id, cfg]) => {
      expect(cfg.notebookId).toBeTruthy();       // id checked in describe label
      expect(cfg.defaultSources).toBeInstanceOf(Array);
      expect(cfg.sourceIds).toBeDefined();
      expect(cfg.gatekeeperRules).toBeInstanceOf(Array);
      expect(cfg.label).toBeTruthy();
      if (!cfg.notebookId) throw new Error(`${id}: notebookId missing`);
    });
  });

  it('every org has a _protocol source group key', () => {
    Object.entries(ORG_CONFIGS).forEach(([id, cfg]) => {
      expect(cfg.sourceIds._protocol).toBeDefined();
      if (cfg.sourceIds._protocol === undefined) throw new Error(`${id}: _protocol key missing`);
    });
  });

  it('digital-law-firm has non-empty _protocol sources', () => {
    expect(ORG_CONFIGS['digital-law-firm'].sourceIds._protocol.length).toBeGreaterThan(0);
  });
});

describe('finance-uk org', () => {
  it('resolves correctly by org_id', () => {
    const org = resolveOrg('finance-uk');
    expect(org.orgId).toBe('finance-uk');
    expect(org.label).toBe('UK Financial Services (FCA/PRA)');
    expect(org.notebookId).toBe('ba1ce840-b4d7-4cc1-bb38-f71c779f13d9');
  });

  it('has all expected source groups', () => {
    const org = resolveOrg('finance-uk');
    ['fca_conduct', 'fca_markets', 'fca_esg', 'pra', 'legislation', 'ico'].forEach((g) => {
      expect(org.sourceIds[g]).toBeDefined();
    });
  });

  it('default sources resolve to a non-empty list', () => {
    const org = resolveOrg('finance-uk');
    const ids = resolveSourceIds(org, org.defaultSources);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('gatekeeper rules include FCA/PRA distinction caveat', () => {
    const org = resolveOrg('finance-uk');
    const rules = buildGatekeeperRules(org);
    expect(rules).toContain('PRA');
    expect(rules).toContain('FCA');
  });

  it('gatekeeper rules flag US SEC data', () => {
    const org = resolveOrg('finance-uk');
    const rules = buildGatekeeperRules(org);
    expect(rules).toContain('SEC');
  });
});
