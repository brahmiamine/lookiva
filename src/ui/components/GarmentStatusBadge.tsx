import { statusTone } from '../wardrobe';
import { Icon, type IconName } from './Icon';
import { StatusBadge } from './StatusBadge';

// The icon repeats the tone, so the state never relies on colour alone.
const ICON: Record<ReturnType<typeof statusTone>, IconName> = { success: 'check', warning: 'clock', info: 'info', danger: 'warn', neutral: 'pin' };

export function GarmentStatusBadge({ status, label }: { status: string; label: string }) {
  const tone = statusTone(status);
  return <StatusBadge tone={tone} label={label} icon={<Icon name={ICON[tone]} />} />;
}
