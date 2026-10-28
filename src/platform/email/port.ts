export type EmailMessage = { to: string; subject: string; text: string };

export interface Email {
  send(msg: EmailMessage): Promise<void>;
}
