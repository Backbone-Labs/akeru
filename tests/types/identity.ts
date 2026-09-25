import { createSessionClient, type SessionLease } from '@akeru/identity';
const session = createSessionClient({ origin: 'https://shell.invalid' });
const snapshot = session.snapshot();
if (snapshot.status === 'authenticated') console.log(snapshot.partition);
const lease: SessionLease = session.lease();
lease.isCurrent();
// @ts-expect-error Session snapshots do not expose credentials.
snapshot.csrfToken;
// @ts-expect-error A lease cannot choose the account.
lease.partition = 'another-account';
createSessionClient({
  origin: 'https://shell.invalid',
  // @ts-expect-error Account identifiers are not client configuration.
  userId: 'another-account',
});
session.dispose();
