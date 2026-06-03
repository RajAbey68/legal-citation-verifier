/**
 * Skool client tests
 *
 * buildPostPayload and buildCommentPayload are pure functions — tested
 * without any network calls.
 */

import {
  buildPostPayload,
  buildCommentPayload,
  GHOSTWRITER_TANDEM_GROUP_ID,
} from '../lib/skool/client';

describe('buildPostPayload', () => {
  it('sets post_type to "post"', () => {
    const payload = buildPostPayload({
      group_id: GHOSTWRITER_TANDEM_GROUP_ID,
      title: 'Test title',
      content: 'Test content',
    }) as Record<string, unknown>;
    expect(payload.post_type).toBe('post');
  });

  it('includes group_id at the top level', () => {
    const payload = buildPostPayload({
      group_id: 'abc123',
      title: 'T',
      content: 'C',
    }) as Record<string, unknown>;
    expect(payload.group_id).toBe('abc123');
  });

  it('nests title and content inside metadata', () => {
    const payload = buildPostPayload({
      group_id: GHOSTWRITER_TANDEM_GROUP_ID,
      title: 'My title',
      content: 'My content',
    }) as { metadata: { title: string; content: string } };
    expect(payload.metadata.title).toBe('My title');
    expect(payload.metadata.content).toBe('My content');
  });

  it('does not include root_id or parent_id', () => {
    const payload = buildPostPayload({
      group_id: GHOSTWRITER_TANDEM_GROUP_ID,
      title: 'T',
      content: 'C',
    }) as Record<string, unknown>;
    expect(payload.root_id).toBeUndefined();
    expect(payload.parent_id).toBeUndefined();
  });
});

describe('buildCommentPayload', () => {
  const comment = {
    group_id: GHOSTWRITER_TANDEM_GROUP_ID,
    root_id: 'root-abc',
    parent_id: 'root-abc',
    content: 'A comment',
  };

  it('sets post_type to "comment"', () => {
    const payload = buildCommentPayload(comment) as Record<string, unknown>;
    expect(payload.post_type).toBe('comment');
  });

  it('includes root_id and parent_id', () => {
    const payload = buildCommentPayload(comment) as Record<string, unknown>;
    expect(payload.root_id).toBe('root-abc');
    expect(payload.parent_id).toBe('root-abc');
  });

  it('sets metadata.title to empty string', () => {
    const payload = buildCommentPayload(comment) as { metadata: { title: string } };
    expect(payload.metadata.title).toBe('');
  });

  it('puts content in metadata.content', () => {
    const payload = buildCommentPayload(comment) as { metadata: { content: string } };
    expect(payload.metadata.content).toBe('A comment');
  });
});
