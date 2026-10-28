import type { Email, EmailMessage } from './port';

export class FakeEmail implements Email {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
  }
}
