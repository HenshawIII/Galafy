/** Whether spray receiver role qualifies for host spray push notifications (includes legacy values). */
export function isHostReceiverRole(role: string | undefined | null): boolean {
  return role === 'HOST' || role === 'CELEBRANT' || role === 'PERFORMER';
}
