import type { EmailMessage } from '@/platform/email/port';
import type { Locale } from '../domain/preferences';

type Kind = 'verify' | 'reset';

const TEXT: Record<Locale, Record<Kind, { subject: string; body: (link: string) => string }>> = {
  fr: {
    verify: {
      subject: 'Lookiva : confirmez votre adresse e-mail',
      body: (l) => `Bonjour,\n\nOuvrez ce lien pour confirmer votre adresse (valable 24 h) :\n${l}\n\nSi vous n'avez pas créé de compte Lookiva, ignorez ce message.`,
    },
    reset: {
      subject: 'Lookiva : réinitialisation du mot de passe',
      body: (l) => `Bonjour,\n\nOuvrez ce lien pour choisir un nouveau mot de passe (valable 1 h) :\n${l}\n\nToutes vos sessions seront fermées. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    },
  },
  en: {
    verify: {
      subject: 'Lookiva: confirm your email address',
      body: (l) => `Hello,\n\nOpen this link to confirm your address (valid for 24 hours):\n${l}\n\nIf you did not create a Lookiva account, ignore this message.`,
    },
    reset: {
      subject: 'Lookiva: reset your password',
      body: (l) => `Hello,\n\nOpen this link to choose a new password (valid for 1 hour):\n${l}\n\nAll your sessions will be signed out. If you did not ask for this, ignore this message.`,
    },
  },
  ar: {
    verify: {
      subject: 'Lookiva: أكّد عنوان بريدك الإلكتروني',
      body: (l) => `مرحبًا،\n\nافتح هذا الرابط لتأكيد عنوانك (صالح لمدة 24 ساعة):\n${l}\n\nإذا لم تُنشئ حسابًا على Lookiva فتجاهل هذه الرسالة.`,
    },
    reset: {
      subject: 'Lookiva: إعادة تعيين كلمة المرور',
      body: (l) => `مرحبًا،\n\nافتح هذا الرابط لاختيار كلمة مرور جديدة (صالح لمدة ساعة واحدة):\n${l}\n\nسيتم تسجيل خروجك من جميع الجلسات. إذا لم تطلب ذلك فتجاهل هذه الرسالة.`,
    },
  },
};

const PATH: Record<Kind, string> = { verify: 'verify-email', reset: 'reset-password' };

/**
 * The token travels in the URL fragment: browsers never send it to a server (no access logs, no Referer leak);
 * the slice-2 page reads it and POSTs it to the API.
 */
export function buildMail(kind: Kind, locale: Locale, to: string, origin: string, token: string): EmailMessage {
  const t = TEXT[locale][kind];
  return { to, subject: t.subject, text: t.body(`${origin}/${locale}/${PATH[kind]}#token=${token}`) };
}
