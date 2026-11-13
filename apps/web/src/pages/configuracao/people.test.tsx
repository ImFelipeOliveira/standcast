import { beforeEach, describe, expect, test } from 'bun:test';
import type { PeopleLinks } from '@standcast/orchestrator';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createQueryClient, peopleQuery } from '../../api/queries';
import { applyLang } from '../../i18n';
import { PeopleTab } from './PeopleTab';

const people: PeopleLinks = {
  people: [
    {
      login: 'ana',
      teams: ['backend'],
      managerOf: [],
      chat: [{ provider: 'slack', status: 'linked', source: 'identity' }],
      tracker: [{ provider: 'linear', status: 'linked', source: 'identity' }],
      cli: true,
    },
    {
      login: 'carla',
      teams: ['plataforma'],
      managerOf: [],
      chat: [{ provider: 'google-chat', status: 'missing', source: null }],
      tracker: [],
      cli: false,
    },
    {
      login: 'diego',
      teams: ['plataforma'],
      managerOf: [],
      chat: [{ provider: 'google-chat', status: 'missing', source: null }],
      tracker: [{ provider: 'linear', status: 'missing', source: null }],
      cli: false,
    },
  ],
};

function render(data: PeopleLinks = people): string {
  const queryClient = createQueryClient();
  queryClient.setQueryData(peopleQuery(11).queryKey, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PeopleTab installationId={11} />
    </QueryClientProvider>,
  );
}

beforeEach(() => applyLang('pt-BR'));

describe('people and links', () => {
  test('summarizes missing chat links per provider with what to do', () => {
    const html = render();
    expect(html).toContain('2 pessoas sem vínculo com o Google Chat');
    expect(html).toContain('Vincular minha conta');
    expect(html).toContain('google_chat');
  });

  test('lists each person with chat, tracker and CLI status', () => {
    const html = render();
    for (const login of ['ana', 'carla', 'diego']) expect(html).toContain(`@${login}`);
    expect(html).toContain('Sem vínculo');
    expect(html).toContain('pelo login');
    expect(html).toContain('conectada');
  });

  test('no issues means no callout', () => {
    const first = people.people[0] as PeopleLinks['people'][number];
    const html = render({ people: [first] });
    expect(html).not.toContain('sem vínculo com');
  });
});
