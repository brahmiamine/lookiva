import type { ReactNode } from 'react';
import { pageLocale } from '../page-helpers';
import { requireSession } from './server-api';

// Every page of the (app) group needs a session, even one that forgets its own requireAccount() call.
export default async function AppLayout(props: { children: ReactNode; params: Promise<{ locale: string }> }) {
  await requireSession(await pageLocale(props));
  return props.children;
}
