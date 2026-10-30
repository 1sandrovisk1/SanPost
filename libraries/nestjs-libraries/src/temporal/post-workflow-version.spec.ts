import { selectPostWorkflowVersion } from './post-workflow-version';

describe('selectPostWorkflowVersion', () => {
  it.each([
    'youtube',
    'instagram',
    'facebook',
    'linkedin',
    'linkedin-page',
    'threads',
    'zernio-tiktok',
    'zernio-youtube',
  ])('usa V112 por padrao em %s', (providerIdentifier) => {
    expect(
      selectPostWorkflowVersion({ integrationId: 'i', providerIdentifier }, {})
    ).toBe('postWorkflowV112');
  });
  it('configuracao antiga desligada nao reintroduz V102', () => {
    expect(
      selectPostWorkflowVersion(
        { integrationId: 'i', providerIdentifier: 'youtube' },
        { POST_WORKFLOW_V112_ALL: 'false' }
      )
    ).toBe('postWorkflowV112');
  });
});
