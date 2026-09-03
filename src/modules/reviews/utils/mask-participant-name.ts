export function maskParticipantName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Unknown';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? '';
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}
