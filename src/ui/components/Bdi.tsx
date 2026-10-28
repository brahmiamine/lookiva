const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Bdi({ children }: { children: string }) {
  return <bdi dir={EMAIL.test(children) ? 'ltr' : 'auto'}>{children}</bdi>;
}
