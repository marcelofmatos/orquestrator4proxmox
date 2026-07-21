export function StatusBadge({ status }: { status: string }) {
  const cls = status === 'running' ? 'running' : 'stopped';
  return <span className={`badge ${cls}`}>{status}</span>;
}
