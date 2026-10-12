export const MEMBER_ROLES = [
  "Member",
  "Game Designer",
  "Game Developer",
  "3D Artist",
  "Writer",
  "Producer",
  "Sound Designer",
] as const;

export const MEMBER_TITLES = [
  "Creative Operator",
  "Studio Contributor",
  "Project Collaborator",
  "Community Member",
  "Guest Creator",
] as const;

export function isMemberRole(value: string): boolean {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function isMemberTitle(value: string): boolean {
  return (MEMBER_TITLES as readonly string[]).includes(value);
}
